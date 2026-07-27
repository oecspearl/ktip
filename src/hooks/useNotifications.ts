import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Notification } from '../types'

async function fetchNotifications(uid: string): Promise<Notification[]> {
  try {
    const { data, error } = await (supabase.from('notifications') as any)
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) throw error
    return (data as Notification[]) || []
  } catch {
    // Table may not exist yet — fail silently
    return []
  }
}

export function useNotifications(userId: string | undefined) {
  const queryClient = useQueryClient()

  const queryKey = ['notifications', userId]

  const { data, isLoading, refetch } = useQuery({
    queryKey,
    queryFn: () => fetchNotifications(userId as string),
    enabled: !!userId,
  })

  const notifications = data || []
  const unreadCount = notifications.filter((n) => !n.is_read).length

  // Subscribe to realtime inserts
  useEffect(() => {
    if (!userId) return

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const newNotification = payload.new as Notification
          queryClient.setQueryData<Notification[]>(queryKey, (prev) =>
            [newNotification, ...(prev || [])].slice(0, 20)
          )
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  return { notifications, unreadCount, loading: isLoading, refetch }
}

export function useMarkNotificationRead() {
  const markRead = async (notificationId: string) => {
    const { error } = await (supabase.from('notifications') as any)
      .update({ is_read: true })
      .eq('id', notificationId)

    if (error) throw error
  }

  return { markRead }
}

export function useMarkAllRead() {
  const markAllRead = async (userId: string) => {
    const { error } = await (supabase.from('notifications') as any)
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false)

    if (error) throw error
  }

  return { markAllRead }
}
