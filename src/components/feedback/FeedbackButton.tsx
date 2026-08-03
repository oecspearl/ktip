import { useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { FeedbackModal } from './FeedbackModal'
import { useAuth } from '../../contexts/AuthContext'
import { Trans, useLingui } from '@lingui/react/macro'

/**
 * Floating "Send Feedback" trigger (bottom-left; the UAT survey
 * button occupies bottom-right). Only shown to signed-in users.
 */
export function FeedbackButton() {
    const { t } = useLingui()
  const auth = useAuth()
  const [open, setOpen] = useState(false)

  if (!auth.user) return null

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 left-6 z-fab flex items-center gap-2 px-4 py-3 bg-ktip-cream border border-ktip-sand-200 text-ktip-sand-700 rounded-full shadow-lg hover:shadow-xl hover:text-ktip-ocean-600 transition-all text-sm font-semibold"
        aria-label={t`Send feedback`}
      >
        <MessageCircle size={18} />
        <span className="hidden sm:inline"><Trans>Feedback</Trans></span>
      </button>
      <FeedbackModal open={open} onClose={() => setOpen(false)} />
    </>
  )
}
