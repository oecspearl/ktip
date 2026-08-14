import { Info } from 'lucide-react'
import type { EngagementVerdict } from '../../lib/engagement'
import { Trans } from '@lingui/react/macro'

/**
 * Why the Apply / Request / Register button is not there (migration 111).
 *
 * The point of computing the engagement rule in the browser at all is this
 * panel: row-level security can refuse a write, but it cannot name the
 * organisation that refused it, and a button that silently vanishes produces a
 * support ticket rather than the conversation the switch exists to enable.
 *
 * Two sentences, never one. `org_switch` is about the account and has a fix the
 * reader can act on; `item_closed` is about the item and is usually a
 * conflict-of-interest exclusion. Telling someone in the second case that their
 * account is restricted would be both false and alarming.
 *
 * Informational tone, matching the neighbouring "This grant is currently
 * inactive" block — nothing has gone wrong here.
 */
export function EngagementNotice({ verdict }: { verdict: EngagementVerdict }) {
  if (verdict.allowed) return null

  return (
    <div className="flex items-start gap-3 rounded-xl border border-ktip-sand-200 bg-ktip-sand-50 p-4 text-ktip-sand-700">
      <Info size={18} className="mt-0.5 shrink-0" />
      <p className="text-sm">
        {verdict.reason === 'item_closed' ? (
          <Trans>
            {verdict.employerName} has closed this one to its own team. Everyone else can still
            take part.
          </Trans>
        ) : (
          <Trans>
            {verdict.employerName} has turned this off for its team. Ask an owner or admin of your
            organisation to turn it back on.
          </Trans>
        )}
      </p>
    </div>
  )
}
