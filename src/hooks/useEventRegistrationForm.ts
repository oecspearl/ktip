import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import type { RegistrationFieldConfig } from '../types'

export function useRegistrationFields(eventId: string | undefined) {
  const fetchFields = async (id: string): Promise<RegistrationFieldConfig[]> => {
    const { data, error } = await supabase
      .from('events')
      .select('registration_fields')
      .eq('id', id)
      .single()

    if (error) throw error
    return (data?.registration_fields as RegistrationFieldConfig[]) || []
  }

  const query = useQuery({
    queryKey: keys.sub('events', 'registration-fields', eventId),
    queryFn: () => fetchFields(eventId as string),
    enabled: !!eventId,
  })

  return { fields: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

export function useUpdateRegistrationFields() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async ({
      eventId,
      fields,
    }: {
      eventId: string
      fields: RegistrationFieldConfig[]
    }) => {
      const { error } = await supabase
        .from('events')
        .update({ registration_fields: fields as any })
        .eq('id', eventId)

      if (error) throw error
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: keys.sub('events', 'registration-fields', variables.eventId) })
    },
  })

  const updateFields = (eventId: string, fields: RegistrationFieldConfig[]) =>
    mutation.mutateAsync({ eventId, fields })

  return { updateFields, loading: mutation.isPending, error: mutation.error }
}

export function useSubmitRegistration() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async ({
      eventId,
      userId,
      registrationData,
    }: {
      eventId: string
      userId: string
      registrationData: Record<string, any>
    }) => {
      const { data, error } = await supabase
        .from('event_rsvps')
        .insert({
          event_id: eventId,
          user_id: userId,
          registration_data: registrationData as any,
        })
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: keys.sub('events', 'registrations', variables.eventId) })
    },
  })

  const submitRegistration = (
    eventId: string,
    userId: string,
    registrationData: Record<string, any>
  ) => mutation.mutateAsync({ eventId, userId, registrationData })

  return { submitRegistration, loading: mutation.isPending, error: mutation.error }
}
