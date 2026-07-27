import { createSignal, Show } from 'solid-js'
import { A, useNavigate } from '@solidjs/router'
import { useAuth } from '../../contexts/AuthContext'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Lock, CheckCircle } from 'lucide-solid'
import { changePasswordSchema } from '../../lib/validation'

export default function ResetPasswordPage() {
  const auth = useAuth()
  const navigate = useNavigate()

  const [newPassword, setNewPassword] = createSignal('')
  const [confirmPassword, setConfirmPassword] = createSignal('')
  const [errors, setErrors] = createSignal<Record<string, string>>({})
  const [loading, setLoading] = createSignal(false)
  const [errorMessage, setErrorMessage] = createSignal('')
  const [success, setSuccess] = createSignal(false)

  const handleSubmit = async (e: Event) => {
    e.preventDefault()
    setErrors({})
    setErrorMessage('')

    const result = changePasswordSchema.safeParse({
      new_password: newPassword(),
      confirm_password: confirmPassword(),
    })

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
      await auth.updatePassword(newPassword())
      setSuccess(true)
      setTimeout(() => navigate('/'), 3000)
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to reset password. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div class="bg-gray-900 min-h-screen flex items-center justify-center p-4">
      <div class="bg-white rounded-lg p-8 w-full max-w-md mx-auto shadow-lg">
        <Show when={success()}>
          <div class="text-center py-8">
            <div class="w-16 h-16 bg-ktip-tropical-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={32} class="text-ktip-tropical-600" />
            </div>
            <h2 class="text-2xl font-display font-bold text-ktip-sand-900 mb-2">
              Password Reset!
            </h2>
            <p class="text-ktip-sand-600 mb-6">
              Your password has been updated. You'll be redirected shortly.
            </p>
            <A href="/">
              <Button variant="secondary">Go to Home</Button>
            </A>
          </div>
        </Show>

        <Show when={!success()}>
          <div class="text-center mb-8">
            <h1 class="text-3xl font-display font-bold text-ktip-ocean-600 mb-2">
              Set New Password
            </h1>
            <p class="text-ktip-sand-600">
              Enter your new password below
            </p>
          </div>

          <form onSubmit={handleSubmit} class="space-y-5">
            {errorMessage() && (
              <div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
                {errorMessage()}
              </div>
            )}

            <Input
              type="password"
              label="New Password"
              placeholder="Enter new password"
              value={newPassword()}
              onInput={(e) => setNewPassword(e.currentTarget.value)}
              error={errors().new_password}
              icon={<Lock size={20} />}
              fullWidth
              required
            />

            <Input
              type="password"
              label="Confirm Password"
              placeholder="Confirm new password"
              value={confirmPassword()}
              onInput={(e) => setConfirmPassword(e.currentTarget.value)}
              error={errors().confirm_password}
              icon={<Lock size={20} />}
              fullWidth
              required
            />

            <Button type="submit" fullWidth loading={loading()} icon={<Lock size={20} />}>
              Reset Password
            </Button>
          </form>

          <p class="mt-8 text-center text-sm text-ktip-sand-600">
            <A href="/login" class="font-medium text-ktip-ocean-600 hover:text-ktip-ocean-700">
              Back to Sign In
            </A>
          </p>
        </Show>
      </div>
    </div>
  )
}
