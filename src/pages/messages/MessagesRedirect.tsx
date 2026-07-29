import { useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useMessagingPanel } from '../../contexts/MessagingPanelContext'
import { ASSISTANT_CONVERSATION_ID } from '../../lib/assistant'

/**
 * Legacy /messages route: messaging now lives in the docked panel.
 * Opens the panel and bounces home. Deep links: ?user=<id> for a DM,
 * ?assistant=1 for the KTIP Assistant thread.
 */
export default function MessagesRedirect() {
  const [searchParams] = useSearchParams()
  const { openPanel } = useMessagingPanel()
  const navigate = useNavigate()
  const handled = useRef(false)

  useEffect(() => {
    if (handled.current) return
    handled.current = true

    if (searchParams.get('assistant')) {
      openPanel({ conversationId: ASSISTANT_CONVERSATION_ID })
    } else {
      const userId = searchParams.get('user')
      openPanel(userId ? { userId } : undefined)
    }
    navigate('/', { replace: true })
  }, [openPanel, navigate, searchParams])

  return null
}
