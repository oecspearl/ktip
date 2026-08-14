import { useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from '../i18n/LanguageContext'
import {
  CONSENT_BUNDLES,
  bundleVersion,
  type LegalBundle,
  type LegalDocumentKey,
} from '../lib/legal'

/** One row of get_my_consents() — the register joined against what you accepted. */
export interface ConsentRow {
  document_key: LegalDocumentKey
  title: string
  bundle: LegalBundle
  current_version: number
  effective_date: string
  accepted_version: number | null
  accepted_at: string | null
  locale: string | null
  context: string | null
  is_outstanding: boolean
}

/** Where an acceptance was collected. Mirrors the CHECK on user_consents.context. */
export type ConsentContext =
  | 'signup'
  | 'onboarding'
  | 'reconsent'
  | 'settings'
  | 'project'
  | 'event'
  | 'forum_post'
  | 'cv_publish'
  | 'org_publish'
  | 'event_solution'
  | 'grant_application'

export const consentsQueryKey = (userId: string | undefined) => ['consents', userId] as const

/**
 * What this member has and has not accepted.
 *
 * `staleTime: Infinity` because the answer only changes when a new version is
 * deployed or when this member accepts something — the first is handled by
 * ensure_my_consent_state() once per session, the second by invalidating here.
 * Polling would be one request per page for data that moves a few times a year.
 *
 * AuthProvider registers this same key, so a page calling this reads it out of
 * cache with no request of its own. That is what keeps the publishing gate from
 * costing a round trip on every create form.
 */
export function useConsents() {
  const auth = useAuth()

  return useQuery({
    queryKey: consentsQueryKey(auth.user?.id),
    queryFn: async (): Promise<ConsentRow[]> => {
      // Cast: src/types/database.ts is hand-written and does not list RPCs.
      const { data, error } = await (supabase as any).rpc('get_my_consents')
      if (error) throw error
      return (data as ConsentRow[]) ?? []
    },
    enabled: !!auth.user?.id,
    staleTime: Infinity,
    retry: 1,
  })
}

/**
 * Records an acceptance and refreshes the cached consent state.
 *
 * Note what is NOT sent: the version. `record_consent` reads it from the
 * register server-side, and `p_expected_version` is only a cross-check that
 * fails loudly when a stale browser chunk is a version behind a deploy.
 */
export function useRecordConsent() {
  const auth = useAuth()
  const queryClient = useQueryClient()
  const { uiLang } = useLanguage()

  return useMutation({
    mutationFn: async ({
      keys,
      context,
      expectedVersion,
    }: {
      keys: LegalDocumentKey[]
      context: ConsentContext
      expectedVersion?: number
    }) => {
      const { data, error } = await (supabase as any).rpc('record_consent', {
        p_keys: keys,
        p_locale: uiLang,
        p_context: context,
        p_user_agent: typeof navigator === 'undefined' ? null : navigator.userAgent,
        p_expected_version: expectedVersion ?? null,
      })
      if (error) throw error
      if (data?.ok !== true) {
        // Surfaced rather than swallowed: 'version_mismatch' means the member is
        // looking at text older than what is in force, and silently accepting
        // that would record consent to something they were never shown.
        throw new Error(String(data?.reason ?? 'consent_failed'))
      }
      return data as { ok: true; recorded: number }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: consentsQueryKey(auth.user?.id) }),
        // requires_consent lives on the profile, and ProtectedRoute reads it.
        queryClient.invalidateQueries({ queryKey: ['profile', auth.user?.id] }),
      ])
    },
  })
}

export interface AgreementGate {
  /** True while the consent state is still in flight. Do not gate on an unknown. */
  loading: boolean
  /** True when at least one document in this bundle is unaccepted at its current version. */
  needsAgreement: boolean
  outstanding: ConsentRow[]
  accept: (context: ConsentContext) => Promise<void>
  accepting: boolean
  error: Error | null
}

/**
 * The gate behind every "you are about to publish this" moment.
 *
 * "Fires once per version" is not implemented here — it falls out of the
 * UNIQUE (user_id, document_key, version) constraint in migration 115 and the
 * `is_outstanding` flag get_my_consents() derives from it. This hook only reads
 * that answer, which is why a version bump re-prompts with no code change.
 */
export function useAgreementGate(bundle: Exclude<LegalBundle, 'informational'>): AgreementGate {
  const { data, isPending } = useConsents()
  const record = useRecordConsent()

  const outstanding = (data ?? []).filter((row) => row.bundle === bundle && row.is_outstanding)

  const accept = useCallback(
    async (context: ConsentContext) => {
      await record.mutateAsync({
        keys: CONSENT_BUNDLES[bundle] as LegalDocumentKey[],
        context,
        expectedVersion: bundleVersion(bundle),
      })
    },
    [bundle, record]
  )

  return {
    loading: isPending,
    // Never gate while the answer is unknown. A false positive here blocks a
    // member who has already agreed; a false negative only means the gate fires
    // one submit later, once the query resolves.
    needsAgreement: !isPending && outstanding.length > 0,
    outstanding,
    accept,
    accepting: record.isPending,
    error: record.error as Error | null,
  }
}
