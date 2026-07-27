import { createSignal, Show } from 'solid-js'
import { A } from '@solidjs/router'
import { useAuth } from '../../contexts/AuthContext'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Mail, ArrowLeft, CheckCircle } from 'lucide-solid'
import { forgotPasswordSchema } from '../../lib/validation'

export default function ForgotPasswordPage() {
  const auth = useAuth()

  const [email, setEmail] = createSignal('')
  const [errors, setErrors] = createSignal<Record<string, string>>({})
  const [loading, setLoading] = createSignal(false)
  const [errorMessage, setErrorMessage] = createSignal('')
  const [emailSent, setEmailSent] = createSignal(false)

  const handleSubmit = async (e: Event) => {
    e.preventDefault()
    setErrors({})
    setErrorMessage('')

    const result = forgotPasswordSchema.safeParse({ email: email() })

    if (!result.success) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of result.error.issues) {
        const field = issue.path[0]?.toString()
        if (field) fieldErrors[field] = issue.message
      }
      setErrors(fieldErrors)
      return
    }

    setLoading(true)
    try {
      await auth.resetPassword(email())
      setEmailSent(true)
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to send reset email. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div class="bg-gray-900 min-h-screen flex items-center justify-center p-4">
      <div class="bg-white rounded-lg p-8 w-full max-w-md mx-auto shadow-lg">
        <Show when={emailSent()}>
          <div class="text-center py-8">
            <div class="w-16 h-16 bg-ktip-tropical-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={32} class="text-ktip-tropical-600" />
            </div>
            <h2 class="text-2xl font-display font-bold text-ktip-sand-900 mb-2">
              Check your email
            </h2>
            <p class="text-ktip-sand-600 mb-6 max-w-sm mx-auto">
              We've sent a password reset link to <strong class="text-ktip-sand-800">{email()}</strong>. Click the link to set a new password.
            </p>
            <A href="/login">
              <Button variant="secondary">Back to Sign In</Button>
            </A>
          </div>
        </Show>

        <Show when={!emailSent()}>
          <div class="text-center mb-8">
            <h1 class="text-3xl font-display font-bold text-ktip-ocean-600 mb-2">
              Forgot Password?
            </h1>
            <p class="text-ktip-sand-600">
              Enter your email and we'll send you a reset link
            </p>
          </div>

          <form onSubmit={handleSubmit} class="space-y-5">
            {errorMessage() && (
              <div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
                {errorMessage()}
              </div>
            )}

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

            <Button type="submit" fullWidth loading={loading()} icon={<Mail size={20} />}>
              Send Reset Link
            </Button>
          </form>

          <p class="mt-8 text-center text-sm text-ktip-sand-600">
            <A href="/login" class="font-medium text-ktip-ocean-600 hover:text-ktip-ocean-700 inline-flex items-center gap-1">
              <ArrowLeft size={14} />
              Back to Sign In
            </A>
          </p>
        </Show>
      </div>
    </div>
  )
}
