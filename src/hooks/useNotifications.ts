import { createSignal, createEffect, onCleanup } from 'solid-js'
import { supabase } from '../lib/supabase'
import type { Notification } from '../types'

export function useNotifications(userId: () => string | undefined) {
  const [notifications, setNotifications] = createSignal<Notification[]>([])
  const [unreadCount, setUnreadCount] = createSignal(0)
  const [loading, setLoading] = createSignal(false)

  const fetchNotifications = async (uid: string) => {
    setLoading(true)
    try {
      const { data, error } = await (supabase
        .from('notifications') as any)
        .select('*')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(20)

      if (error) throw error
      const items = (data as Notification[]) || []
      setNotifications(items)
      setUnreadCount(items.filter((n) => !n.is_read).length)
    } catch {
      // Table may not exist yet — fail silently
      setNotifications([])
      setUnreadCount(0)
    } finally {
      setLoading(false)
    }
  }

  // Fetch on userId change + subscribe to realtime inserts
  createEffect(() => {
    const uid = userId()
    if (!uid) {
      setNotifications([])
      setUnreadCount(0)
      return
    }

    fetchNotifications(uid)

    const channel = supabase
      .channel(`notifications:${uid}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${uid}`,
        },
        (payload) => {
          const newNotification = payload.new as Notification
          setNotifications((prev) => [newNotification, ...prev].slice(0, 20))
          setUnreadCount((prev) => prev + 1)
        }
      )
      .subscribe()

    onCleanup(() => {
      supabase.removeChannel(channel)
    })
  })

  return { notifications, unreadCount, loading, refetch: () => {
    const uid = userId()
    if (uid) fetchNotifications(uid)
  }}
}

export function useMarkNotificationRead() {
  const markRead = async (notificationId: string) => {
    const { error } = await (supabase
      .from('notifications') as any)
      .update({ is_read: true })
      .eq('id', notificationId)

    if (error) throw error
  }

  return { markRead }
}

export function useMarkAllRead() {
  const markAllRead = async (userId: string) => {
    const { error } = await (supabase
      .from('notifications') as any)
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false)

    if (error) throw error
  }

  return { markAllRead }
}
