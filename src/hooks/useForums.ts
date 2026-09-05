import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { escapeIlike } from '../lib/utils'
import { keys } from '../queries/keys'
import { useAchievementTrigger } from '../contexts/AchievementContext'
import { isUuid } from '../lib/slug'
import { useLingui } from '@lingui/react/macro'
import type { ForumBoard, ForumPost, ForumReply } from '../types'

export function useForumBoards() {
  const fetchBoards = async (): Promise<ForumBoard[]> => {
    const { data, error } = await supabase
      .from('forum_boards')
      .select('*')
      .order('sort_order', { ascending: true })
    if (error) throw error
    return (data as ForumBoard[]) || []
  }

  const query = useQuery({
    queryKey: keys.list('forum_boards'),
    queryFn: fetchBoards,
  })

  return { boards: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

export function useForumBoard(slug: string | undefined) {
  const fetchBoard = async (boardSlug: string): Promise<ForumBoard | null> => {
    const { data, error } = await supabase
      .from('forum_boards')
      .select('*')
      .eq('slug', boardSlug)
      .single()
    if (error) throw error
    return data as ForumBoard
  }

  const query = useQuery({
    queryKey: keys.detail('forum_boards', slug),
    queryFn: () => fetchBoard(slug as string),
    enabled: !!slug,
  })

  return { board: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

/**
 * How many threads sit on a board. Its own query rather than a field on the
 * board row: the board list selects `*`, and the delete guard needs a real
 * total — the post list is capped at 50 and would understate a busy board.
 */
export function useForumBoardPostCount(boardId: string | undefined) {
  const query = useQuery({
    queryKey: keys.sub('forum_boards', 'post-count', boardId),
    queryFn: async () => {
      const { count, error } = await supabase
        .from('forum_posts')
        .select('id', { count: 'exact', head: true })
        .eq('board_id', boardId as string)
      if (error) throw error
      return count ?? 0
    },
    enabled: !!boardId,
  })

  // null, not 0, while it loads or fails: describeForumBoardDeletion() treats
  // an unknown count as "might not be empty" and asks for the name back.
  return { postCount: query.isSuccess ? query.data : null, loading: query.isPending }
}

export function useForumPosts(
  boardId: string | undefined,
  filters?: { search?: string }
) {
  const fetchPosts = async (bid: string): Promise<ForumPost[]> => {
    // forum_replies(count) is an embedded aggregate, so the reply totals arrive
    // in the same round trip rather than one query per row. PostgREST returns
    // it as `forum_replies: [{ count }]`, flattened into reply_count below.
    let query = supabase
      .from('forum_posts')
      .select('*, author:profiles(*), forum_replies(count)')
      .eq('board_id', bid)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })

    if (filters?.search) {
      const sanitized = escapeIlike(filters.search)
      if (sanitized) {
        query = query.or(
          `title.ilike.%${sanitized}%,content.ilike.%${sanitized}%`
        )
      }
    }

    query = query.limit(50)

    const { data, error } = await query
    if (error) throw error
    return ((data as any[]) || []).map((row) => ({
      ...row,
      reply_count: row.forum_replies?.[0]?.count ?? 0,
    }))
  }

  const query = useQuery({
    queryKey: keys.list('forum_posts', { boardId, ...filters }),
    queryFn: () => fetchPosts(boardId as string),
    enabled: !!boardId,
  })

  return { posts: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

export function useForumPost(postId: string | undefined) {
  const fetchPost = async (pid: string): Promise<ForumPost | null> => {
    const { data, error } = await supabase
      .from('forum_posts')
      .select('*, author:profiles(*), board:forum_boards(*)')
      // Post slugs are unique per board, not globally — but the board segment
      // is already in the route, and a duplicate across boards would need both
      // boards to have the same title, so the slug alone is specific enough.
      .eq(isUuid(pid) ? 'id' : 'slug', pid)
      .single()
    if (error) throw error
    return data as any
  }

  const query = useQuery({
    queryKey: keys.detail('forum_posts', postId),
    queryFn: () => fetchPost(postId as string),
    enabled: !!postId,
  })

  return { post: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

export function useForumReplies(postId: string | undefined) {
  const fetchReplies = async (pid: string): Promise<ForumReply[]> => {
    const { data, error } = await supabase
      .from('forum_replies')
      .select('*, author:profiles(*)')
      .eq('post_id', pid)
      .order('created_at', { ascending: true })
    if (error) throw error
    return (data as any[]) || []
  }

  const query = useQuery({
    queryKey: keys.sub('forum_posts', 'replies', postId),
    queryFn: () => fetchReplies(postId as string),
    enabled: !!postId,
  })

  return { replies: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

export function useCreateForumBoard() {
  const { t } = useLingui()
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (data: {
      name: string
      description?: string | null
      icon?: string | null
    }) => {
      // Migration 129's INSERT policy requires created_by = auth.uid(): a board
      // filed under somebody else's name is one its author cannot then edit.
      // The slug and the sort order are assigned by the trigger, not here.
      const { data: session } = await supabase.auth.getUser()
      const createdBy = session?.user?.id
      if (!createdBy) throw new Error(t`You must be signed in to open a board`)

      const { data: board, error } = await supabase
        .from('forum_boards')
        .insert({ ...data, created_by: createdBy } as any)
        .select()
        .single()
      if (error) throw error
      return board as ForumBoard
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('forum_boards') })
    },
  })

  return { createBoard: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}

export function useUpdateForumBoard() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async ({
      boardId,
      updates,
    }: {
      boardId: string
      updates: Partial<Pick<ForumBoard, 'name' | 'description' | 'icon' | 'sort_order'>>
    }) => {
      const { data, error } = await supabase
        .from('forum_boards')
        .update(updates)
        .eq('id', boardId)
        .select()
        .single()
      if (error) throw error
      return data as ForumBoard
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('forum_boards') })
    },
  })

  const updateBoard = (
    boardId: string,
    updates: Partial<Pick<ForumBoard, 'name' | 'description' | 'icon' | 'sort_order'>>
  ) => mutation.mutateAsync({ boardId, updates })

  return { updateBoard, loading: mutation.isPending, error: mutation.error }
}

