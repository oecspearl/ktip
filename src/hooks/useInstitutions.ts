import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLingui } from '@lingui/react/macro'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import type {
  Country,
  Institution,
  InstitutionKind,
  InstitutionMember,
  InstitutionStatus,
  StudentSafeguarding,
} from '../types'

/** OECS member states sort first — 058 seeds them with sort_order 10. */
export function useCountries(oecsOnly = false) {
  const query = useQuery({
    queryKey: keys.list('countries', { oecsOnly }),
    queryFn: async (): Promise<Country[]> => {
      let request = (supabase as any)
        .from('countries')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true })

      if (oecsOnly) request = request.eq('is_oecs_member', true)

      const { data, error } = await request
      if (error) throw error
      return (data as Country[]) || []
    },
    staleTime: 60 * 60_000,
  })

  return { countries: query.data, loading: query.isPending, error: query.error }
}

export function useInstitutions(filters?: {
  kind?: InstitutionKind
  status?: InstitutionStatus
  countryCode?: string
}) {
  const query = useQuery({
    queryKey: keys.list('institutions', filters),
    queryFn: async (): Promise<Institution[]> => {
      let request = (supabase as any)
        .from('institutions')
        .select('*, country:countries!country_code(*)')
        .order('name', { ascending: true })

      if (filters?.kind) request = request.eq('kind', filters.kind)
      if (filters?.status) request = request.eq('status', filters.status)
      if (filters?.countryCode) request = request.eq('country_code', filters.countryCode)

      const { data, error } = await request
      if (error) throw error
      return (data as Institution[]) || []
    },
  })

  return {
    institutions: query.data,
    loading: query.isPending,
    error: query.error,
    refetch: query.refetch,
  }
}

export function useRegisterInstitution() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (params: {
      name: string
      kind: InstitutionKind
      countryCode: string
      emailDomains: string[]
      contactEmail?: string
      websiteUrl?: string
      createdBy: string
    }) => {
      const slug = params.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60)

      const { data, error } = await (supabase as any)
        .from('institutions')
        .insert({
          slug: `${slug}-${params.countryCode.toLowerCase()}`,
          name: params.name,
          kind: params.kind,
          country_code: params.countryCode.toUpperCase(),
          // Domains are stored bare and lowercase; request_student_verification
          // compares them against the domain part of the caller's email.
          email_domains: params.emailDomains.map((d) =>
            d.trim().toLowerCase().replace(/^@/, '')
          ),
          contact_email: params.contactEmail?.trim().toLowerCase() || null,
          website_url: params.websiteUrl || null,
          status: 'pending',
          created_by: params.createdBy,
        })
        .select()
        .single()

      if (error) throw error
      return data as Institution
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('institutions') })
    },
  })

  return {
    registerInstitution: mutation.mutateAsync,
    loading: mutation.isPending,
    error: mutation.error,
  }
}

export function useReviewInstitution() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (params: {
      institutionId: string
      approve: boolean
      reviewerId: string
      note?: string
      emailDomains?: string[]
    }) => {
      const { error } = await (supabase as any)
        .from('institutions')
        .update({
          status: params.approve ? 'verified' : 'rejected',
          verified_by: params.approve ? params.reviewerId : null,
          verified_at: params.approve ? new Date().toISOString() : null,
          review_note: params.note || null,
          ...(params.emailDomains ? { email_domains: params.emailDomains } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.institutionId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('institutions') })
    },
  })

  return {
    reviewInstitution: mutation.mutateAsync,
    loading: mutation.isPending,
    error: mutation.error,
  }
}

export function useInstitutionMembers(institutionId: string | undefined, status?: string) {
  const query = useQuery({
    queryKey: keys.sub('institution-members', status || 'all', institutionId),
    queryFn: async (): Promise<InstitutionMember[]> => {
      let request = (supabase as any)
        .from('institution_members')
        .select('*, user:profiles!user_id(*)')
        .eq('institution_id', institutionId)
        .order('created_at', { ascending: false })

      if (status) request = request.eq('status', status)

      const { data, error } = await request
      if (error) throw error
      return (data as InstitutionMember[]) || []
    },
    enabled: !!institutionId,
  })

  return {
    members: query.data,
    loading: query.isPending,
    error: query.error,
    refetch: query.refetch,
  }
}

