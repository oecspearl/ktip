import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { AccountRoute } from './AccountRoute'
import { takeReturnTo } from '../lib/return-to'

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
  sessionStorage.clear()
})

function LoginProbe() {
  const from = (useLocation().state as { from?: { pathname: string; search: string } } | null)?.from
  return <div>LOGIN FROM {from ? `${from.pathname}${from.search}` : 'none'}</div>
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AccountRoute />}>
          <Route path="/grants/:id" element={<div>GRANT</div>} />
        </Route>
        <Route path="/login" element={<LoginProbe />} />
        <Route path="/signup" element={<div>SIGNUP</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('AccountRoute', () => {
  it('sends a signed-out visitor to login, carrying where they were going', () => {
    mockAuth.mockReturnValue({ loading: false, user: null })
    renderAt('/grants/youth-fund?tab=apply')
    expect(screen.getByText('LOGIN FROM /grants/youth-fund?tab=apply')).toBeTruthy()
    expect(screen.queryByText('SIGNUP')).toBeNull()
    expect(screen.queryByText('GRANT')).toBeNull()
  })

  // Router state does not survive the email OTP's navigation or an OAuth
  // round trip, so the path has to be parked in the tab as well.
  it('parks the path for after log-in or sign-up', () => {
    mockAuth.mockReturnValue({ loading: false, user: null })
    renderAt('/grants/youth-fund?tab=apply')
    expect(takeReturnTo()).toBe('/grants/youth-fund?tab=apply')
  })

  it('waits while the session is still loading', () => {
    mockAuth.mockReturnValue({ loading: true, user: null })
    renderAt('/grants/youth-fund')
    expect(screen.getByText('SPLASH')).toBeTruthy()
    expect(takeReturnTo()).toBeNull()
  })

  // These routes were public. A member must not be stopped by onboarding or
  // two-step checks this guard never had.
  it('lets a signed-in member straight through', () => {
    mockAuth.mockReturnValue({
      loading: false,
      user: { id: 'u1' },
      profile: { roles: [], requires_mfa_enrollment: true },
    })
    renderAt('/grants/youth-fund')
    expect(screen.getByText('GRANT')).toBeTruthy()
  })
})
