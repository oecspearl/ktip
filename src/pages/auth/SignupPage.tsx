import { useActionState, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../../contexts/AuthContext'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Mail, Lock, User, UserPlus, CheckCircle } from 'lucide-react'
import { signupSchema } from '../../lib/validation'
import { APP_FULL_NAME, USER_ROLES, ROLE_LABELS } from '../../lib/constants'
import { analytics } from '../../hooks/useAnalytics'

interface SignupActionState {
  errors: Record<string, string>
  errorMessage: string
  emailSent: boolean
}

const initialState: SignupActionState = {
  errors: {},
  errorMessage: '',
  emailSent: false,
}

const roles = [
  { value: USER_ROLES.STUDENT, label: ROLE_LABELS.student, description: 'Learn and collaborate on projects' },
  { value: USER_ROLES.MENTOR, label: ROLE_LABELS.mentor, description: 'Guide and support innovators' },
  { value: USER_ROLES.INVESTOR, label: ROLE_LABELS.investor, description: 'Discover and fund projects' },
  { value: USER_ROLES.ENTREPRENEUR, label: ROLE_LABELS.entrepreneur, description: 'Build and launch innovations' },
  { value: USER_ROLES.PRIVATE_SECTOR, label: ROLE_LABELS.private_sector, description: 'Partner with innovators' },
]

export default function SignupPage() {
  const auth = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [selectedRole, setSelectedRole] = useState('')

  const submitAction = async (
    _prevState: SignupActionState,
    _formData: FormData
  ): Promise<SignupActionState> => {
    // Validate form
    const result = signupSchema.safeParse({
      email,
      password,
      display_name: displayName,
      role: selectedRole,
    })

    if (!result.success) {
      const fieldErrors: Record<string, string> = {}
      result.error.issues.forEach((error: any) => {
        if (error.path[0]) {
          fieldErrors[error.path[0] as string] = error.message
        }
      })
      return { errors: fieldErrors, errorMessage: '', emailSent: false }
    }

    try {
      await auth.signUp(email, password, {
        display_name: displayName,
        role: selectedRole,
      })
      analytics.conversion('signup_success', { role: selectedRole })
      return { errors: {}, errorMessage: '', emailSent: true }
    } catch (error: any) {
      return {
        errors: {},
        errorMessage: error.message || 'Failed to create account. Please try again.',
        emailSent: false,
      }
    }
  }

  const [state, formAction, pending] = useActionState(submitAction, initialState)

  return (
    <div className="bg-gray-900 min-h-screen flex items-center justify-center p-4">
      <div className="bg-white rounded-lg p-8 w-full max-w-2xl mx-auto shadow-lg">
        {state.emailSent ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-ktip-tropical-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={32} className="text-ktip-tropical-600" />
            </div>
            <h2 className="text-2xl font-display font-bold text-ktip-sand-900 mb-2">
              Check your email
            </h2>
            <p className="text-ktip-sand-600 mb-6 max-w-md mx-auto">
              We've sent a confirmation link to <strong className="text-ktip-sand-800">{email}</strong>. Click the link to verify your account and get started.
            </p>
            <Link to="/login">
              <Button variant="secondary">Go to Sign In</Button>
            </Link>
          </div>
        ) : (
          <>
            <div className="text-center mb-8">
              <h1 className="text-4xl font-display font-bold text-ktip-ocean-600 mb-2">
                Join KTIP
              </h1>
              <p className="text-ktip-sand-600">{APP_FULL_NAME}</p>
            </div>

            <form action={formAction} className="space-y-5">
              {state.errorMessage && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
                  {state.errorMessage}
                </div>
              )}

              <Input
                type="text"
                label="Display Name"
                placeholder="Enter your full name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                error={state.errors.display_name}
                icon={<User size={20} />}
                fullWidth
                required
              />

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

              <Input
                type="password"
                label="Password"
                placeholder="Create a password (min 6 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={state.errors.password}
                helperText="Must be at least 6 characters"
                icon={<Lock size={20} />}
                fullWidth
                required
              />

              <div>
                <label className="block text-sm font-medium text-ktip-sand-700 mb-2">
                  I am a... <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {roles.map((role) => (
                    <button
                      key={role.value}
                      type="button"
                      onClick={() => setSelectedRole(role.value)}
                      className={`p-4 rounded-xl border-2 text-left transition-all ${
                        selectedRole === role.value
                          ? 'border-ktip-ocean-500 bg-ktip-ocean-50'
                          : 'border-ktip-sand-200 hover:border-ktip-ocean-300'
                      }`}
                    >
                      <div className="font-medium text-ktip-sand-900">{role.label}</div>
                      <div className="text-sm text-ktip-sand-600 mt-1">{role.description}</div>
                    </button>
                  ))}
                </div>
                {state.errors.role && (
                  <p className="mt-2 text-sm text-red-600">{state.errors.role}</p>
                )}
              </div>

              <Button type="submit" fullWidth loading={pending} icon={<UserPlus size={20} />}>
                Create Account
              </Button>
            </form>

            <p className="mt-8 text-center text-sm text-ktip-sand-600">
              Already have an account?{' '}
              <Link to="/login" className="font-medium text-ktip-ocean-600 hover:text-ktip-ocean-700">
                Sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
