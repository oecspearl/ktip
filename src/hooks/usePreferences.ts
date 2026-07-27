import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import type { NotificationPreferences } from '../types'

export const DEFAULT_NOTIFICATION_PREFERENCES: Omit<NotificationPreferences, 'user_id' | 'updated_at'> = {
  email: true,
  messages: true,
  events: true,
  projects: true,
  forums: true,
  collaboration: true,
  connections: true,
}

/**
 * Notification preferences stored in the notification_preferences
 * table (enforced by a DB trigger on notifications). Returns
 * defaults when the user has no row yet.
 */
export function useMyPreferences(userId: string | undefined) {
  const fetchPreferences = async (uid: string): Promise<NotificationPreferences> => {
    const { data, error } = await (supabase as any)
      .from('notification_preferences')
      .select('*')
      .eq('user_id', uid)
      .maybeSingle()

    if (error) throw error
    if (data) return data as NotificationPreferences
    return {
      user_id: uid,
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      updated_at: new Date().toISOString(),
    }
  }

  const query = useQuery({
    queryKey: keys.detail('preferences', userId),
    queryFn: () => fetchPreferences(userId as string),
    enabled: !!userId,
  })

  return { preferences: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

export function useSavePreferences() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (params: {
      userId: string
      updates: Partial<Omit<NotificationPreferences, 'user_id' | 'updated_at'>>
    }) => {
      const { data, error } = await (supabase as any)
        .from('notification_preferences')
        .upsert({ user_id: params.userId, ...params.updates })
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('preferences') })
    },
  })

  const savePreferences = (
    userId: string,
    updates: Partial<Omit<NotificationPreferences, 'user_id' | 'updated_at'>>
  ) => mutation.mutateAsync({ userId, updates })

  return { savePreferences, loading: mutation.isPending, error: mutation.error }
}
