import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router'
import { ProtectedRoute } from '../ProtectedRoute'
import { AccountRoute } from '../AccountRoute'
import { UNVERIFIED_NO, UNVERIFIED_OK } from '../../lib/unverified-access'
import { useWallPublicForUnverified } from '../../hooks/useUnverifiedRule'

// 205. The guards read route handles from the data router, so these render
// under createMemoryRouter, not MemoryRouter (ProtectedRoute.test.tsx covers
// the other gates and runs without a data router, where this one stands down).

const mockAuth = vi.fn()
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => mockAuth(),
}))
vi.mock('../../hooks/useEmailAlias', () => ({
  useSecondaryEmailStatus: () => ({ status: { compliant: true }, loading: false, error: null }),
}))
vi.mock('../RouteSplash', () => ({
  RouteSplash: () => <div>SPLASH</div>,
}))
vi.mock('./VerificationWall', () => ({
  VerificationWall: () => <div>WALL</div>,
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function auth(verified: boolean) {
  return {
    loading: false,
    profileLoading: false,
    user: { id: 'u1' },
    verified,
    mfaChallengeRequired: false,
    mfaChallengeLoading: false,
    suspension: null,
    profile: { roles: ['entrepreneur'], requires_age_declaration: false, requires_consent: false },
  }
}

/** Stand-in for MainLayout's public-page rule, without the whole shell. */
function PublicShell() {
  const a = mockAuth()
  const wall = useWallPublicForUnverified()
  return wall && a.user && !a.verified ? <div>WALL</div> : <Outlet />
}

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      {
        Component: PublicShell,
        children: [
          { path: '/', element: <div>HOME</div> },
          { path: '/resources', handle: UNVERIFIED_NO, element: <div>RESOURCES</div> },
          {
            Component: AccountRoute,
            children: [
              { path: '/grants/:id', handle: UNVERIFIED_OK, element: <div>GRANT</div> },
              { path: '/resources/:id', element: <div>RESOURCE</div> },
            ],
          },
          {
            Component: ProtectedRoute,
            children: [
              { path: '/dashboard/verification', handle: UNVERIFIED_OK, element: <div>VERIFY_TAB</div> },
              { path: '/collaborate', element: <div>COLLABORATE</div> },
            ],
          },
        ],
      },
    ],
    { initialEntries: [path] }
  )
  return render(<RouterProvider router={router} />)
}

describe('unverified account (205)', () => {
  beforeEach(() => mockAuth.mockReturnValue(auth(false)))

  it('walls an unmarked members-only page', async () => {
    renderAt('/collaborate')
    expect(await screen.findByText('WALL')).toBeTruthy()
    expect(screen.queryByText('COLLABORATE')).toBeNull()
  })

  it('opens a members-only page marked UNVERIFIED_OK', async () => {
    renderAt('/dashboard/verification')
    expect(await screen.findByText('VERIFY_TAB')).toBeTruthy()
  })

  it('opens a marked detail page and walls an unmarked one', async () => {
    renderAt('/grants/abc')
    expect(await screen.findByText('GRANT')).toBeTruthy()
    cleanup()
    renderAt('/resources/abc')
    expect(await screen.findByText('WALL')).toBeTruthy()
  })

  it('walls a public list marked UNVERIFIED_NO and leaves unmarked public pages open', async () => {
    renderAt('/resources')
    expect(await screen.findByText('WALL')).toBeTruthy()
    cleanup()
    renderAt('/')
    expect(await screen.findByText('HOME')).toBeTruthy()
  })
})

describe('verified account', () => {
  beforeEach(() => mockAuth.mockReturnValue(auth(true)))

  it('sees every page', async () => {
    for (const [path, text] of [
      ['/collaborate', 'COLLABORATE'],
      ['/resources/abc', 'RESOURCE'],
      ['/resources', 'RESOURCES'],
    ] as const) {
      renderAt(path)
      expect(await screen.findByText(text)).toBeTruthy()
      cleanup()
    }
  })
})
