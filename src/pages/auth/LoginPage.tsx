import { useActionState, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Mail, Lock, LogIn, Trash2 } from 'lucide-react'
import { loginSchema } from '../../lib/validation'
import { APP_FULL_NAME } from '../../lib/constants'
import { clearSupabaseSession } from '../../lib/auth-utils'
import { AuthBackdrop } from '../../components/layout/AuthBackdrop'
import { OAuthButtons } from '../../components/auth/OAuthButtons'
import { VirtualCampusButton } from '../../components/auth/VirtualCampusButton'
import { analytics } from '../../hooks/useAnalytics'
import { usePageTitle } from '../../hooks/usePageTitle'
import { Trans, useLingui } from '@lingui/react/macro'
import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'

/**
 * Why the Virtual Campus handoff fails, in words a learner can act on.
 *
 * api/auth/vc/callback.ts never renders an error page — that URL is reached by
 * somebody clicking a button, so it redirects here with ?vc_error=<code>. The
 * codes are deliberately coarse: the server distinguishes a bad signature from
 * a wrong audience for its logs, but telling that apart in the UI helps only an
 * attacker.
 */
const VC_ERRORS: Record<string, MessageDescriptor> = {
  not_configured: msg`Virtual Campus sign-in is not switched on yet. Please use another method.`,
  rate_limited: msg`Too many sign-in attempts. Please wait a few minutes and try again.`,
  email_unverified: msg`Your Virtual Campus email address has not been verified yet. Verify it there, then try again.`,
  token_replayed: msg`That sign-in link has already been used. Please start again from the Virtual Campus.`,
  account_suspended: msg`This account is suspended. Contact support if you think that is a mistake.`,
  subject_bound_elsewhere: msg`That Virtual Campus account is already linked to a different KTIP account.`,
}

function vcErrorDescriptor(code: string): MessageDescriptor {
  return (
    VC_ERRORS[code] ??
    msg`We could not complete sign-in from the Virtual Campus. Please try again from there.`
  )
}

interface LoginActionState {
  errors: Record<string, string>
  errorMessage: string
}

const initialState: LoginActionState = {
  errors: {},
  errorMessage: '',
}

export default function LoginPage() {
    const { t, i18n } = useLingui()
  usePageTitle(t`Log In`)
  const auth = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showRecovery, setShowRecovery] = useState(false)

  const submitAction = async (
    _prevState: LoginActionState,
    formData: FormData
  ): Promise<LoginActionState> => {
    setShowRecovery(false)
    setOauthError('')
    const emailValue = (formData.get('email') as string) || ''
    const passwordValue = (formData.get('password') as string) || ''

    // Validate form
    const result = loginSchema.safeParse({
      email: emailValue,
      password: passwordValue,
    })

    if (!result.success) {
      const fieldErrors: Record<string, string> = {}
      result.error.issues.forEach((error: any) => {
        if (error.path[0]) {
          fieldErrors[error.path[0] as string] = error.message
        }
      })
      return { errors: fieldErrors, errorMessage: '' }
    }

    try {
      // Timeout prevents infinite spinner if Supabase client lock is stuck
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT')), 15000)
      )
      await Promise.race([auth.signIn(emailValue, passwordValue), timeout])
      analytics.conversion('login_success')
      toast.success(t`Welcome back!`)
      navigate('/')
      return { errors: {}, errorMessage: '' }
    } catch (error: any) {
      const msg = error.message || ''
      if (msg === 'TIMEOUT') {
        setShowRecovery(true)
        return {
          errors: {},
          errorMessage: t`Sign in is taking too long. Your session may be stuck.`,
        }
      } else if (msg.includes('Email not confirmed')) {
        return {
          errors: {},
          errorMessage: t`Please confirm your email address first. Check your inbox for a confirmation link.`,
        }
      } else if (msg.includes('Invalid login credentials')) {
        return {
          errors: {},
          errorMessage: t`Invalid email or password. Please try again.`,
        }
      } else if (/banned/i.test(msg)) {
        // GoTrue's wording for an account under ban_duration — what a console
        // suspension sets (api/admin/suspend-user.ts, 124).
        return {
          errors: {},
          errorMessage: t`This account is suspended. Contact support if you think that is a mistake.`,
        }
      } else {
        return {
          errors: {},
          errorMessage: msg || t`Failed to sign in. Please try again.`,
        }
      }
    }
  }

  const [state, formAction, pending] = useActionState(submitAction, initialState)
  const [oauthError, setOauthError] = useState('')
  const [vcError, setVcError] = useState('')

  // The Virtual Campus callback redirects here on failure. Read it once and
  // strip it, so a reload does not resurrect an error the user has moved past.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('vc_error')
    if (!code) return
    setVcError(i18n._(vcErrorDescriptor(code)))
    params.delete('vc_error')
    const query = params.toString()
    window.history.replaceState(null, '', `/login${query ? `?${query}` : ''}`)
  }, [i18n])

  const displayedError = state.errorMessage || oauthError || vcError

  const handleClearSession = () => {
    clearSupabaseSession()
    setShowRecovery(false)
    toast.success(t`Session cleared. Please try signing in again.`)
  }

  return (
    <AuthBackdrop>
      <div className="bg-ktip-cream rounded-lg p-8 w-full max-w-md mx-auto shadow-lg">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-display font-bold text-ktip-ocean-600 mb-2">
            <Trans>Welcome to KTIP</Trans>
          </h1>
          <p className="text-ktip-sand-600">{APP_FULL_NAME}</p>
        </div>

        <form action={formAction} className="space-y-5">
          {displayedError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
              {displayedError}
            </div>
          )}

          {showRecovery && (
            <div className="bg-ktip-sun-50 border border-ktip-sun-200 text-ktip-sun-800 px-4 py-3 rounded-xl text-sm">
              <p className="mb-2"><Trans>A stale session may be blocking sign-in. Clear it and try again.</Trans></p>
              <button
                type="button"
                onClick={handleClearSession}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-ktip-sun-100 hover:bg-ktip-sun-200 rounded-lg transition-colors"
              >
                <Trash2 size={14} />
                <Trans>Clear Session</Trans>
              </button>
            </div>
          )}

          <Input
            type="email"
            name="email"
            label={t`Email`}
            placeholder={t`Enter your email`}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={state.errors.email}
            icon={<Mail size={20} />}
            fullWidth
            required
          />

          <Input
            type="password"
            name="password"
            label={t`Password`}
            placeholder={t`Enter your password`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={state.errors.password}
            icon={<Lock size={20} />}
            fullWidth
            required
          />

          <div className="flex justify-end">
            <Link to="/forgot-password" className="text-sm text-ktip-ocean-600 hover:text-ktip-ocean-700 font-medium">
              <Trans>Forgot password?</Trans>
            </Link>
          </div>

          <Button type="submit" fullWidth loading={pending} icon={<LogIn size={20} />}>
            <Trans>Sign In</Trans>
          </Button>
        </form>

        <OAuthButtons label={t`Or continue with`} onError={setOauthError} />

        <VirtualCampusButton />

        <p className="mt-8 text-center text-sm text-ktip-sand-600">
          <Trans>
            Don't have an account?{' '}
            <Link to="/signup" className="font-medium text-ktip-ocean-600 hover:text-ktip-ocean-700">
              Sign up
            </Link>
          </Trans>
        </p>
      </div>
    </AuthBackdrop>
  )
}