/**
 * Approve or reject a roster entry. This is the only path that grants the
 * student role — the profiles guard trigger blocks a self-grant, so the RPC
 * does it under a transaction-local bypass.
 */
export function useReviewInstitutionMember() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (params: { memberId: string; approve: boolean; role?: string }) => {
      const { data, error } = await (supabase as any).rpc('review_institution_member', {
        p_member: params.memberId,
        p_approve: params.approve,
        p_role: params.role ?? null,
      })

      if (error) throw error
      if (data && data.ok === false) {
        throw new Error(
          data.reason === 'forbidden'
            ? 'You do not have permission to review this member.'
            : 'Member not found.'
        )
      }
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('institution-members') })
      queryClient.invalidateQueries({ queryKey: keys.all('role-members') })
    },
  })

  return {
    reviewMember: mutation.mutateAsync,
    loading: mutation.isPending,
    error: mutation.error,
  }
}

/** The current user's safeguarding record, if they are a student. */
export function useMyStudentRecord(userId: string | undefined) {
  const query = useQuery({
    queryKey: keys.sub('student-safeguarding', 'mine', userId),
    queryFn: async (): Promise<StudentSafeguarding | null> => {
      const { data, error } = await (supabase as any)
        .from('student_safeguarding')
        .select('*, institution:institutions!institution_id(*)')
        .eq('user_id', userId)
        .maybeSingle()

      if (error) throw error
      return (data as StudentSafeguarding) || null
    },
    enabled: !!userId,
  })

  return { record: query.data, loading: query.isPending, refetch: query.refetch }
}

/**
 * Ask to be recognised as a student of whichever verified institution owns the
 * account's email domain. Grants nothing by itself — an educator approves.
 */
export function useRequestStudentVerification() {
  const { t } = useLingui()
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc('request_student_verification')
      if (error) throw error
      if (data && data.ok === false) {
        const domain = data.domain
        const messages: Record<string, string> = {
          unauthenticated: t`You must be signed in.`,
          no_email: t`No email address is attached to this account.`,
          domain_not_recognised: t`No verified institution owns @${domain}. Ask your school to register on KTiP.`,
        }
        throw new Error(messages[data.reason] || t`Verification request failed.`)
      }
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('student-safeguarding') })
    },
  })

  return {
    requestVerification: mutation.mutateAsync,
    loading: mutation.isPending,
    error: mutation.error,
  }
}

/** Chamber-scoped SME verification. Country is enforced server-side. */
export function useChamberVerifyEmployer() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (params: {
      employerId: string
      status: 'pending' | 'verified' | 'rejected' | 'revoked'
      registrationNumber?: string
      note?: string
    }) => {
      const { data, error } = await (supabase as any).rpc('set_employer_verification_by_chamber', {
        p_employer: params.employerId,
        p_status: params.status,
        p_registration_number: params.registrationNumber ?? null,
        p_note: params.note ?? null,
      })

      if (error) throw error
      if (data && data.ok === false) {
        const messages: Record<string, string> = {
          forbidden: 'You are not a Chamber of Commerce reviewer.',
          wrong_country: `This business is registered in ${data.country}, outside your Chamber's jurisdiction.`,
          bad_status: 'Invalid verification status.',
          not_found: 'Business not found.',
        }
        throw new Error(messages[data.reason] || 'Verification failed.')
      }
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('employers') })
    },
  })

  return {
    verifyEmployer: mutation.mutateAsync,
    loading: mutation.isPending,
    error: mutation.error,
  }
}

/** Countries the signed-in user may vet SMEs for; empty for non-chamber users. */
export function useChamberCountries(userId: string | undefined) {
  const query = useQuery({
    queryKey: keys.sub('chamber-countries', 'mine', userId),
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await (supabase as any).rpc('chamber_countries', { p_user: userId })
      if (error) throw error
      return (data as string[]) || []
    },
    enabled: !!userId,
    staleTime: 5 * 60_000,
  })

  return { countries: query.data ?? [], loading: query.isPending }
}
