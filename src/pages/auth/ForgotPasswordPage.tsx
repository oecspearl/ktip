import { useActionState, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../../contexts/AuthContext'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Mail, ArrowLeft, CheckCircle } from 'lucide-react'
import { forgotPasswordSchema } from '../../lib/validation'

interface ForgotPasswordActionState {
  errors: Record<string, string>
  errorMessage: string
  emailSent: boolean
}

const initialState: ForgotPasswordActionState = {
  errors: {},
  errorMessage: '',
  emailSent: false,
}

export default function ForgotPasswordPage() {
  const auth = useAuth()

  const [email, setEmail] = useState('')

  const submitAction = async (
    _prevState: ForgotPasswordActionState,
    _formData: FormData
  ): Promise<ForgotPasswordActionState> => {
    const result = forgotPasswordSchema.safeParse({ email })

    if (!result.success) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of result.error.issues) {
        const field = issue.path[0]?.toString()
        if (field) fieldErrors[field] = issue.message
      }
      return { errors: fieldErrors, errorMessage: '', emailSent: false }
    }

    try {
      await auth.resetPassword(email)
      return { errors: {}, errorMessage: '', emailSent: true }
    } catch (err: any) {
      return {
        errors: {},
        errorMessage: err.message || 'Failed to send reset email. Please try again.',
        emailSent: false,
      }
    }
  }

  const [state, formAction, pending] = useActionState(submitAction, initialState)

  return (
    <div className="bg-gray-900 min-h-screen flex items-center justify-center p-4">
      <div className="bg-white rounded-lg p-8 w-full max-w-md mx-auto shadow-lg">
        {state.emailSent ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-ktip-tropical-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={32} className="text-ktip-tropical-600" />
            </div>
            <h2 className="text-2xl font-display font-bold text-ktip-sand-900 mb-2">
              Check your email
            </h2>
            <p className="text-ktip-sand-600 mb-6 max-w-sm mx-auto">
              We've sent a password reset link to <strong className="text-ktip-sand-800">{email}</strong>. Click the link to set a new password.
            </p>
            <Link to="/login">
              <Button variant="secondary">Back to Sign In</Button>
            </Link>
          </div>
        ) : (
          <>
            <div className="text-center mb-8">
              <h1 className="text-3xl font-display font-bold text-ktip-ocean-600 mb-2">
                Forgot Password?
              </h1>
              <p className="text-ktip-sand-600">
                Enter your email and we'll send you a reset link
              </p>
            </div>

            <form action={formAction} className="space-y-5">
              {state.errorMessage && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
                  {state.errorMessage}
                </div>
              )}

              <Input
                type="email"
                label="Email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={state.errors.email}
                icon={<Mail size={20} />}
                fullWidth
                required
              />

              <Button type="submit" fullWidth loading={pending} icon={<Mail size={20} />}>
                Send Reset Link
              </Button>
            </form>

            <p className="mt-8 text-center text-sm text-ktip-sand-600">
              <Link to="/login" className="font-medium text-ktip-ocean-600 hover:text-ktip-ocean-700 inline-flex items-center gap-1">
                <ArrowLeft size={14} />
                Back to Sign In
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
