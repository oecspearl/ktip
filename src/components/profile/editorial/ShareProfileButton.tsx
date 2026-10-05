import { Share2 } from 'lucide-react'
import { useLingui } from '@lingui/react/macro'
import { useToast } from '../../../contexts/ToastContext'
import { cn } from '../../../lib/utils'

/**
 * Share a member page: the device's share sheet where there is one, the
 * clipboard where there is not. Icon-only, so it carries its own label.
 */
export function ShareProfileButton({
  url,
  name,
  className,
}: {
  url: string
  name: string
  className?: string
}) {
  const { t } = useLingui()
  const toast = useToast()

  const share = async () => {
    const absolute = new URL(url, window.location.origin).toString()
    if (navigator.share) {
      try {
        await navigator.share({ title: name, url: absolute })
        return
      } catch (err) {
        // Dismissing the sheet is not an error worth a toast.
        if ((err as Error)?.name === 'AbortError') return
      }
    }
    try {
      await navigator.clipboard.writeText(absolute)
      toast.success(t`Profile link copied`)
    } catch {
      toast.error(t`Could not copy the link. Copy it from the address bar instead.`)
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      aria-label={t`Share ${name}'s profile`}
      title={t`Share profile`}
      className={cn('pf-btn pf-btn--icon', className)}
    >
      <Share2 size={18} strokeWidth={1.7} aria-hidden="true" />
    </button>
  )
}
