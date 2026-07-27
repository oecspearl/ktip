import { createSignal, createResource, createEffect, onCleanup } from 'solid-js'
import { supabase } from '../lib/supabase'
import { escapeIlike } from '../lib/utils'
import type { Conversation, Message, Profile } from '../types'

export function useConversations(userId: () => string | undefined) {
  const fetchConversations = async (uid: string): Promise<Conversation[]> => {
    // Get conversation IDs for user
    const { data: participantRows, error: pError } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', uid)

    if (pError) throw pError
    if (!participantRows?.length) return []

    const conversationIds = participantRows.map((r) => r.conversation_id)

    // Get conversations with participants and their profiles
    const { data, error } = await supabase
      .from('conversations')
      .select('*, participants:conversation_participants(*, user:profiles(*))')
      .in('id', conversationIds)
      .order('updated_at', { ascending: false })

    if (error) throw error
    return (data as any[]) || []
  }

  const [conversations, { refetch }] = createResource(userId, fetchConversations)
  return { conversations, refetch }
}

export function useMessages(conversationId: () => string | undefined) {
  const fetchMessages = async (cid: string): Promise<Message[]> => {
    const { data, error } = await supabase
      .from('messages')
      .select('*, sender:profiles(*)')
      .eq('conversation_id', cid)
      .order('created_at', { ascending: true })
    if (error) throw error
    return (data as any[]) || []
  }

  const [messages, { refetch }] = createResource(conversationId, fetchMessages)
  return { messages, refetch }
}

export function useRealtimeMessages(
  conversationId: () => string | undefined,
  onNewMessage: (msg: Message) => void
) {
  createEffect(() => {
    const cid = conversationId()
    if (!cid) return

    const channel = supabase
      .channel(`messages:${cid}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${cid}`,
        },
        async (payload) => {
          // Fetch full message with sender profile
          const { data, error } = await supabase
            .from('messages')
            .select('*, sender:profiles(*)')
            .eq('id', payload.new.id)
            .single()
          if (error) {
            console.error('Error fetching new message:', error)
            return
          }
          if (data) onNewMessage(data as any)
        }
      )
      .subscribe()

    onCleanup(() => {
      supabase.removeChannel(channel)
    })
  })
}

export function useSendMessage() {
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const sendMessage = async (data: {
    conversation_id: string
    sender_id: string
    content: string
  }) => {
    setLoading(true)
    setError(null)
    try {
      const { data: message, error } = await supabase
        .from('messages')
        .insert(data)
        .select('*, sender:profiles(*)')
        .single()
      if (error) throw error
      return message
    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { sendMessage, loading, error }
}

export function useCreateConversation() {
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const createConversation = async (
    currentUserId: string,
    otherUserId: string
  ): Promise<string> => {
    setLoading(true)
    setError(null)
    try {
      // Check for existing conversation
      const { data: existingId } = await supabase.rpc(
        'find_conversation_between',
        { user1: currentUserId, user2: otherUserId }
      )

      if (existingId) return existingId as string

      // Create new conversation with client-generated ID
      // (avoids .select() which fails RLS before participants are added)
      const convId = crypto.randomUUID()
      const { error: convError } = await supabase
        .from('conversations')
        .insert({ id: convId })
      if (convError) throw convError

      // Add both participants
      const { error: partError } = await supabase
        .from('conversation_participants')
        .insert([
          { conversation_id: convId, user_id: currentUserId },
          { conversation_id: convId, user_id: otherUserId },
        ])
      if (partError) throw partError

      return convId
    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { createConversation, loading, error }
}

export function useSearchUsers() {
  const [loading, setLoading] = createSignal(false)

  const searchUsers = async (
    query: string,
    excludeId: string
  ): Promise<Profile[]> => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .neq('id', excludeId)
        .ilike('display_name', `%${escapeIlike(query)}%`)
        .limit(10)
      if (error) throw error
      return (data as Profile[]) || []
    } finally {
      setLoading(false)
    }
  }

  return { searchUsers, loading }
}
