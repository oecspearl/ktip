import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { escapeIlike } from '../lib/utils'
import { keys } from '../queries/keys'
import type { Conversation, Message, Profile } from '../types'

async function fetchConversations(uid: string): Promise<Conversation[]> {
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

export function useConversations(userId: string | undefined) {
  const query = useQuery({
    queryKey: keys.sub('messages', 'conversations', userId),
    queryFn: () => fetchConversations(userId as string),
    enabled: !!userId,
  })

  return { conversations: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

async function fetchMessages(cid: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*, sender:profiles(*)')
    .eq('conversation_id', cid)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data as any[]) || []
}

export function useMessages(conversationId: string | undefined) {
  const query = useQuery({
    queryKey: keys.sub('messages', 'thread', conversationId),
    queryFn: () => fetchMessages(conversationId as string),
    enabled: !!conversationId,
  })

  return { messages: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

export function useRealtimeMessages(
  conversationId: string | undefined,
  onNewMessage?: (msg: Message) => void
) {
  const queryClient = useQueryClient()
  // Keep the latest callback in a ref so the effect doesn't need to
  // resubscribe every time the caller passes a new function identity.
  const onNewMessageRef = useRef(onNewMessage)
  onNewMessageRef.current = onNewMessage

  useEffect(() => {
    const cid = conversationId
    if (!cid) return

    const threadKey = keys.sub('messages', 'thread', cid)

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
          if (!data) return

          const msg = data as any as Message

          // Dedupe by id — StrictMode double-mounts effects in dev, and a
          // channel resubscribe race could otherwise append the same row twice.
          queryClient.setQueryData<Message[]>(threadKey, (old) => {
            if (!old) return [msg]
            if (old.some((m) => (m as any).id === (msg as any).id)) return old
            return [...old, msg]
          })

          onNewMessageRef.current?.(msg)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, queryClient])
}

export function useSendMessage() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (data: {
      conversation_id: string
      sender_id: string
      content: string
    }) => {
      const { data: message, error } = await supabase
        .from('messages')
        .insert(data)
        .select('*, sender:profiles(*)')
        .single()
      if (error) throw error
      return message
    },
    onSuccess: (message, vars) => {
      // Append to the thread cache directly — invalidating ['messages']
      // refetched the entire thread plus the conversations list on every send,
      // when realtime and this response already carry the new row.
      const msg = message as any as Message
      queryClient.setQueryData<Message[]>(
        keys.sub('messages', 'thread', vars.conversation_id),
        (old) => {
          if (!old) return [msg]
          if (old.some((m) => (m as any).id === (msg as any).id)) return old
          return [...old, msg]
        }
      )
      // The sidebar only needs its ordering/preview refreshed.
      queryClient.invalidateQueries({
        queryKey: keys.sub('messages', 'conversations', vars.sender_id),
      })
    },
  })

  return { sendMessage: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}

export function useCreateConversation() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async ({
      currentUserId,
      otherUserId,
    }: {
      currentUserId: string
      otherUserId: string
    }): Promise<string> => {
      // Check for existing conversation
      const { data: existingId } = await supabase.rpc(
        'find_conversation_between',
        { user1: currentUserId, user2: otherUserId }
      )

      if (existingId) return existingId as string

      // Safeguarding: a 1-to-1 thread may never contain a school-verified
      // student. RLS refuses it either way (064), but the raw policy violation
      // reads as a generic permission error, so name the actual reason here.
      const { data: parties } = await (supabase as any)
        .from('profiles')
        .select('id, roles, profile_visibility')
        .in('id', [currentUserId, otherUserId])

      const studentInvolved = (parties || []).some((p: any) => (p.roles || []).includes('student'))
      if (studentInvolved) {
        throw new Error(
          'Direct messages with student accounts are not available. Use a supervised group channel with a designated educator instead.'
        )
      }

      // Privacy (083). Same reasoning as the student check above: the
      // conversation_participants policy refuses this anyway, but a raw policy
      // violation reads as "something went wrong" when the actual answer is
      // "ask them first", which is a thing the member can act on.
      const recipient = (parties || []).find((p: any) => p.id === otherUserId)
      if (recipient?.profile_visibility === 'private') {
        const { data: accepted } = await (supabase as any)
          .from('connections')
          .select('id')
          .eq('status', 'accepted')
          .or(
            `and(requester_id.eq.${currentUserId},addressee_id.eq.${otherUserId}),` +
              `and(requester_id.eq.${otherUserId},addressee_id.eq.${currentUserId})`
          )
          .limit(1)

        if (!accepted?.length) {
          throw new Error(
            'This member only accepts messages from their connections. Send them a connection request first.'
          )
        }
      }

      // Create new conversation with client-generated ID
      // (avoids .select() which fails RLS before participants are added)
      const convId = crypto.randomUUID()
      const { error: convError } = await (supabase as any)
        .from('conversations')
        .insert({ id: convId, created_by: currentUserId })
      if (convError) throw convError

      // Add both participants (RLS: self-insert + creator-adds-others)
      const { error: partError } = await supabase
        .from('conversation_participants')
        .insert([
          { conversation_id: convId, user_id: currentUserId },
          { conversation_id: convId, user_id: otherUserId },
        ])
      if (partError) throw partError

      return convId
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('messages') })
    },
  })

  const createConversation = (currentUserId: string, otherUserId: string) =>
    mutation.mutateAsync({ currentUserId, otherUserId })

  return { createConversation, loading: mutation.isPending, error: mutation.error }
}

