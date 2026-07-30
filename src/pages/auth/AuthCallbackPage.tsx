import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { analytics } from '../../hooks/useAnalytics'
import { usePageTitle } from '../../hooks/usePageTitle'

/**
 * OAuth landing page. Supabase (detectSessionInUrl) exchanges the code in the
 * URL automatically; we wait for the session + profile, then route:
 *  - new OAuth user (no role picked yet) -> /onboarding to finish their profile
 *  - returning user -> /
 *  - provider error / no session -> /login
 */
export default function AuthCallbackPage() {
  usePageTitle('Signing in…')
  const auth = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const done = useRef(false)

  // Provider errors arrive as hash params (#error=...&error_description=...)
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1))
    const errorDescription = hash.get('error_description') || hash.get('error')
    if (errorDescription && !done.current) {
      done.current = true
      toast.error(decodeURIComponent(errorDescription).replace(/\+/g, ' '))
      navigate('/login', { replace: true })
    }
  }, [navigate, toast])

  useEffect(() => {
    if (done.current || auth.loading) return

    // Session resolved and profile loaded — decide destination.
    // roles is always non-empty for email signups (role is required),
    // so an empty roles array means a brand-new OAuth account.
    if (auth.user && auth.profile) {
      done.current = true
      const isNewUser = auth.profile.roles.length === 0
      if (isNewUser) {
        analytics.conversion('signup_success', { provider: 'oauth' })
        navigate('/onboarding', { replace: true })
      } else {
        analytics.conversion('login_success')
        toast.success('Welcome back!')
        navigate('/', { replace: true })
      }
    }
  }, [auth.loading, auth.user, auth.profile, navigate, toast])

  // Safety net: if nothing resolves within 10s, bail out sensibly.
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (done.current) return
      done.current = true
      if (auth.user) {
        navigate('/', { replace: true })
      } else {
        toast.error('Sign in took too long. Please try again.')
        navigate('/login', { replace: true })
      }
    }, 10000)
    return () => clearTimeout(timeout)
  }, [auth.user, navigate, toast])

  return (
    <div className="min-h-screen flex items-center justify-center bg-ktip-canvas">
      <div className="text-center">
        <img
          src="/ktip-logo.webp"
          alt="KTIP Logo"
          className="w-12 h-12 object-contain mx-auto animate-pulse-soft"
        />
        <p className="mt-4 text-ktip-sand-600">Signing you in…</p>
      </div>
    </div>
  )
}
