import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../contexts/ToastContext'
import { analytics } from '../../hooks/useAnalytics'
import { usePageTitle } from '../../hooks/usePageTitle'

/**
 * Virtual Campus handoff landing page.
 *
 * By the time a browser reaches here the learner is already authenticated:
 * /auth/vc/callback verified their signed assertion server-side, provisioned
 * the account and minted a Supabase session. What it could not do is install
 * that session — supabase-js keeps it in localStorage, which only the browser
 * can write.
 *
 * So the callback held the tokens back and redirected with a one-time ticket.
 * This page trades it in over POST and calls setSession, which is the same
 * handshake the secondary-email login uses (AuthContext.signIn ->
 * /api/auth/login-alias). The ticket is stripped from the URL before the
 * request goes out, so a shared machine's history never holds a live credential.
 */
export default function VcLandingPage() {
  usePageTitle('Signing in…')
  const navigate = useNavigate()
  const toast = useToast()
  const done = useRef(false)
  const [message, setMessage] = useState('Signing you in…')

  useEffect(() => {
    if (done.current) return
    done.current = true

    const params = new URLSearchParams(window.location.search)
    const ticket = params.get('t')

    // Strip immediately, before any await. The ticket is single-use, but a
    // reload that re-sends it produces a confusing failure rather than a clean
    // "already signed in".
    window.history.replaceState(null, '', '/auth/vc/land')

    if (!ticket) {
      toast.error('That sign-in link is incomplete. Please try again from the Virtual Campus.')
      navigate('/login', { replace: true })
      return
    }

    let cancelled = false

    const run = async () => {
      try {
        const res = await fetch('/api/auth/vc/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticket }),
        })

        if (!res.ok) throw new Error(`handoff ${res.status}`)

        const body = (await res.json()) as {
          access_token: string
          refresh_token: string
          is_new_user?: boolean
        }

        const { error } = await supabase.auth.setSession({
          access_token: body.access_token,
          refresh_token: body.refresh_token,
        })
        if (error) throw error
        if (cancelled) return

        analytics.conversion(body.is_new_user ? 'signup_success' : 'login_success', {
          provider: 'oecs_virtual_campus',
        })

        setMessage('Building your CV…')

        // First-timers land on the CV, because that is the thing that was just
        // created for them and the whole reason the handoff exists. Returning
        // users go where they would normally go.
        if (body.is_new_user) {
          toast.success('Welcome to KTIP — your CV has been started from your Virtual Campus record.')
          navigate('/cv?welcome=vc', { replace: true })
        } else {
          toast.success('Welcome back!')
          navigate('/dashboard', { replace: true })
        }
      } catch {
        if (cancelled) return
        toast.error('That sign-in link has expired. Please try again from the Virtual Campus.')
        navigate('/login', { replace: true })
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [navigate, toast])

  return (
    <div className="min-h-screen flex items-center justify-center bg-ktip-canvas">
      <div className="text-center">
        <img
          src="/KTIP%20LOGO.png"
          alt="KTIP Logo"
          className="w-12 h-12 object-contain mx-auto animate-pulse-soft"
        />
        <p className="mt-4 text-ktip-sand-600">{message}</p>
      </div>
    </div>
  )
}
