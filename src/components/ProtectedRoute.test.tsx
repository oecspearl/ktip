import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { ProtectedRoute } from './ProtectedRoute'

const mockAuth = vi.fn()
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockAuth(),
}))
vi.mock('./RouteSplash', () => ({
  RouteSplash: () => <div>SPLASH</div>,
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

type ProfileOverrides = Record<string, unknown>

function auth(overrides: Record<string, unknown> = {}, profile: ProfileOverrides | null = {}) {
  return {
    loading: false,
    profileLoading: false,
    user: { id: 'u1' },
    mfaChallengeRequired: false,
    profile:
      profile === null
        ? null
        : {
            roles: ['entrepreneur'],
            requires_age_declaration: false,
            requires_consent: false,
            ...profile,
          },
    ...overrides,
  }
}

function renderAt(path = '/dashboard') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<div>DASHBOARD</div>} />
        </Route>
        <Route path="/login" element={<div>LOGIN</div>} />
        <Route path="/onboarding" element={<div>ONBOARDING</div>} />
        <Route path="/security/set-up" element={<div>MFA_SETUP</div>} />
        <Route path="/security/verify" element={<div>MFA_CHALLENGE</div>} />
        <Route path="/account/suspended" element={<div>SUSPENDED</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

// 184. The session is held on one page; the lift is read from the end date.
describe('ProtectedRoute suspension hold', () => {
  const suspended = (until: string | null) => ({
    suspension: { isSuspended: true, until, reason: 'Spam', since: null },
  })

  it('sends a suspended account to the suspended page', () => {
    mockAuth.mockReturnValue(auth(suspended(null)))
    renderAt()
    expect(screen.getByText('SUSPENDED')).toBeTruthy()
    expect(screen.queryByText('DASHBOARD')).toBeNull()
  })

  it('holds before onboarding is asked for', () => {
    mockAuth.mockReturnValue(auth(suspended(null), { roles: [] }))
    renderAt()
    expect(screen.getByText('SUSPENDED')).toBeTruthy()
  })

  it('lets the account through once the end date has passed', () => {
    mockAuth.mockReturnValue(auth(suspended('2000-01-01T00:00:00Z')))
    renderAt()
    expect(screen.getByText('DASHBOARD')).toBeTruthy()
  })

  it('lets a reinstated account through', () => {
    mockAuth.mockReturnValue(auth({ suspension: { isSuspended: false, until: null, reason: null, since: null } }))
    renderAt()
    expect(screen.getByText('DASHBOARD')).toBeTruthy()
  })
})

describe('ProtectedRoute gate ordering', () => {
  it('waits for the challenge answer rather than reading unknown as nothing owed', () => {
    mockAuth.mockReturnValue(auth({ mfaChallengeLoading: true }))
    renderAt()
    expect(screen.getByText('SPLASH')).toBeTruthy()
    expect(screen.queryByText('DASHBOARD')).toBeNull()
  })

  it('waits for the profile rather than guessing', () => {
    mockAuth.mockReturnValue(auth({ profileLoading: true }))
    renderAt()
    expect(screen.getByText('SPLASH')).toBeTruthy()
  })

  it('sends a signed-out visitor to login', () => {
    mockAuth.mockReturnValue(auth({ user: null }))
    renderAt()
    expect(screen.getByText('LOGIN')).toBeTruthy()
  })

  // LoginPage parks this (src/lib/return-to.ts). Without it a gated project
  // link signs the visitor in and drops them on the homepage.
  it('tells login where the visitor was going', () => {
    mockAuth.mockReturnValue(auth({ user: null }))
    function LoginProbe() {
      const from = (useLocation().state as { from?: { pathname: string; search: string } } | null)?.from
      return <div>FROM {from ? `${from.pathname}${from.search}` : 'none'}</div>
    }
    render(
      <MemoryRouter initialEntries={['/projects/skillbridge?tab=team']}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/projects/:id" element={<div>PROJECT</div>} />
          </Route>
          <Route path="/login" element={<LoginProbe />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText('FROM /projects/skillbridge?tab=team')).toBeTruthy()
  })

  it('sends a role-less account to onboarding before anything else', () => {
    mockAuth.mockReturnValue(
      auth({ mfaChallengeRequired: true }, { roles: [], requires_mfa_enrollment: true }),
    )
    renderAt()
    // Onboarding wins: the MFA requirement is derived from a role this account
    // does not hold yet.
    expect(screen.getByText('ONBOARDING')).toBeTruthy()
  })

  it('challenges before it asks for enrolment', () => {
    mockAuth.mockReturnValue(
      auth({ mfaChallengeRequired: true }, { requires_mfa_enrollment: true }),
    )
    renderAt()
    expect(screen.getByText('MFA_CHALLENGE')).toBeTruthy()
  })

  it('holds an account that owes enrolment on the setup page', () => {
    mockAuth.mockReturnValue(auth({}, { requires_mfa_enrollment: true }))
    renderAt()
    expect(screen.getByText('MFA_SETUP')).toBeTruthy()
  })

  it('lets an enrolled account through', () => {
    mockAuth.mockReturnValue(auth({}, { requires_mfa_enrollment: false }))
    renderAt()
    expect(screen.getByText('DASHBOARD')).toBeTruthy()
  })

  // The single most important assertion here. PostgREST omits a column the
  // database does not have yet, so an app deployed ahead of migration 118 reads
  // `undefined`. If that ever gated, every member on the platform would be
  // trapped on /security/set-up by a deploy in the wrong order.
  it('gates nobody when the column is absent', () => {
    mockAuth.mockReturnValue(auth({}, { requires_mfa_enrollment: undefined }))
    renderAt()
    expect(screen.getByText('DASHBOARD')).toBeTruthy()
  })
})
