import { useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { analytics } from '../../hooks/useAnalytics'
import { usePageTitle } from '../../hooks/usePageTitle'

/**
 * Last resort, not the normal path. Routing waits on `profileLoading`, which
 * already covers the profile query's retry budget, so this only fires when the
 * session itself never resolves — a dead network, a blocked third-party
 * cookie, a provider that never redirected back with anything readable.
 *
 * Keep it comfortably above that retry budget (AuthContext retries the profile
 * 3 times with backoff capped at 8s). A shorter timer used to win the race and
 * route a brand-new OAuth user to `/` while their profile was still in flight,
 * leaving them signed in with no role and no trip through onboarding.
 */
const FALLBACK_TIMEOUT_MS = 20000

/**
 * Grace period for the other failure shape: auth has settled and nobody is
 * signed in, which means the exchange failed without leaving an error in the
 * URL. Waiting the full backstop for that is pointless, but exiting the
 * instant `loading` flips is wrong too — AuthContext's own 3s getSession
 * fallback can flip it while a slow code exchange is still in flight.
 */
const NO_SESSION_GRACE_MS = 5000

/**
 * Provider and GoTrue error strings are diagnostics, not user-facing copy.
 * These are the failures Microsoft and Google actually produce in the wild;
 * anything unrecognised is passed through rather than swallowed.
 */
const ERROR_COPY: Array<[RegExp, string]> = [
  [
    /email.*(external provider|not (?:provided|available|found))|no email/i,
    'Your Microsoft account did not share an email address with KTIP. Ask whoever administers it to add one, or sign in with Google or an email address instead.',
  ],
  [
    /already (?:registered|exists)|identity is already linked|user already/i,
    'An account already exists for that email address. Sign in the way you did originally, or use “Forgot Password?” to set a password for it.',
  ],
  [
    /access.?denied|consent.?required|cancell?ed/i,
    'Sign-in was cancelled before your provider confirmed it. Nothing has changed — try again whenever you are ready.',
  ],
  [
    /server_error|temporarily unavailable|timeout/i,
    'Your sign-in provider could not complete the request. Try again in a moment.',
  ],
]

function friendlyOAuthError(raw: string): string {
  for (const [pattern, copy] of ERROR_COPY) {
    if (pattern.test(raw)) return copy
  }
  return raw
}

/**
 * Read a provider error out of the callback URL.
 *
 * PKCE returns errors as query parameters and the implicit flow returns them
 * in the fragment, so both are checked — a missed error is indistinguishable
 * from a hung sign-in and costs the user the full fallback timeout.
 *
 * The value is used exactly as URLSearchParams hands it over. It has already
 * been percent-decoded and its `+` characters are already spaces; decoding a
 * second time throws URIError on any message containing a literal `%` and
 * silently strips any legitimate `+`.
 */
function readProviderError(): string | null {
  const sources = [
    new URLSearchParams(window.location.search),
    new URLSearchParams(window.location.hash.replace(/^#/, '')),
  ]
  for (const params of sources) {
    const message = params.get('error_description') || params.get('error')
    if (message) return message
  }
  return null
}

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

  // Latest auth snapshot for the fallback timer, which must not list auth in
  // its dependencies: re-running the effect would restart the timer on every
  // token refresh and stretch the deadline indefinitely.
  const latest = useRef(auth)
  useEffect(() => {
    latest.current = auth
  })

  /** Single exit. `roles` is null when the profile never loaded at all. */
  const finish = useCallback(
    (signedIn: boolean, roles: string[] | null, owesAge = false) => {
      done.current = true

      if (!signedIn) {
        toast.error('We could not complete that sign-in. Please try again.')
        navigate('/login', { replace: true })
        return
      }

      // No roles means the account has never been through onboarding. A
      // profile that failed to load is treated the same way, because
      // ProtectedRoute would bounce them there regardless, and OnboardingPage
      // sends them home by itself once the row does arrive.
      //
      // An outstanding age declaration routes the same way even when a role is
      // already set: no OAuth provider gives us a birthday, so a returning
      // Google user who abandoned onboarding half-finished still owes one.
      if (!roles || roles.length === 0 || owesAge) {
        analytics.conversion('signup_success', { provider: 'oauth' })
        navigate('/onboarding', { replace: true })
        return
      }

      analytics.conversion('login_success')
      toast.success('Welcome back!')
      navigate('/', { replace: true })
    },
    [navigate, toast]
  )

  // Provider errors short-circuit everything else.
  useEffect(() => {
    if (done.current) return
    const providerError = readProviderError()
    if (!providerError) return
    done.current = true
    toast.error(friendlyOAuthError(providerError))
    navigate('/login', { replace: true })
  }, [navigate, toast])

  useEffect(() => {
    // profileLoading covers the profile query and its retries, so there is no
    // window here where the session is known but roles are not.
    if (done.current || auth.loading || auth.profileLoading) return
    if (!auth.user) return
    finish(true, auth.profile?.roles ?? null, auth.profile?.requires_age_declaration === true)
  }, [auth.loading, auth.profileLoading, auth.user, auth.profile, finish])

  // Auth settled with nobody signed in — the exchange failed silently.
  useEffect(() => {
    if (done.current || auth.loading || auth.user) return
    const timer = setTimeout(() => {
      if (done.current || latest.current.user) return
      finish(false, null)
    }, NO_SESSION_GRACE_MS)
    return () => clearTimeout(timer)
  }, [auth.loading, auth.user, finish])

  // Safety net: if nothing resolves in time, bail out sensibly.
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (done.current) return
      const { user, profile } = latest.current
      finish(!!user, profile?.roles ?? null, profile?.requires_age_declaration === true)
    }, FALLBACK_TIMEOUT_MS)
    return () => clearTimeout(timeout)
  }, [finish])

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
