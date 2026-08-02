import { Moon, X } from 'lucide-react'
import { cn } from '../../lib/utils'
import { VENUE } from '../../lib/constants'

interface VenueAwayBannerProps {
  /** True while the idle timer, not the member, is what set "Away". */
  stillAway: boolean
  /** Set the member back to Working — also what clicking the banner does. */
  onResume: () => void
  /** Leave the dot grey and stop saying so. */
  onDismiss: () => void
  className?: string
}

/**
 * Why your dot went grey.
 *
 * The idle rule is invisible by design — it fires in a tab nobody is looking
 * at — so the first anyone learns of it is a grey dot with no explanation.
 * This is that explanation, shown on the way back rather than as a standing
 * note nobody reads before it matters. The whole strip is the button, because
 * the only thing anyone wants from it is to be marked present again.
 */
export function VenueAwayBanner({
  stillAway,
  onResume,
  onDismiss,
  className,
}: VenueAwayBannerProps) {
  const minutes = Math.round(VENUE.IDLE_AFTER_MS / 60_000)

  return (
    <div
      className={cn(
        // Sits in the flow directly under the sticky bar rather than sticking
        // itself: that bar wraps to two rows on a narrow screen, and a fixed
        // offset guessed at its height would overlap it exactly there.
        'border-b border-ktip-sun-200 bg-ktip-sun-50',
        className
      )}
    >
      <button
        type="button"
        onClick={onResume}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-ktip-sun-100"
      >
        <Moon size={15} className="shrink-0 text-ktip-sun-700" aria-hidden="true" />

        <p className="min-w-0 flex-1 text-sm text-ktip-sand-800">
          <span className="font-semibold">
            {stillAway ? 'You are showing as Away.' : 'You were showing as Away.'}
          </span>{' '}
          This tab sat in the background for {minutes} minutes, so your dot went grey
          automatically. <span className="font-semibold underline">Click here</span> to go back to
          Working — or pick a status in the bar above. “Do not disturb” never gets downgraded.
        </p>

        <span className="hidden shrink-0 rounded-full border border-ktip-sun-300 bg-ktip-cream px-3 py-1 text-xs font-semibold text-ktip-sand-800 sm:block">
          I’m back
        </span>

        {/* Dismissing keeps the status as it is — some people really are away. */}
        <span
          role="button"
          tabIndex={0}
          aria-label="Dismiss"
          onClick={(e) => {
            e.stopPropagation()
            onDismiss()
          }}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return
            e.preventDefault()
            e.stopPropagation()
            onDismiss()
          }}
          className="shrink-0 rounded-lg p-1 text-ktip-sand-500 transition-colors hover:bg-ktip-sun-200 hover:text-ktip-sand-800"
        >
          <X size={15} aria-hidden="true" />
        </span>
      </button>
    </div>
  )
}
