import { createSignal, Show } from 'solid-js'
import { A, useNavigate } from '@solidjs/router'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Mail, Lock, LogIn, Trash2 } from 'lucide-solid'
import { loginSchema } from '../../lib/validation'
import { APP_FULL_NAME } from '../../lib/constants'
import { clearSupabaseSession } from '../../lib/auth-utils'
import { analytics } from '../../hooks/useAnalytics'
import { usePageTitle } from '../../hooks/usePageTitle'

export default function LoginPage() {
  usePageTitle(() => 'Log In')
  const auth = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const [email, setEmail] = createSignal('')
  const [password, setPassword] = createSignal('')
  const [errors, setErrors] = createSignal<Record<string, string>>({})
  const [loading, setLoading] = createSignal(false)
  const [errorMessage, setErrorMessage] = createSignal('')
  const [showRecovery, setShowRecovery] = createSignal(false)

  const handleClearSession = () => {
    clearSupabaseSession()
    setShowRecovery(false)
    setErrorMessage('')
    toast.success('Session cleared. Please try signing in again.')
  }

  const handleSubmit = async (e: Event) => {
    e.preventDefault()
    setErrors({})
    setErrorMessage('')

    // Validate form
    const result = loginSchema.safeParse({
      email: email(),
      password: password(),
    })

    if (!result.success) {
      const fieldErrors: Record<string, string> = {}
      result.error.issues.forEach((error: any) => {
        if (error.path[0]) {
          fieldErrors[error.path[0] as string] = error.message
        }
      })
      setErrors(fieldErrors)
      return
    }

    setLoading(true)

    try {
      // Timeout prevents infinite spinner if Supabase client lock is stuck
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT')), 15000)
      )
      await Promise.race([auth.signIn(email(), password()), timeout])
      analytics.conversion('login_success')
      toast.success('Welcome back!')
      navigate('/')
    } catch (error: any) {
      const msg = error.message || ''
      if (msg === 'TIMEOUT') {
        setErrorMessage('Sign in is taking too long. Your session may be stuck.')
        setShowRecovery(true)
      } else if (msg.includes('Email not confirmed')) {
        setErrorMessage('Please confirm your email address first. Check your inbox for a confirmation link.')
      } else if (msg.includes('Invalid login credentials')) {
        setErrorMessage('Invalid email or password. Please try again.')
      } else {
        setErrorMessage(msg || 'Failed to sign in. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    try {
      await auth.signInWithGoogle()
    } catch (error: any) {
      setErrorMessage(error.message || 'Failed to sign in with Google.')
    }
  }

  const handleMicrosoftSignIn = async () => {
    try {
      await auth.signInWithMicrosoft()
    } catch (error: any) {
      setErrorMessage(error.message || 'Failed to sign in with Microsoft.')
    }
  }

  return (
    <div class="bg-gray-900 min-h-screen flex items-center justify-center p-4">
      <div class="bg-white rounded-lg p-8 w-full max-w-md mx-auto shadow-lg">
        <div class="text-center mb-8">
          <h1 class="text-4xl font-display font-bold text-ktip-ocean-600 mb-2">
            Welcome to KTIP
          </h1>
          <p class="text-ktip-sand-600">{APP_FULL_NAME}</p>
        </div>

        <form onSubmit={handleSubmit} class="space-y-5">
          {errorMessage() && (
            <div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
              {errorMessage()}
            </div>
          )}

          <Show when={showRecovery()}>
            <div class="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-sm">
              <p class="mb-2">A stale session may be blocking sign-in. Clear it and try again.</p>
              <button
                type="button"
                onClick={handleClearSession}
                class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-amber-100 hover:bg-amber-200 rounded-lg transition-colors"
              >
                <Trash2 size={14} />
                Clear Session
              </button>
            </div>
          </Show>

          <Input
            type="email"
            label="Email"
            placeholder="Enter your email"
            value={email()}
            onInput={(e) => setEmail(e.currentTarget.value)}
            error={errors().email}
            icon={<Mail size={20} />}
            fullWidth
            required
          />

          <Input
            type="password"
            label="Password"
            placeholder="Enter your password"
            value={password()}
            onInput={(e) => setPassword(e.currentTarget.value)}
            error={errors().password}
            icon={<Lock size={20} />}
            fullWidth
            required
          />

          <div class="flex justify-end">
            <A href="/forgot-password" class="text-sm text-ktip-ocean-600 hover:text-ktip-ocean-700 font-medium">
              Forgot password?
            </A>
          </div>

          <Button type="submit" fullWidth loading={loading()} icon={<LogIn size={20} />}>
            Sign In
          </Button>
        </form>

        <div class="mt-6">
          <div class="relative">
            <div class="absolute inset-0 flex items-center">
              <div class="w-full border-t border-ktip-sand-200"></div>
            </div>
            <div class="relative flex justify-center text-sm">
              <span class="px-2 bg-white text-ktip-sand-500">Or continue with</span>
            </div>
          </div>

          <div class="mt-6 grid grid-cols-2 gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleGoogleSignIn}
              class="flex items-center justify-center gap-2"
            >
              <svg class="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Google
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={handleMicrosoftSignIn}
              class="flex items-center justify-center gap-2"
            >
              <svg class="w-5 h-5" viewBox="0 0 23 23">
                <path fill="#f3f3f3" d="M0 0h23v23H0z" />
                <path fill="#f35325" d="M1 1h10v10H1z" />
                <path fill="#81bc06" d="M12 1h10v10H12z" />
                <path fill="#05a6f0" d="M1 12h10v10H1z" />
                <path fill="#ffba08" d="M12 12h10v10H12z" />
              </svg>
              Microsoft
            </Button>
          </div>
        </div>

        <p class="mt-8 text-center text-sm text-ktip-sand-600">
          Don't have an account?{' '}
          <A href="/signup" class="font-medium text-ktip-ocean-600 hover:text-ktip-ocean-700">
            Sign up
          </A>
        </p>
      </div>
    </div>
  )
}
