import { createSignal, createResource } from 'solid-js'
import { supabase } from '../lib/supabase'
import type { RegistrationFieldConfig } from '../types'

export function useRegistrationFields(eventId: () => string | undefined) {
  const fetchFields = async (id: string): Promise<RegistrationFieldConfig[]> => {
    const { data, error } = await supabase
      .from('events')
      .select('registration_fields')
      .eq('id', id)
      .single()

    if (error) throw error
    return (data?.registration_fields as RegistrationFieldConfig[]) || []
  }

  const [fields, { refetch }] = createResource(eventId, fetchFields)

  return { fields, refetch }
}

export function useUpdateRegistrationFields() {
  const [loading, setLoading] = createSignal(false)

  const updateFields = async (eventId: string, fields: RegistrationFieldConfig[]) => {
    setLoading(true)
    try {
      const { error } = await supabase
        .from('events')
        .update({ registration_fields: fields as any })
        .eq('id', eventId)

      if (error) throw error
    } finally {
      setLoading(false)
    }
  }

  return { updateFields, loading }
}

export function useSubmitRegistration() {
  const [loading, setLoading] = createSignal(false)

  const submitRegistration = async (
    eventId: string,
    userId: string,
    registrationData: Record<string, any>
  ) => {
    setLoading(true)
    try {
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
    } finally {
      setLoading(false)
    }
  }

  return { submitRegistration, loading }
}
