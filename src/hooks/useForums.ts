import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { escapeIlike } from '../lib/utils'
import { keys } from '../queries/keys'
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

export function useForumPosts(
  boardId: string | undefined,
  filters?: { search?: string }
) {
  const fetchPosts = async (bid: string): Promise<ForumPost[]> => {
    let query = supabase
      .from('forum_posts')
      .select('*, author:profiles(*)')
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
    return (data as any[]) || []
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
      .eq('id', pid)
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

export function useCreateForumPost() {
  const queryClient = useQueryClient()

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
    },
  })

  return { createPost: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}

export function useCreateForumReply() {
  const queryClient = useQueryClient()

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
