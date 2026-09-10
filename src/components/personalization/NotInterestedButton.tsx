import { EyeOff } from 'lucide-react'
import { useLingui } from '@lingui/react/macro'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { useSuppressContent } from '../../hooks/useSuppressions'
import type { RankableEntity } from '../../lib/personalization'
import { cn } from '../../lib/utils'

interface NotInterestedButtonProps {
  entity: RankableEntity
  id: string
  /** Called after the row is written, so the host can drop the card at once. */
  onHidden?: () => void
  className?: string
  /** On-dark variant for cards drawn over photography. */
  tone?: 'light' | 'dark'
}

/**
 * The one negative-feedback control. Writes a suppression (153) and tells the
 * member where to undo it. Stops the click before it reaches the card's link.
 */
export function NotInterestedButton({ entity, id, onHidden, className, tone = 'light' }: NotInterestedButtonProps) {
  const { t } = useLingui()
  const auth = useAuth()
  const toast = useToast()
  const { suppress, loading } = useSuppressContent()

  if (!auth.user) return null
  const userId = auth.user.id

  return (
    <button
      type="button"
      disabled={loading}
      aria-label={t`Not interested`}
      title={t`Not interested — hide this from my recommendations`}
      onClick={async (e) => {
        e.preventDefault()
        e.stopPropagation()
        try {
          await suppress(userId, entity, id)
          onHidden?.()
          toast.success(t`Hidden. You can bring it back under Settings › Personalization.`)
        } catch {
          toast.error(t`Could not hide this right now`)
        }
      }}
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded-full border transition-colors disabled:opacity-50',
        tone === 'dark'
          ? 'border-white/30 bg-black/30 text-white/80 hover:bg-black/50 hover:text-white'
          : 'border-ktip-sand-200 bg-ktip-cream/90 text-ktip-sand-500 hover:text-ktip-sand-800 hover:border-ktip-sand-300',
        className
      )}
    >
      <EyeOff size={13} />
    </button>
  )
}
