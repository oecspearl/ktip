import { useCallback, useRef, useState } from 'react'
import { Share2 } from 'lucide-react'
import { Trans } from '@lingui/react/macro'
import { cn } from '../../lib/utils'
import type { ShareTarget } from '../../lib/share/targets'
import { ShareSheet } from './ShareSheet'

/**
 * The page's one Share button. It opens the share sheet (WhatsApp, LinkedIn,
 * Facebook, X, Instagram, copy link) rather than copying anything itself.
 *
 * `card` is the full-width outline button at the foot of a detail page's
 * action card; `hero` is the compact button for a page hero's actions. Pass
 * `null` as the target to render nothing: drafts, private projects and
 * anything else a signed-out visitor couldn't open have no Share button.
 */
export function ShareButton({
  target,
  variant = 'card',
  className,
}: {
  target: ShareTarget | null
  variant?: 'card' | 'hero'
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const close = useCallback(() => {
    setOpen(false)
    buttonRef.current?.focus()
  }, [])

  if (!target) return null

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex items-center justify-center gap-2 rounded-lg border font-semibold transition-colors',
          variant === 'card'
            ? 'w-full border-ktip-sand-200 bg-ktip-sand-100 px-4 py-2.5 text-sm text-ktip-sand-800 hover:bg-ktip-sand-200 aria-expanded:bg-ktip-sand-200'
            : 'border-ktip-sand-200 bg-ktip-cream px-4 py-2 text-sm text-ktip-sand-700 shadow-medium hover:bg-ktip-sand-50',
          className
        )}
      >
        <Share2 className="size-4" aria-hidden="true" />
        <Trans>Share</Trans>
      </button>
      {open && <ShareSheet target={target} onClose={close} />}
    </>
  )
}
