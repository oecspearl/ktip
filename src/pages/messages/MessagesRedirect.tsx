import { useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useMessagingPanel } from '../../contexts/MessagingPanelContext'

/**
 * Legacy /messages route: messaging now lives in the docked panel.
 * Opens the panel (with ?user=<id> deep link support) and bounces home.
 */
export default function MessagesRedirect() {
  const [searchParams] = useSearchParams()
  const { openPanel } = useMessagingPanel()
  const navigate = useNavigate()
  const handled = useRef(false)

  useEffect(() => {
    if (handled.current) return
    handled.current = true
    const userId = searchParams.get('user')
    openPanel(userId ? { userId } : undefined)
    navigate('/', { replace: true })
  }, [openPanel, navigate, searchParams])

  return null
}
