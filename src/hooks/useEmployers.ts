import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import type {
  ApiClient,
  Country,
  Employer,
  EmployerVerificationEvent,
  EmployerVerificationMethod,
  EmployerVerificationStatus,
} from '../types'

/** Reference data for the address hierarchy — countries first, then everything else. */
export function useCountries() {
  const query = useQuery({
    queryKey: keys.list('countries'),
    queryFn: async (): Promise<Country[]> => {
      const { data, error } = await (supabase as any)
        .from('countries')
        .select('code,name,is_oecs_member,sort_order')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true })
      if (error) throw error
      return (data as Country[]) || []
    },
    // Seeded by migration; it does not change during a session.
    staleTime: Infinity,
  })

  return { countries: query.data, loading: query.isPending, error: query.error }
}

export function useAdminEmployers(filters?: { status?: string; search?: string }) {
  const query = useQuery({
    queryKey: keys.list('admin-employers', filters),
    queryFn: async (): Promise<Employer[]> => {
      let q = (supabase as any)
        .from('employers')
        .select('*, country:countries(code,name,is_oecs_member,sort_order)')
        .order('updated_at', { ascending: false })

      if (filters?.status) q = q.eq('verification_status', filters.status)
      if (filters?.search?.trim()) {
        const term = filters.search.trim().replace(/[%_,()]/g, '')
        if (term) q = q.or(`legal_name.ilike.%${term}%,trading_name.ilike.%${term}%`)
      }

      const { data, error } = await q
      if (error) throw error
      return (data as Employer[]) || []
    },
  })

  return { employers: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

export function useEmployerVerificationHistory(employerId: string | undefined) {
  const query = useQuery({
    queryKey: keys.sub('admin-employers', 'history', employerId),
    enabled: !!employerId,
    queryFn: async (): Promise<EmployerVerificationEvent[]> => {
      const { data, error } = await (supabase as any)
        .from('employer_verification_events')
        .select('*')
        .eq('employer_id', employerId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data as EmployerVerificationEvent[]) || []
    },
  })

  return { events: query.data, loading: query.isPending }
}

export type EmployerFormValues = {
  slug: string
  legal_name: string
  trading_name: string | null
  industry: string | null
  website_url: string | null
  logo_url: string | null
  description: string | null
  country_code: string
  administrative_area: string | null
  locality: string | null
  address_line1: string | null
  address_line2: string | null
  postal_code: string | null
  contact_email: string
  contact_phone: string | null
}

export function useEmployerMutations() {
  const queryClient = useQueryClient()

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: keys.all('admin-employers') })
  }

  const createMutation = useMutation({
    mutationFn: async (values: EmployerFormValues) => {
      const { data, error } = await (supabase as any)
        .from('employers')
        .insert({ ...values, contact_email: values.contact_email.trim().toLowerCase() })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<EmployerFormValues> }) => {
      const payload = { ...updates }
      if (payload.contact_email) payload.contact_email = payload.contact_email.trim().toLowerCase()
      const { data, error } = await (supabase as any)
        .from('employers')
        .update(payload)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })

  /**
   * Status changes go through the RPC, never a direct UPDATE. The function
   * stamps verified_at/verified_by, writes the audit row and withdraws external
   * sharing in one transaction — doing it from here in three calls is exactly
   * the half-applied-state bug that useVerification.ts has today.
   */
  const setVerificationMutation = useMutation({
    mutationFn: async (args: {
      id: string
      status: EmployerVerificationStatus
      method?: EmployerVerificationMethod | null
      note?: string | null
      registration_number?: string | null
    }) => {
      const { data, error } = await (supabase as any).rpc('set_employer_verification', {
        p_employer_id: args.id,
        p_status: args.status,
        p_method: args.method ?? null,
        p_note: args.note ?? null,
        p_registration_number: args.registration_number ?? null,
      })
      if (error) throw error
      const result = data as { ok: boolean; reason?: string } | null
      if (!result?.ok) throw new Error(result?.reason || 'Verification update failed')
      return result
    },
    onSuccess: (_r, args) => {
      invalidate()
      queryClient.invalidateQueries({ queryKey: keys.sub('admin-employers', 'history', args.id) })
    },
  })

  /**
   * The consent gate for the outbound feed. Kept separate from verification so
   * neither can be flipped by accident while editing the other, and refused
   * outright unless the employer is verified — the API would ignore the flag,
   * but a UI that lets you set an ineffective toggle teaches the wrong thing.
   */
  const setSharingMutation = useMutation({
    mutationFn: async ({ employer, share }: { employer: Employer; share: boolean }) => {
      if (share && employer.verification_status !== 'verified') {
        throw new Error('Verify the employer before sharing it externally')
      }
      const { error } = await (supabase as any)
        .from('employers')
        .update({ share_externally: share })
        .eq('id', employer.id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('employers').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return {
    createEmployer: createMutation.mutateAsync,
    updateEmployer: (id: string, updates: Partial<EmployerFormValues>) =>
      updateMutation.mutateAsync({ id, updates }),
    setVerification: setVerificationMutation.mutateAsync,
    setSharing: (employer: Employer, share: boolean) =>
      setSharingMutation.mutateAsync({ employer, share }),
    deleteEmployer: deleteMutation.mutateAsync,
    loading:
      createMutation.isPending ||
      updateMutation.isPending ||
      setVerificationMutation.isPending ||
      setSharingMutation.isPending ||
      deleteMutation.isPending,
  }
}

// ---------------------------------------------------------------------------
// Partner API keys
// ---------------------------------------------------------------------------
// These go through /api/admin/api-clients rather than PostgREST: api_clients has
// RLS on with zero policies, so the browser cannot read or write it at all. Key
// hashes are not something a signed-in session should be able to SELECT.

const getAuthHeader = async () => {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Not authenticated')
  return `Bearer ${session.access_token}`
}

async function callApiClients<T>(body: Record<string, unknown>): Promise<T> {
  const auth = await getAuthHeader()
  const res = await fetch('/api/admin/api-clients', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || 'Request failed')
  return json as T
}

export function useApiClients() {
  const query = useQuery({
    queryKey: keys.list('api-clients'),
    queryFn: async () => {
      const { clients } = await callApiClients<{ clients: ApiClient[] }>({ action: 'list' })
      return clients
    },
  })

  return { clients: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

export function useApiClientMutations() {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: keys.all('api-clients') })

  const createMutation = useMutation({
    mutationFn: (args: { name: string; scopes: string[] }) =>
      // The plaintext key comes back exactly once, here. It is never persisted
      // client-side — the caller shows it and drops it.
      callApiClients<{ client: ApiClient; key: string; warning: string }>({
        action: 'create',
        ...args,
      }),
    onSuccess: invalidate,
  })

  const revokeMutation = useMutation({
    mutationFn: (id: string) => callApiClients<{ success: true }>({ action: 'revoke', id }),
    onSuccess: invalidate,
  })

  return {
    createApiClient: createMutation.mutateAsync,
    revokeApiClient: revokeMutation.mutateAsync,
    loading: createMutation.isPending || revokeMutation.isPending,
  }
}
