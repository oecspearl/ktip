import { createSignal, createResource } from 'solid-js'
import { supabase } from '../lib/supabase'
import { escapeIlike } from '../lib/utils'
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

  const [boards, { refetch }] = createResource(fetchBoards)
  return { boards, refetch }
}

export function useForumBoard(slug: () => string | undefined) {
  const fetchBoard = async (boardSlug: string): Promise<ForumBoard | null> => {
    const { data, error } = await supabase
      .from('forum_boards')
      .select('*')
      .eq('slug', boardSlug)
      .single()
    if (error) throw error
    return data as ForumBoard
  }

  const [board, { refetch }] = createResource(slug, fetchBoard)
  return { board, refetch }
}

export function useForumPosts(
  boardId: () => string | undefined,
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

  const [posts, { refetch }] = createResource(boardId, fetchPosts)
  return { posts, refetch }
}

export function useForumPost(postId: () => string | undefined) {
  const fetchPost = async (pid: string): Promise<ForumPost | null> => {
    const { data, error } = await supabase
      .from('forum_posts')
      .select('*, author:profiles(*), board:forum_boards(*)')
      .eq('id', pid)
      .single()
    if (error) throw error
    return data as any
  }

  const [post, { refetch }] = createResource(postId, fetchPost)
  return { post, refetch }
}

export function useForumReplies(postId: () => string | undefined) {
  const fetchReplies = async (pid: string): Promise<ForumReply[]> => {
    const { data, error } = await supabase
      .from('forum_replies')
      .select('*, author:profiles(*)')
      .eq('post_id', pid)
      .order('created_at', { ascending: true })
    if (error) throw error
    return (data as any[]) || []
  }

  const [replies, { refetch }] = createResource(postId, fetchReplies)
  return { replies, refetch }
}

export function useCreateForumPost() {
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const createPost = async (data: {
    board_id: string
    author_id: string
    title: string
    content: string
  }) => {
    setLoading(true)
    setError(null)
    try {
      const { data: post, error } = await supabase
        .from('forum_posts')
        .insert(data)
        .select('*, author:profiles(*)')
        .single()
      if (error) throw error
      return post
    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { createPost, loading, error }
}

export function useCreateForumReply() {
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const createReply = async (data: {
    post_id: string
    author_id: string
    content: string
  }) => {
    setLoading(true)
    setError(null)
    try {
      const { data: reply, error } = await supabase
        .from('forum_replies')
        .insert(data)
        .select('*, author:profiles(*)')
        .single()
      if (error) throw error
      return reply
    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { createReply, loading, error }
}

export function useDeleteForumPost() {
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const deletePost = async (postId: string) => {
    setLoading(true)
    setError(null)
    try {
      const { error } = await supabase
        .from('forum_posts')
        .delete()
        .eq('id', postId)
      if (error) throw error
    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { deletePost, loading, error }
}

export function useDeleteForumReply() {
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const deleteReply = async (replyId: string) => {
    setLoading(true)
    setError(null)
    try {
      const { error } = await supabase
        .from('forum_replies')
        .delete()
        .eq('id', replyId)
      if (error) throw error
    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { deleteReply, loading, error }
}