export function useCreateGroupConversation() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async ({
      creatorId,
      participantIds,
      name,
    }: {
      creatorId: string
      participantIds: string[]
      name: string
    }): Promise<string> => {
      const convId = crypto.randomUUID()
      const { error: convError } = await (supabase as any)
        .from('conversations')
        .insert({ id: convId, name: name.trim(), is_group: true, created_by: creatorId })
      if (convError) throw convError

      const rows = [
        { conversation_id: convId, user_id: creatorId, role: 'admin' },
        ...participantIds
          .filter((id) => id !== creatorId)
          .map((id) => ({ conversation_id: convId, user_id: id, role: 'member' })),
      ]
      const { error: partError } = await (supabase as any)
        .from('conversation_participants')
        .insert(rows)
      if (partError) throw partError

      return convId
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('messages') })
    },
  })

  const createGroupConversation = (creatorId: string, participantIds: string[], name: string) =>
    mutation.mutateAsync({ creatorId, participantIds, name })

  return { createGroupConversation, loading: mutation.isPending, error: mutation.error }
}

export function useGroupConversationMutations() {
  const queryClient = useQueryClient()

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: keys.all('messages') })
  }

  const renameMutation = useMutation({
    mutationFn: async ({ conversationId, name }: { conversationId: string; name: string }) => {
      const { error } = await (supabase as any)
        .from('conversations')
        .update({ name: name.trim() })
        .eq('id', conversationId)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const addMemberMutation = useMutation({
    mutationFn: async ({ conversationId, userId }: { conversationId: string; userId: string }) => {
      const { error } = await (supabase as any)
        .from('conversation_participants')
        .insert({ conversation_id: conversationId, user_id: userId, role: 'member' })
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const removeMemberMutation = useMutation({
    mutationFn: async (participantId: string) => {
      const { error } = await supabase
        .from('conversation_participants')
        .delete()
        .eq('id', participantId)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return {
    renameGroup: (conversationId: string, name: string) =>
      renameMutation.mutateAsync({ conversationId, name }),
    addMember: (conversationId: string, userId: string) =>
      addMemberMutation.mutateAsync({ conversationId, userId }),
    removeMember: removeMemberMutation.mutateAsync,
    loading: renameMutation.isPending || addMemberMutation.isPending || removeMemberMutation.isPending,
    error: renameMutation.error || addMemberMutation.error || removeMemberMutation.error,
  }
}

export function useSearchUsers() {
  const mutation = useMutation({
    mutationFn: async ({
      query,
      excludeId,
    }: {
      query: string
      excludeId: string
    }): Promise<Profile[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .neq('id', excludeId)
        .ilike('display_name', `%${escapeIlike(query)}%`)
        .limit(10)
      if (error) throw error
      return (data as Profile[]) || []
    },
  })

  const searchUsers = (query: string, excludeId: string) =>
    mutation.mutateAsync({ query, excludeId })

  return { searchUsers, loading: mutation.isPending }
}