export function useDeleteForumBoard() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (boardId: string) => {
      const { error } = await supabase.from('forum_boards').delete().eq('id', boardId)
      if (error) throw error
    },
    onSuccess: () => {
      // The delete cascades to every post and reply on the board (005), so the
      // post lists go with it rather than pointing at a board that is gone.
      queryClient.invalidateQueries({ queryKey: keys.all('forum_boards') })
      queryClient.invalidateQueries({ queryKey: keys.all('forum_posts') })
    },
  })

  return { deleteBoard: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}

export function useCreateForumPost() {
  const queryClient = useQueryClient()
  const triggerCheck = useAchievementTrigger()

  const mutation = useMutation({
    mutationFn: async (data: {
      board_id: string
      author_id: string
      title: string
      content: string
    }) => {
      const { data: post, error } = await supabase
        .from('forum_posts')
        .insert(data)
        .select('*, author:profiles(*)')
        .single()
      if (error) throw error
      return post
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: keys.all('forum_posts') })
      queryClient.invalidateQueries({ queryKey: keys.detail('forum_boards', variables.board_id) })
      triggerCheck()
    },
  })

  return { createPost: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}

export function useCreateForumReply() {
  const queryClient = useQueryClient()
  const triggerCheck = useAchievementTrigger()

  const mutation = useMutation({
    mutationFn: async (data: {
      post_id: string
      author_id: string
      content: string
    }) => {
      const { data: reply, error } = await supabase
        .from('forum_replies')
        .insert(data)
        .select('*, author:profiles(*)')
        .single()
      if (error) throw error
      return reply
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: keys.sub('forum_posts', 'replies', variables.post_id) })
      triggerCheck()
    },
  })

  return { createReply: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}

export function useDeleteForumPost() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (postId: string) => {
      const { error } = await supabase
        .from('forum_posts')
        .delete()
        .eq('id', postId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('forum_posts') })
    },
  })

  return { deletePost: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}

export function useDeleteForumReply() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (replyId: string) => {
      const { error } = await supabase
        .from('forum_replies')
        .delete()
        .eq('id', replyId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.sub('forum_posts', 'replies') })
    },
  })

  return { deleteReply: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}
