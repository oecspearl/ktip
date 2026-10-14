import { useMemo } from 'react'
import { msg } from '@lingui/core/macro'
import { useLingui } from '@lingui/react'
import type { MessageDescriptor } from '@lingui/core'
import type { A11yRoute } from '@a11y-kit'

interface RouteDef {
  id: string
  path: string
  label: MessageDescriptor
  digit?: number
  seq?: string
}

/**
 * The pages a shortcut, a voice command or the setup tour can go to: the
 * Navbar's own top level, in its order. routes.test.ts holds every path to a
 * real route in App.tsx.
 */
export const ROUTE_DEFS: RouteDef[] = [
  { id: 'home', path: '/', label: msg`Home`, digit: 1, seq: 'h' },
  { id: 'projects', path: '/projects', label: msg`Projects`, digit: 2, seq: 'p' },
  { id: 'events', path: '/events', label: msg`Events`, digit: 3, seq: 'e' },
  { id: 'funding', path: '/grants', label: msg`Funding`, digit: 4, seq: 'f' },
  { id: 'forums', path: '/forums', label: msg`Forums`, digit: 5, seq: 'o' },
  { id: 'directory', path: '/directory', label: msg`Directory`, digit: 6, seq: 'd' },
  { id: 'resources', path: '/resources', label: msg`Resources`, digit: 7, seq: 'r' },
  { id: 'dashboard', path: '/dashboard', label: msg`Dashboard`, digit: 8, seq: 'b' },
  { id: 'help', path: '/help', label: msg`Help`, digit: 9 },
]

/** The routes with their labels in the reader's language. */
export function useKtipRoutes(): A11yRoute[] {
  const { i18n } = useLingui()
  return useMemo(
    () => ROUTE_DEFS.map(({ label, ...rest }) => ({ ...rest, label: i18n._(label) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [i18n, i18n.locale]
  )
}
