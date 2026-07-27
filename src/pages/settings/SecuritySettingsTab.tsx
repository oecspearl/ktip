import { createSignal, Show } from 'solid-js'
import { useNavigate } from '@solidjs/router'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { changePasswordSchema, changeEmailSchema } from '../../lib/validation'
import {
  Lock,
  Mail,
  Trash2,
  AlertTriangle,
  CheckCircle,
} from 'lucide-solid'

export function SecuritySettingsTab() {
  const auth = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  // Password change
  const [newPassword, setNewPassword] = createSignal('')
  const [confirmPassword, setConfirmPassword] = createSignal('')
  const [passwordErrors, setPasswordErrors] = createSignal<Record<string, string>>({})
  const [passwordLoading, setPasswordLoading] = createSignal(false)
  const [passwordSuccess, setPasswordSuccess] = createSignal(false)

  // Email change
  const [newEmail, setNewEmail] = createSignal('')
  const [emailErrors, setEmailErrors] = createSignal<Record<string, string>>({})
  const [emailLoading, setEmailLoading] = createSignal(false)
  const [emailSuccess, setEmailSuccess] = createSignal(false)

  // Delete account
  const [showDeleteModal, setShowDeleteModal] = createSignal(false)
  const [deleteConfirmText, setDeleteConfirmText] = createSignal('')
  const [deleteLoading, setDeleteLoading] = createSignal(false)

  const handleChangePassword = async () => {
    setPasswordErrors({})
    setPasswordSuccess(false)

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
      setPasswordErrors(fieldErrors)
      return
    }

    setPasswordLoading(true)
    try {
      await auth.updatePassword(newPassword())
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

    const result = changeEmailSchema.safeParse({ email: newEmail() })

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
      await auth.updateEmail(newEmail())
      setEmailSuccess(true)
      toast.success('Confirmation email sent to your new address!')
    } catch (err: any) {
      setEmailErrors({ _form: err.message || 'Failed to update email' })
    } finally {
      setEmailLoading(false)
    }
  }

  const handleDeleteAccount = async () => {
    if (deleteConfirmText() !== 'DELETE') return

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
    <div class="space-y-6">
      {/* Change Password */}
      <Card>
        <div class="flex items-center gap-3 mb-4">
          <div class="w-10 h-10 bg-ktip-ocean-100 rounded-xl flex items-center justify-center">
            <Lock size={20} class="text-ktip-ocean-600" />
          </div>
          <div>
            <h2 class="text-lg font-display font-bold text-ktip-sand-900">Change Password</h2>
            <p class="text-sm text-ktip-sand-600">Update your account password</p>
          </div>
        </div>

        <div class="space-y-4 max-w-md">
          <Show when={passwordSuccess()}>
            <div class="flex items-center gap-2 bg-ktip-tropical-50 border border-ktip-tropical-200 text-ktip-tropical-700 px-4 py-3 rounded-xl text-sm">
              <CheckCircle size={18} />
              Password updated successfully!
            </div>
          </Show>

          <Show when={passwordErrors()._form}>
            <div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
              {passwordErrors()._form}
            </div>
          </Show>

          <Input
            type="password"
            label="New Password"
            placeholder="Enter new password"
            value={newPassword()}
            onInput={(e) => setNewPassword(e.currentTarget.value)}
            error={passwordErrors().new_password}
            icon={<Lock size={20} />}
            fullWidth
          />

          <Input
            type="password"
            label="Confirm Password"
            placeholder="Confirm new password"
            value={confirmPassword()}
            onInput={(e) => setConfirmPassword(e.currentTarget.value)}
            error={passwordErrors().confirm_password}
            icon={<Lock size={20} />}
            fullWidth
          />

          <Button onClick={handleChangePassword} loading={passwordLoading()}>
            Update Password
          </Button>
        </div>
      </Card>

      {/* Change Email */}
      <Card>
        <div class="flex items-center gap-3 mb-4">
          <div class="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
            <Mail size={20} class="text-indigo-600" />
          </div>
          <div>
            <h2 class="text-lg font-display font-bold text-ktip-sand-900">Change Email</h2>
            <p class="text-sm text-ktip-sand-600">
              Current: <strong>{auth.user()?.email}</strong>
            </p>
          </div>
        </div>

        <div class="space-y-4 max-w-md">
          <Show when={emailSuccess()}>
            <div class="flex items-center gap-2 bg-ktip-tropical-50 border border-ktip-tropical-200 text-ktip-tropical-700 px-4 py-3 rounded-xl text-sm">
              <CheckCircle size={18} />
              Confirmation sent! Check your new email to verify the change.
            </div>
          </Show>

          <Show when={emailErrors()._form}>
            <div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
              {emailErrors()._form}
            </div>
          </Show>

          <Input
            type="email"
            label="New Email"
            placeholder="Enter new email address"
            value={newEmail()}
            onInput={(e) => setNewEmail(e.currentTarget.value)}
            error={emailErrors().email}
            icon={<Mail size={20} />}
            fullWidth
          />

          <Button onClick={handleChangeEmail} loading={emailLoading()}>
            Update Email
          </Button>
        </div>
      </Card>

      {/* Delete Account */}
      <Card class="border-red-200">
        <div class="flex items-center gap-3 mb-4">
          <div class="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
            <Trash2 size={20} class="text-red-600" />
          </div>
          <div>
            <h2 class="text-lg font-display font-bold text-red-700">Delete Account</h2>
            <p class="text-sm text-ktip-sand-600">Permanently delete your account and all associated data</p>
          </div>
        </div>

        <p class="text-sm text-ktip-sand-600 mb-4">
          Once deleted, your account cannot be recovered. All your projects, events, messages, and profile data will be permanently removed.
        </p>

        <Button
          variant="outline"
          onClick={() => setShowDeleteModal(true)}
          class="border-red-300 text-red-600 hover:bg-red-50"
          icon={<Trash2 size={18} />}
        >
          Delete My Account
        </Button>
      </Card>

      {/* Delete Confirmation Modal */}
      <Modal
        open={showDeleteModal()}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Account"
        description="This action is permanent and cannot be undone."
        size="md"
      >
        <div class="space-y-4">
          <div class="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
            <AlertTriangle size={20} class="text-red-600 shrink-0 mt-0.5" />
            <div class="text-sm text-red-700">
              <p class="font-medium mb-1">Warning: This will permanently delete:</p>
              <ul class="list-disc ml-4 space-y-1">
                <li>Your profile and personal data</li>
                <li>All projects you created</li>
                <li>All messages and conversations</li>
                <li>Event registrations and forum posts</li>
              </ul>
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-ktip-sand-700 mb-2">
              Type <strong>DELETE</strong> to confirm
            </label>
            <input
              type="text"
              value={deleteConfirmText()}
              onInput={(e) => setDeleteConfirmText(e.currentTarget.value)}
              placeholder="DELETE"
              class="w-full border border-ktip-sand-200 rounded-xl px-4 py-3 bg-ktip-sand-50/50 transition-all focus:outline-none focus:ring-2 focus:border-red-500 focus:ring-red-500/20 focus:bg-white"
            />
          </div>

          <div class="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleDeleteAccount}
              loading={deleteLoading()}
              disabled={deleteConfirmText() !== 'DELETE'}
              class="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete Forever
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
