import { createSignal, For, Show } from 'solid-js'
import { A } from '@solidjs/router'
import { useAuth } from '../../contexts/AuthContext'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Mail, Lock, User, UserPlus, CheckCircle } from 'lucide-solid'
import { signupSchema } from '../../lib/validation'
import { APP_FULL_NAME, USER_ROLES, ROLE_LABELS } from '../../lib/constants'
import { analytics } from '../../hooks/useAnalytics'

export default function SignupPage() {
  const auth = useAuth()

  const [email, setEmail] = createSignal('')
  const [password, setPassword] = createSignal('')
  const [displayName, setDisplayName] = createSignal('')
  const [selectedRole, setSelectedRole] = createSignal('')
  const [errors, setErrors] = createSignal<Record<string, string>>({})
  const [loading, setLoading] = createSignal(false)
  const [errorMessage, setErrorMessage] = createSignal('')
  const [emailSent, setEmailSent] = createSignal(false)

  const roles = [
    { value: USER_ROLES.STUDENT, label: ROLE_LABELS.student, description: 'Learn and collaborate on projects' },
    { value: USER_ROLES.MENTOR, label: ROLE_LABELS.mentor, description: 'Guide and support innovators' },
    { value: USER_ROLES.INVESTOR, label: ROLE_LABELS.investor, description: 'Discover and fund projects' },
    { value: USER_ROLES.ENTREPRENEUR, label: ROLE_LABELS.entrepreneur, description: 'Build and launch innovations' },
    { value: USER_ROLES.PRIVATE_SECTOR, label: ROLE_LABELS.private_sector, description: 'Partner with innovators' },
  ]

  const handleSubmit = async (e: Event) => {
    e.preventDefault()
    setErrors({})
    setErrorMessage('')

    // Validate form
    const result = signupSchema.safeParse({
      email: email(),
      password: password(),
      display_name: displayName(),
      role: selectedRole(),
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
      await auth.signUp(email(), password(), {
        display_name: displayName(),
        role: selectedRole(),
      })
      analytics.conversion('signup_success', { role: selectedRole() })
      setEmailSent(true)
    } catch (error: any) {
      setErrorMessage(error.message || 'Failed to create account. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div class="bg-gray-900 min-h-screen flex items-center justify-center p-4">
      <div class="bg-white rounded-lg p-8 w-full max-w-2xl mx-auto shadow-lg">
        <Show when={emailSent()}>
          <div class="text-center py-8">
            <div class="w-16 h-16 bg-ktip-tropical-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={32} class="text-ktip-tropical-600" />
            </div>
            <h2 class="text-2xl font-display font-bold text-ktip-sand-900 mb-2">
              Check your email
            </h2>
            <p class="text-ktip-sand-600 mb-6 max-w-md mx-auto">
              We've sent a confirmation link to <strong class="text-ktip-sand-800">{email()}</strong>. Click the link to verify your account and get started.
            </p>
            <A href="/login">
              <Button variant="secondary">Go to Sign In</Button>
            </A>
          </div>
        </Show>

        <Show when={!emailSent()}>
        <div class="text-center mb-8">
          <h1 class="text-4xl font-display font-bold text-ktip-ocean-600 mb-2">
            Join KTIP
          </h1>
          <p class="text-ktip-sand-600">{APP_FULL_NAME}</p>
        </div>

        <form onSubmit={handleSubmit} class="space-y-5">
          {errorMessage() && (
            <div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
              {errorMessage()}
            </div>
          )}

          <Input
            type="text"
            label="Display Name"
            placeholder="Enter your full name"
            value={displayName()}
            onInput={(e) => setDisplayName(e.currentTarget.value)}
            error={errors().display_name}
            icon={<User size={20} />}
            fullWidth
            required
          />

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
            placeholder="Create a password (min 6 characters)"
            value={password()}
            onInput={(e) => setPassword(e.currentTarget.value)}
            error={errors().password}
            helperText="Must be at least 6 characters"
            icon={<Lock size={20} />}
            fullWidth
            required
          />

          <div>
            <label class="block text-sm font-medium text-ktip-sand-700 mb-2">
              I am a... <span class="text-red-500">*</span>
            </label>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <For each={roles}>
                {(role) => (
                  <button
                    type="button"
                    onClick={() => setSelectedRole(role.value)}
                    class={`p-4 rounded-xl border-2 text-left transition-all ${
                      selectedRole() === role.value
                        ? 'border-ktip-ocean-500 bg-ktip-ocean-50'
                        : 'border-ktip-sand-200 hover:border-ktip-ocean-300'
                    }`}
                  >
                    <div class="font-medium text-ktip-sand-900">{role.label}</div>
                    <div class="text-sm text-ktip-sand-600 mt-1">{role.description}</div>
                  </button>
                )}
              </For>
            </div>
            {errors().role && (
              <p class="mt-2 text-sm text-red-600">{errors().role}</p>
            )}
          </div>

          <Button type="submit" fullWidth loading={loading()} icon={<UserPlus size={20} />}>
            Create Account
          </Button>
        </form>

        <p class="mt-8 text-center text-sm text-ktip-sand-600">
          Already have an account?{' '}
          <A href="/login" class="font-medium text-ktip-ocean-600 hover:text-ktip-ocean-700">
            Sign in
          </A>
        </p>
        </Show>
      </div>
    </div>
  )
}
