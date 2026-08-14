import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
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
      </Routes>
    </MemoryRouter>,
  )
}

describe('ProtectedRoute gate ordering', () => {
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
