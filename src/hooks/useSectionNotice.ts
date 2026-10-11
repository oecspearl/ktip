import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
// The manifest, not the index: the messaging panel mounts on every page.
import { LEGAL_MANIFEST } from '../lib/legal/manifest'
import type { LegalDocumentKey } from '../lib/legal/types'

/** Mirrors the CHECK on member_notice_acks.notice_key (171). */
export type SectionNoticeKey = 'forums' | 'messaging'

/** Which documents each notice summarises. */
export const SECTION_NOTICE_DOCS: Record<SectionNoticeKey, LegalDocumentKey[]> = {
  forums: ['acceptable-use', 'safeguarding'],
  messaging: ['acceptable-use', 'safeguarding'],
}

/**
 * 'acceptable-use@1,safeguarding@1'. A revision to either document changes the
 * string, no stored row matches it, and the notice shows once more.
 */
export function noticeSignature(key: SectionNoticeKey): string {
  return SECTION_NOTICE_DOCS[key]
    .map((doc) => `${doc}@${LEGAL_MANIFEST.find((d) => d.key === doc)?.version ?? 0}`)
    .join(',')
}

/**
 * Has this member already seen the forum or messaging notice (171)?
 *
 * `pending` is true until the answer is known, so a caller never flashes the
 * notice at someone who acknowledged it last week. Signed-out readers get
 * `shouldShow: false`: the notice is about taking part, and they cannot.
 */
export function useSectionNotice(key: SectionNoticeKey) {
  const auth = useAuth()
  const queryClient = useQueryClient()
  const userId = auth.user?.id
  const signature = noticeSignature(key)
  const queryKey = ['section-notice', userId, key, signature] as const

  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await (supabase as any)
        .from('member_notice_acks')
        .select('notice_key')
        .eq('user_id', userId)
        .eq('notice_key', key)
        .eq('signature', signature)
        .maybeSingle()
      if (error) throw error
      return !!data
    },
    enabled: !!userId,
    staleTime: Infinity,
    retry: 1,
  })

  const acknowledge = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from('member_notice_acks')
        .upsert(
          { user_id: userId, notice_key: key, signature },
          { onConflict: 'user_id,notice_key,signature', ignoreDuplicates: true }
        )
      if (error) throw error
    },
    // Hidden at once, whatever the network does. If the write fails the member
    // sees the notice again next visit, which is the safe direction to fail in.
    onMutate: () => queryClient.setQueryData(queryKey, true),
  })

  return {
    pending: !!userId && query.isPending,
    // A failed read hides the notice rather than nagging on every visit while
    // 171 is not yet applied.
    shouldShow: !!userId && query.isSuccess && query.data === false,
    acknowledge: () => acknowledge.mutate(),
  }
}
