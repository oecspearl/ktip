import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from './AuthContext'
import { useToast } from './ToastContext'
import { useCreateConversation } from '../hooks/useMessages'

interface OpenPanelOptions {
  /** Open (creating if needed) a DM with this user */
  userId?: string
  /** Open this existing conversation */
  conversationId?: string
}

interface MessagingPanelContextValue {
  isOpen: boolean
  activeConversationId: string | null
  openPanel: (opts?: OpenPanelOptions) => void
  closePanel: () => void
  togglePanel: () => void
  setActiveConversation: (id: string | null) => void
}

const MessagingPanelContext = createContext<MessagingPanelContextValue | null>(null)

export function MessagingPanelProvider({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const toast = useToast()
  const { createConversation } = useCreateConversation()
  const [isOpen, setIsOpen] = useState(false)
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)

  const openPanel = useCallback(
    (opts?: OpenPanelOptions) => {
      setIsOpen(true)
      if (opts?.conversationId) {
        setActiveConversationId(opts.conversationId)
        return
      }
      const userId = opts?.userId
      if (userId && auth.user && userId !== auth.user.id) {
        // Idempotent: the RPC reuses an existing DM, and the mutation
        // invalidates ['messages'] so the conversation list refreshes.
        createConversation(auth.user.id, userId)
          .then((convId) => setActiveConversationId(convId))
          .catch((err: any) => {
            // The refusals that reach here are the ones a member can act on —
            // a private profile to request access to, a student account that
            // needs a supervised channel. Logging them to the console left the
            // panel sitting open and empty with no reason given.
            console.error('Failed to open conversation:', err)
            toast.error(err?.message || 'Could not open that conversation')
          })
      }
    },
    [auth.user, createConversation, toast]
  )

  const closePanel = useCallback(() => setIsOpen(false), [])
  const togglePanel = useCallback(() => setIsOpen((prev) => !prev), [])
  const setActiveConversation = useCallback((id: string | null) => setActiveConversationId(id), [])

  const value = useMemo(
    () => ({ isOpen, activeConversationId, openPanel, closePanel, togglePanel, setActiveConversation }),
    [isOpen, activeConversationId, openPanel, closePanel, togglePanel, setActiveConversation]
  )

  return <MessagingPanelContext.Provider value={value}>{children}</MessagingPanelContext.Provider>
}

export function useMessagingPanel() {
  const ctx = useContext(MessagingPanelContext)
  if (!ctx) throw new Error('useMessagingPanel must be used within MessagingPanelProvider')
  return ctx
}
