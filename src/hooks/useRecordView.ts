import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { RankableEntity } from '../lib/personalization'

/**
 * Count one detail-page view (migration 153).
 *
 * Fire-and-forget: the RPC dedupes per viewer per day server-side, refuses ids
 * that are not visible, and files anonymous traffic under the nil UUID, so
 * this needs no consent gate — there is no identifier in it that
 * analytics_events does not already carry, and popularity is the one signal
 * that is supposed to include everybody. Failures are swallowed: a missing
 * migration must not turn a detail page red.
 */
export function useRecordView(entity: RankableEntity, id: string | null | undefined) {
  useEffect(() => {
    if (!id) return
    void (supabase as any)
      .rpc('record_content_view', { p_entity: entity, p_id: id })
      .then(() => undefined, () => undefined)
  }, [entity, id])
}
