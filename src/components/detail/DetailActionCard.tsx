import type { ReactNode } from 'react'
import { ShareButton } from '../share/ShareButton'
import type { ShareTarget } from '../../lib/share/targets'

/**
 * The card a detail page puts beside its content: where the item stands, the
 * one thing a visitor came to do, and the Share button. Events, funding calls
 * and projects all use it, so each page has the same layout.
 *
 * Owners get their tools (edit, delete, applications) at the top of the card
 * instead of in the hero. Pages place the card first on phones and pin it
 * beside the content from `lg` up; the card itself only arranges what it is
 * handed.
 */
export function DetailActionCard({
  ownerLabel,
  ownerTools,
  title,
  sub,
  children,
  footer,
  share,
}: {
  /** Small caps label over the owner's tools, e.g. "Your event". */
  ownerLabel?: ReactNode
  /** Rendered only for the owner; leave undefined for everyone else. */
  ownerTools?: ReactNode
  title?: ReactNode
  sub?: ReactNode
  children?: ReactNode
  /** One quiet line under the actions: attendees, applications, views. */
  footer?: ReactNode
  /** Null hides the Share button (private or unpublished items). */
  share: ShareTarget | null
}) {
  // A guided-tour anchor goes on a wrapper the page writes out
  // (data-tutorial="…"): the tutorial registry test greps for the literal.
  return (
    <div className="rounded-2xl border border-ktip-sand-200 bg-ktip-cream p-5 shadow-medium">
      {ownerTools && (
        <div className="mb-4 border-b border-ktip-sand-200 pb-4">
          {ownerLabel && (
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ktip-sand-600">{ownerLabel}</p>
          )}
          <div className="flex flex-wrap gap-2">{ownerTools}</div>
        </div>
      )}

      {title && (
        <div className="min-w-0">
          <h2 className="font-display text-xl font-bold leading-tight text-ktip-sand-900">{title}</h2>
          {sub && <p className="mt-0.5 text-sm text-ktip-sand-600">{sub}</p>}
        </div>
      )}

      {children && <div className="mt-4 space-y-3">{children}</div>}

      {footer && <div className="mt-4 border-t border-ktip-sand-200 pt-3 text-sm text-ktip-sand-600">{footer}</div>}

      {share && (
        <div className="mt-4">
          <ShareButton target={share} />
        </div>
      )}
    </div>
  )
}
