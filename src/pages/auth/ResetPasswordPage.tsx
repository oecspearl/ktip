import { useActionState, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../../contexts/AuthContext'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Lock, CheckCircle, MailWarning } from 'lucide-react'
import { changePasswordSchema } from '../../lib/validation'
import { AuthBackdrop } from '../../components/layout/AuthBackdrop'
import { RouteSplash } from '../../components/RouteSplash'
import { Trans, useLingui } from '@lingui/react/macro'

interface ResetPasswordActionState {
  errors: Record<string, string>
  errorMessage: string
  success: boolean
}

const initialState: ResetPasswordActionState = {
  errors: {},
  errorMessage: '',
  success: false,
}

export default function ResetPasswordPage() {
    const { t } = useLingui()
  const auth = useAuth()
  const navigate = useNavigate()

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const submitAction = async (
    _prevState: ResetPasswordActionState,
    _formData: FormData
  ): Promise<ResetPasswordActionState> => {
    const result = changePasswordSchema.safeParse({
      new_password: newPassword,
      confirm_password: confirmPassword,
    })

    if (!result.success) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of result.error.issues) {
        const field = issue.path[0]?.toString()
        if (field) fieldErrors[field] = issue.message
      }
      return { errors: fieldErrors, errorMessage: '', success: false }
    }

    try {
      await auth.updatePassword(newPassword)
      return { errors: {}, errorMessage: '', success: true }
    } catch (err: any) {
      return {
        errors: {},
        errorMessage: err.message || t`Failed to reset password. Please try again.`,
        success: false,
      }
    }
  }

  const [state, formAction, pending] = useActionState(submitAction, initialState)

  useEffect(() => {
    if (!state.success) return
    const timer = setTimeout(() => navigate('/'), 3000)
    return () => clearTimeout(timer)
  }, [state.success, navigate])

  // The recovery link is what puts a session on this page — updatePassword has
  // nothing to authenticate without it. Rendering the form regardless meant a
  // dead link failed only at submit time, with GoTrue's "Auth session missing!"
  // as the entire explanation.
  if (auth.loading) {
    return <RouteSplash />
  }

  if (!auth.user) {
    return (
      <AuthBackdrop>
        <div className="bg-ktip-cream rounded-lg p-8 w-full max-w-md mx-auto shadow-lg text-center">
          <div className="w-16 h-16 bg-ktip-sand-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <MailWarning size={32} className="text-ktip-sand-600" />
          </div>
          <h1 className="text-2xl font-display font-bold text-ktip-sand-900 mb-2">
            <Trans>This reset link can't be used here</Trans>
          </h1>
          <p className="text-ktip-sand-600 mb-6 text-sm">
            <Trans>Reset links work once, expire after an hour, and only open in the browser that requested them — a link opened inside a mail app, or on a different device, lands here. Request a fresh one and open it in this browser.</Trans>
          </p>
          <Link to="/forgot-password">
            <Button fullWidth><Trans>Request a new link</Trans></Button>
          </Link>
          <p className="mt-6 text-sm text-ktip-sand-600">
            <Link to="/login" className="font-medium text-ktip-ocean-600 hover:text-ktip-ocean-700">
              <Trans>Back to Sign In</Trans>
            </Link>
          </p>
        </div>
      </AuthBackdrop>
    )
  }

  return (
    <AuthBackdrop>
      <div className="bg-ktip-cream rounded-lg p-8 w-full max-w-md mx-auto shadow-lg">
        {state.success ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-ktip-tropical-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={32} className="text-ktip-tropical-600" />
            </div>
            <h2 className="text-2xl font-display font-bold text-ktip-sand-900 mb-2">
              <Trans>Password Reset!</Trans>
            </h2>
            <p className="text-ktip-sand-600 mb-6">
              <Trans>Your password has been updated. You'll be redirected shortly.</Trans>
            </p>
            <Link to="/">
              <Button variant="secondary"><Trans>Go to Home</Trans></Button>
            </Link>
          </div>
        ) : (
          <>
            <div className="text-center mb-8">
              <h1 className="text-3xl font-display font-bold text-ktip-ocean-600 mb-2">
                <Trans>Set New Password</Trans>
              </h1>
              <p className="text-ktip-sand-600">
                <Trans>Enter your new password below</Trans>
              </p>
            </div>

            <form action={formAction} className="space-y-5">
              {state.errorMessage && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
                  {state.errorMessage}
                </div>
              )}

              <Input
                type="password"
                label={t`New Password`}
                placeholder={t`Enter new password`}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                error={state.errors.new_password}
                icon={<Lock size={20} />}
                fullWidth
                required
              />

              <Input
                type="password"
                label={t`Confirm Password`}
                placeholder={t`Confirm new password`}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                error={state.errors.confirm_password}
                icon={<Lock size={20} />}
                fullWidth
                required
              />

              <Button type="submit" fullWidth loading={pending} icon={<Lock size={20} />}>
                <Trans>Reset Password</Trans>
              </Button>
            </form>

            <p className="mt-8 text-center text-sm text-ktip-sand-600">
              <Link to="/login" className="font-medium text-ktip-ocean-600 hover:text-ktip-ocean-700">
                <Trans>Back to Sign In</Trans>
              </Link>
            </p>
          </>
        )}
      </div>
    </AuthBackdrop>
  )
}
