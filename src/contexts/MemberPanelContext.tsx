import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

interface MemberPanelContextValue {
  /** Profile id currently shown in the drawer, or null when closed */
  memberId: string | null
  isOpen: boolean
  openMember: (userId: string) => void
  closeMember: () => void
}

const MemberPanelContext = createContext<MemberPanelContextValue | null>(null)

/**
 * Members no longer have a page of their own — clicking a name anywhere in the
 * app opens this drawer instead, so /dashboard stays the only personal page.
 */
export function MemberPanelProvider({ children }: { children: ReactNode }) {
  const [memberId, setMemberId] = useState<string | null>(null)

  const openMember = useCallback((userId: string) => setMemberId(userId), [])
  const closeMember = useCallback(() => setMemberId(null), [])

  const value = useMemo(
    () => ({ memberId, isOpen: memberId !== null, openMember, closeMember }),
    [memberId, openMember, closeMember]
  )

  return <MemberPanelContext.Provider value={value}>{children}</MemberPanelContext.Provider>
}

export function useMemberPanel() {
  const ctx = useContext(MemberPanelContext)
  if (!ctx) throw new Error('useMemberPanel must be used within MemberPanelProvider')
  return ctx
}
