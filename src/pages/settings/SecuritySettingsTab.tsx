import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { changePasswordSchema, changeEmailSchema, secondaryEmailSchema } from '../../lib/validation'
import { useMyEmailAlias, useEmailAliasMutations } from '../../hooks/useEmailAlias'
import {
  Lock,
  Mail,
  MailPlus,
  Trash2,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react'

export function SecuritySettingsTab() {
  const auth = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  // Password change
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({})
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [passwordSuccess, setPasswordSuccess] = useState(false)

  // Email change
  const [newEmail, setNewEmail] = useState('')
  const [emailErrors, setEmailErrors] = useState<Record<string, string>>({})
  const [emailLoading, setEmailLoading] = useState(false)
  const [emailSuccess, setEmailSuccess] = useState(false)

  // Secondary email
  const { alias, loading: aliasLoading } = useMyEmailAlias(auth.user?.id)
  const { addAlias, removeAlias, loading: aliasSaving } = useEmailAliasMutations()
  const [secondaryEmail, setSecondaryEmail] = useState('')
  const [aliasErrors, setAliasErrors] = useState<Record<string, string>>({})
  const [aliasSent, setAliasSent] = useState(false)

  // Delete account
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)

  const handleChangePassword = async () => {
    setPasswordErrors({})
    setPasswordSuccess(false)

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
      setPasswordErrors(fieldErrors)
      return
    }

    setPasswordLoading(true)
    try {
      await auth.updatePassword(newPassword)
      setPasswordSuccess(true)
      setNewPassword('')
      setConfirmPassword('')
      toast.success('Password updated successfully!')
    } catch (err: any) {
      setPasswordErrors({ _form: err.message || 'Failed to update password' })
    } finally {
      setPasswordLoading(false)
    }
  }

  const handleChangeEmail = async () => {
    setEmailErrors({})
    setEmailSuccess(false)

    const result = changeEmailSchema.safeParse({ email: newEmail })

    if (!result.success) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of result.error.issues) {
        const field = issue.path[0]?.toString()
        if (field) fieldErrors[field] = issue.message
      }
      setEmailErrors(fieldErrors)
      return
    }

    setEmailLoading(true)
    try {
      await auth.updateEmail(newEmail)
      setEmailSuccess(true)
      toast.success('Confirmation email sent to your new address!')
    } catch (err: any) {
      setEmailErrors({ _form: err.message || 'Failed to update email' })
    } finally {
      setEmailLoading(false)
    }
  }

  /** Add, change the pending address, or resend — one endpoint handles all three. */
  const submitSecondaryEmail = async (value: string) => {
    setAliasErrors({})
    setAliasSent(false)

    const result = secondaryEmailSchema.safeParse({ email: value })
    if (!result.success) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of result.error.issues) {
        const field = issue.path[0]?.toString()
        if (field) fieldErrors[field] = issue.message
      }
      setAliasErrors(fieldErrors)
      return
    }

    try {
      const res = await addAlias(value.trim().toLowerCase())
      if (res.already_verified) {
        toast.success('That address is already verified.')
        return
      }
      setAliasSent(true)
      setSecondaryEmail('')
      // Without Resend configured, dev builds hand the link back instead.
      if (res.dev_link) {
        console.log('[dev] verification link:', res.dev_link)
        toast.success('Verification link logged to the console (dev mode).')
      } else {
        toast.success('Verification email sent.')
      }
    } catch (err: any) {
      setAliasErrors({ _form: err.message || 'Failed to save the address' })
    }
  }

  const handleRemoveSecondaryEmail = async () => {
    setAliasErrors({})
    setAliasSent(false)
    try {
      await removeAlias(auth.user!.id)
      toast.success('Secondary email removed')
    } catch (err: any) {
      setAliasErrors({ _form: err.message || 'Failed to remove the address' })
    }
  }

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') return

    setDeleteLoading(true)
    try {
      await auth.deleteAccount()
      toast.success('Account deleted successfully')
      navigate('/login')
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete account')
    } finally {
      setDeleteLoading(false)
      setShowDeleteModal(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Change Password */}
      <Card>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-ktip-ocean-100 rounded-xl flex items-center justify-center">
            <Lock size={20} className="text-ktip-ocean-600" />
          </div>
          <div>
            <h2 className="text-lg font-display font-bold text-ktip-sand-900">Change Password</h2>
            <p className="text-sm text-ktip-sand-600">Update your account password</p>
          </div>
        </div>

        <div className="space-y-4 max-w-md">
          {passwordSuccess && (
            <div className="flex items-center gap-2 bg-ktip-tropical-50 border border-ktip-tropical-200 text-ktip-tropical-700 px-4 py-3 rounded-xl text-sm">
              <CheckCircle size={18} />
              Password updated successfully!
            </div>
          )}

          {passwordErrors._form && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
              {passwordErrors._form}
            </div>
          )}

          <Input
            type="password"
            label="New Password"
            placeholder="Enter new password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            error={passwordErrors.new_password}
            icon={<Lock size={20} />}
            fullWidth
          />

          <Input
            type="password"
            label="Confirm Password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            error={passwordErrors.confirm_password}
            icon={<Lock size={20} />}
            fullWidth
          />

          <Button onClick={handleChangePassword} loading={passwordLoading}>
            Update Password
          </Button>
        </div>
      </Card>

      {/* Change Email */}
      <Card>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-ktip-ocean-100 rounded-xl flex items-center justify-center">
            <Mail size={20} className="text-ktip-ocean-600" />
          </div>
          <div>
            <h2 className="text-lg font-display font-bold text-ktip-sand-900">Change Email</h2>
            <p className="text-sm text-ktip-sand-600">
              Current: <strong>{auth.user?.email}</strong>
            </p>
          </div>
        </div>

        <div className="space-y-4 max-w-md">
          {emailSuccess && (
            <div className="flex items-center gap-2 bg-ktip-tropical-50 border border-ktip-tropical-200 text-ktip-tropical-700 px-4 py-3 rounded-xl text-sm">
              <CheckCircle size={18} />
              Confirmation sent! Check your new email to verify the change.
            </div>
          )}

          {emailErrors._form && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
              {emailErrors._form}
            </div>
          )}

          <Input
            type="email"
            label="New Email"
            placeholder="Enter new email address"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            error={emailErrors.email}
            icon={<Mail size={20} />}
            fullWidth
          />

          <Button onClick={handleChangeEmail} loading={emailLoading}>
            Update Email
          </Button>
        </div>
      </Card>

      {/* Secondary Email */}
      <Card>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-ktip-ocean-100 rounded-xl flex items-center justify-center">
            <MailPlus size={20} className="text-ktip-ocean-600" />
          </div>
          <div>
            <h2 className="text-lg font-display font-bold text-ktip-sand-900">Secondary Email</h2>
            <p className="text-sm text-ktip-sand-600">
              A backup address that signs in to this account with the same password
            </p>
          </div>
        </div>

        <div className="space-y-4 max-w-md">
          {aliasErrors._form && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
              {aliasErrors._form}
            </div>
          )}

          {aliasLoading ? (
            <div className="h-12 bg-ktip-sand-100 rounded-xl animate-pulse-soft" />
          ) : !alias ? (
            <>
              {aliasSent && (
                <div className="flex items-center gap-2 bg-ktip-tropical-50 border border-ktip-tropical-200 text-ktip-tropical-700 px-4 py-3 rounded-xl text-sm">
                  <CheckCircle size={18} />
                  Check that inbox for a confirmation link.
                </div>
              )}
              <Input
                type="email"
                label="Secondary Email"
                placeholder="Enter a backup email address"
                value={secondaryEmail}
                onChange={(e) => setSecondaryEmail(e.target.value)}
                error={aliasErrors.email}
                icon={<Mail size={20} />}
                fullWidth
              />
              <p className="text-xs text-ktip-sand-500">
                You'll need to confirm the address before it can be used. It cannot already
                belong to another KTIP account.
              </p>
              <Button
                onClick={() => submitSecondaryEmail(secondaryEmail)}
                loading={aliasSaving}
              >
                Add Secondary Email
              </Button>
            </>
          ) : alias.verified_at ? (
            <>
              {alias.email === auth.user?.email?.toLowerCase() ? (
                <div className="bg-ktip-ocean-50 border border-ktip-ocean-200 text-ktip-ocean-700 px-4 py-3 rounded-xl text-sm">
                  <strong>{alias.email}</strong> is now your primary email address, so it no
                  longer works as a secondary one. You can remove it and add a different
                  backup address.
                </div>
              ) : (
                <div className="flex items-center gap-2 bg-ktip-tropical-50 border border-ktip-tropical-200 text-ktip-tropical-700 px-4 py-3 rounded-xl text-sm">
                  <CheckCircle size={18} />
                  <span>
                    <strong>{alias.email}</strong> is verified — you can sign in with it.
                  </span>
                </div>
              )}
              <Button variant="secondary" onClick={handleRemoveSecondaryEmail} loading={aliasSaving}>
                Remove
              </Button>
            </>
          ) : (
            <>
              <div className="bg-ktip-sun-50 border border-ktip-sun-200 text-ktip-sun-800 px-4 py-3 rounded-xl text-sm">
                {alias.token_expires_at && new Date(alias.token_expires_at) > new Date() ? (
                  <>
                    Waiting for confirmation of <strong>{alias.email}</strong>. Check that
                    inbox — the link expires 24 hours after it was sent.
                  </>
                ) : (
                  <>
                    The confirmation link for <strong>{alias.email}</strong> expired. Send a
                    fresh one, or remove the address.
                  </>
                )}
              </div>
              <div className="flex flex-wrap gap-3">
                <Button onClick={() => submitSecondaryEmail(alias.email)} loading={aliasSaving}>
                  Resend Link
                </Button>
                <Button variant="secondary" onClick={handleRemoveSecondaryEmail} loading={aliasSaving}>
                  Remove
                </Button>
              </div>
            </>
          )}

          {/* OAuth-only accounts have no password, so there is nothing to sign in with yet. */}
          {!auth.user?.identities?.some((i) => i.provider === 'email') && (
            <p className="text-xs text-ktip-sand-500">
              You sign in with Google or Microsoft, so this address can't sign in until you set
              a password — use "Forgot password" with it once it's verified.
            </p>
          )}
        </div>
      </Card>

      {/* Delete Account */}
      <Card className="border-red-200">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
            <Trash2 size={20} className="text-red-600" />
          </div>
          <div>
            <h2 className="text-lg font-display font-bold text-red-700">Delete Account</h2>
            <p className="text-sm text-ktip-sand-600">Permanently delete your account and all associated data</p>
          </div>
        </div>

        <p className="text-sm text-ktip-sand-600 mb-4">
          Once deleted, your account cannot be recovered. All your projects, events, messages, and profile data will be permanently removed.
        </p>

        <Button
          variant="outline"
          onClick={() => setShowDeleteModal(true)}
          className="border-red-300 text-red-600 hover:bg-red-50"
          icon={<Trash2 size={18} />}
        >
          Delete My Account
        </Button>
      </Card>

      {/* Delete Confirmation Modal */}
      <Modal
        open={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Account"
        description="This action is permanent and cannot be undone."
        size="md"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
            <AlertTriangle size={20} className="text-red-600 shrink-0 mt-0.5" />
            <div className="text-sm text-red-700">
              <p className="font-medium mb-1">Warning: This will permanently delete:</p>
              <ul className="list-disc ml-4 space-y-1">
                <li>Your profile and personal data</li>
                <li>All projects you created</li>
                <li>All messages and conversations</li>
                <li>Event registrations and forum posts</li>
              </ul>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-ktip-sand-700 mb-2">
              Type <strong>DELETE</strong> to confirm
            </label>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE"
              className="w-full border border-ktip-sand-200 rounded-xl px-4 py-3 bg-ktip-sand-50/50 transition-all focus:outline-none focus:ring-2 focus:border-red-500 focus:ring-red-500/20 focus:bg-ktip-cream"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleDeleteAccount}
              loading={deleteLoading}
              disabled={deleteConfirmText !== 'DELETE'}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete Forever
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
