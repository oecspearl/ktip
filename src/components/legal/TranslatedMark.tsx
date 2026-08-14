import { useState } from 'react'
import { Languages } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { cn } from '../../lib/utils'

interface TranslatedMarkProps {
  /** The author's original text, revealed on click where it is available. */
  source?: string
  className?: string
}

/**
 * Marks text as machine output rather than what the author wrote.
 *
 * The gap this fills: `useTranslatedContent` has always returned a `translated`
 * flag, but only the venue room chat ever acted on it, and `useTranslated` — the
 * hook behind project summaries, event copy, grant text and resources — did not
 * expose one at all. So a French reader has been shown machine-translated member
 * content with nothing to say so, which the IP policy's licence grant (we may
 * "translate") and the AI disclosure both assume is visible.
 *
 * Deliberately small and quiet. It sits beside a title, not above it, because a
 * banner on every translated string would drown the page it is annotating.
 */
export function TranslatedMark({ source, className }: TranslatedMarkProps) {
  const { t } = useLingui()
  const [showSource, setShowSource] = useState(false)

  const label = t`Machine translation from the original. The original is what the author wrote.`

  return (
    <span className={cn('inline-flex flex-col items-start gap-1 align-middle', className)}>
      <button
        type="button"
        onClick={() => source && setShowSource((open) => !open)}
        aria-label={label}
        title={label}
        aria-expanded={source ? showSource : undefined}
        // Not a button when there is nothing to reveal — a control that does
        // nothing when pressed is worse than a label.
        disabled={!source}
        className={cn(
          'inline-flex items-center gap-1 rounded-control border border-ktip-sand-200 bg-ktip-sand-50 px-1.5 py-0.5 text-micro font-medium text-ktip-sand-500',
          source && 'hover:border-ktip-ocean-300 hover:text-ktip-ocean-700'
        )}
      >
        <Languages size={11} aria-hidden />
        <Trans>Translated</Trans>
      </button>

      {showSource && source && (
        <span className="block max-w-prose rounded-control border border-ktip-sand-200 bg-ktip-cream px-2 py-1.5 text-caption text-ktip-sand-600">
          <span className="block font-semibold text-ktip-sand-500">
            <Trans>Original</Trans>
          </span>
          {source}
        </span>
      )}
    </span>
  )
}
