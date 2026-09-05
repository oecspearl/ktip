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
import { useBackupCodeStatus, useMfaFactors, useMfaMutations } from '../../hooks/useMfa'
import { BackupCodesSheet } from '../../components/security/BackupCodesSheet'
import {
  Lock,
  Mail,
  MailPlus,
  Trash2,
  AlertTriangle,
  CheckCircle,
  ShieldCheck,
  PauseCircle,
  Download,
} from 'lucide-react'
import { formatDate } from '../../lib/utils'
import { buildDataExport, downloadJson, exportFileName } from '../../lib/data-export'
import { Trans, useLingui } from '@lingui/react/macro'

// The word the user must type to confirm deletion. It is compared literally
// against input, so it must never be translated.
const DELETE_CONFIRMATION_TEXT = 'DELETE'

export function SecuritySettingsTab() {
    const { t } = useLingui()
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

  // Two-step verification (118)
  const { factors, enrolled, loading: factorsLoading } = useMfaFactors(auth.user?.id)
  const { status: codeStatus } = useBackupCodeStatus(auth.user?.id)
  const { issueCodes, unenroll, issuing, unenrolling } = useMfaMutations(auth.user?.id)
  const [freshCodes, setFreshCodes] = useState<string[] | null>(null)
  const [showRemoveMfaModal, setShowRemoveMfaModal] = useState(false)
  // Required by a role rather than chosen — removing it would only bounce them
  // straight back to enrolment, so the option is not offered.
  const mfaRequired = auth.profile?.mfa_grandfathered === false

  const handleRegenerateCodes = async () => {
    try {
      setFreshCodes(await issueCodes())
    } catch (error: any) {
      toast.error(error?.message || t`Could not generate recovery codes.`)
    }
  }

  const handleRemoveMfa = async () => {
    const factorId = factors[0]?.id
    if (!factorId) return
    try {
      await unenroll(factorId)
      setShowRemoveMfaModal(false)
      toast.success(t`Two-step verification is off.`)
    } catch (error: any) {
      toast.error(error?.message || t`Could not remove your authenticator.`)
    }
  }

  // Delete account
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [closeMode, setCloseMode] = useState<'deactivate' | 'delete' | null>(null)
  const [closeLoading, setCloseLoading] = useState(false)
  const [exportLoading, setExportLoading] = useState(false)
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
      toast.success(t`Password updated successfully!`)
    } catch (err: any) {
      setPasswordErrors({ _form: err.message || t`Failed to update password` })
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
      toast.success(t`Confirmation email sent to your new address!`)
    } catch (err: any) {
      setEmailErrors({ _form: err.message || t`Failed to update email` })
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
        toast.success(t`That address is already verified.`)
        return
      }
      setAliasSent(true)
      setSecondaryEmail('')
      // Without Resend configured, dev builds hand the link back instead.
      if (res.dev_link) {
        console.log('[dev] verification link:', res.dev_link)
        toast.success(t`Verification link logged to the console (dev mode).`)
      } else {
        toast.success(t`Verification email sent.`)
      }
    } catch (err: any) {
      setAliasErrors({ _form: err.message || t`Failed to save the address` })
    }
  }

  const handleRemoveSecondaryEmail = async () => {
    setAliasErrors({})
    setAliasSent(false)
    try {
      await removeAlias(auth.user!.id)
      toast.success(t`Secondary email removed`)
    } catch (err: any) {
      setAliasErrors({ _form: err.message || t`Failed to remove the address` })
    }
  }

  // Take a copy before you go — or at any other time. Portability is a right
  // on its own, not a step in the leaving flow, which is why the control sits
  // above the exits rather than inside their confirmation.
  const handleExportData = async () => {
    if (!auth.user) return
    setExportLoading(true)
    try {
      const bundle = await buildDataExport(auth.user.id)
      downloadJson(bundle, exportFileName())
      if (bundle.unavailable.length > 0) {
        // Named, not swallowed: a partial export that claims to be complete is
        // worse than one that says what is missing.
        toast.success(
          t`Your data was downloaded. ${bundle.unavailable.length} section(s) could not be read — see "unavailable" in the file.`
        )
      } else {
        toast.success(t`Your data was downloaded`)
      }
    } catch (err: any) {
      toast.error(err.message || t`Could not build your data export`)
    } finally {
      setExportLoading(false)
    }
  }

  // Migration 140. The two reversible exits, beside the irreversible one.
  const handleCloseAccount = async (mode: 'deactivate' | 'delete') => {
    setCloseLoading(true)
    try {
      await auth.closeAccount(mode)
      toast.success(
        mode === 'deactivate'
          ? t`Your account is deactivated. Sign in any time in the next 90 days to bring it back.`
          : t`Your account is scheduled for deletion. Sign in within 7 days to stop it.`
      )
      navigate('/login')
    } catch (err: any) {
      toast.error(err.message || t`Failed to close the account`)
    } finally {
      setCloseLoading(false)
      setCloseMode(null)
    }
  }

  const handleReopenAccount = async () => {
    setCloseLoading(true)
    try {
      await auth.reopenAccount()
      toast.success(t`Your account is active again. Nothing was deleted.`)
    } catch (err: any) {
      toast.error(err.message || t`Failed to cancel the closure`)
    } finally {
      setCloseLoading(false)
    }
  }

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== DELETE_CONFIRMATION_TEXT) return

    setDeleteLoading(true)
    try {
      await auth.deleteAccount()
      toast.success(t`Account deleted successfully`)
      navigate('/login')
    } catch (err: any) {
      toast.error(err.message || t`Failed to delete account`)
    } finally {
      setDeleteLoading(false)
      setShowDeleteModal(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Change Password */}
      <Card id="password" data-spy="Password" className="scroll-mt-24">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-ktip-ocean-100 rounded-xl flex items-center justify-center">
            <Lock size={20} className="text-ktip-ocean-600" />
          </div>
          <div>
            <h2 className="text-lg font-display font-bold text-ktip-sand-900"><Trans>Change Password</Trans></h2>
            <p className="text-sm text-ktip-sand-600"><Trans>Update your account password</Trans></p>
          </div>
        </div>

        <div className="space-y-4 max-w-md">
          {passwordSuccess && (
            <div className="flex items-center gap-2 bg-ktip-tropical-50 border border-ktip-tropical-200 text-ktip-tropical-700 px-4 py-3 rounded-xl text-sm">
              <CheckCircle size={18} />
              <Trans>Password updated successfully!</Trans>
            </div>
          )}

          {passwordErrors._form && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
              {passwordErrors._form}
            </div>
          )}

          <Input
            type="password"
            label={t`New Password`}
            placeholder={t`Enter new password`}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            error={passwordErrors.new_password}
            icon={<Lock size={20} />}
            fullWidth
          />

          <Input
            type="password"
            label={t`Confirm Password`}
            placeholder={t`Confirm new password`}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            error={passwordErrors.confirm_password}
            icon={<Lock size={20} />}
            fullWidth
          />

          <Button onClick={handleChangePassword} loading={passwordLoading}>
            <Trans>Update Password</Trans>
          </Button>
        </div>
      </Card>

      {/* Two-step verification (118) */}
      <Card id="two-step" data-spy="Two-step verification" className="scroll-mt-24">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-ktip-ocean-100 rounded-xl flex items-center justify-center">
            <ShieldCheck size={20} className="text-ktip-ocean-600" />
          </div>
          <div>
            <h2 className="text-lg font-display font-bold text-ktip-sand-900">
              <Trans>Two-Step Verification</Trans>
            </h2>
            <p className="text-sm text-ktip-sand-600">
              <Trans>An authenticator app code, on top of your password</Trans>
            </p>
          </div>
        </div>

        <div className="space-y-4 max-w-md">
          {factorsLoading ? (
            <div className="h-10 rounded-xl bg-ktip-sand-100 animate-pulse" />
          ) : enrolled ? (
            <>
              <div className="flex items-center gap-2 bg-ktip-tropical-50 border border-ktip-tropical-200 text-ktip-tropical-700 px-4 py-3 rounded-xl text-sm">
                <CheckCircle size={18} />
                <Trans>Two-step verification is on for this account.</Trans>
              </div>

              <p className="text-sm text-ktip-sand-600">
                {codeStatus ? (
                  <Trans>
                    {codeStatus.remaining} of {codeStatus.total} recovery codes left.
                  </Trans>
                ) : (
                  <Trans>Checking your recovery codes…</Trans>
                )}
              </p>

              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" loading={issuing} onClick={handleRegenerateCodes}>
                  <Trans>Generate new recovery codes</Trans>
                </Button>
                {/* Not offered when a role demands it: removing the factor only
                    sends them back to /security/set-up, which reads as a broken
                    button rather than a refusal. */}
                {!mfaRequired && (
                  <Button variant="ghost" onClick={() => setShowRemoveMfaModal(true)}>
                    <Trans>Remove authenticator</Trans>
                  </Button>
                )}
              </div>

              <p className="text-caption text-ktip-sand-500">
                <Trans>Generating new codes makes every earlier code stop working.</Trans>
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-ktip-sand-600">
                <Trans>
                  Add a second step at sign-in using a free authenticator app. It works offline,
                  and it means a stolen password is not enough to reach your account.
                </Trans>
              </p>
              <Button onClick={() => navigate('/security/set-up')}>
                <Trans>Set up two-step verification</Trans>
              </Button>
            </>
          )}
        </div>
      </Card>

      {/* Change Email */}
      <Card id="email" data-spy="Email" className="scroll-mt-24">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-ktip-ocean-100 rounded-xl flex items-center justify-center">
            <Mail size={20} className="text-ktip-ocean-600" />
          </div>
          <div>
            <h2 className="text-lg font-display font-bold text-ktip-sand-900"><Trans>Change Email</Trans></h2>
            <p className="text-sm text-ktip-sand-600">
              <Trans>Current: <strong>{auth.user?.email}</strong></Trans>
            </p>
          </div>
        </div>

        <div className="space-y-4 max-w-md">
          {emailSuccess && (
            <div className="flex items-center gap-2 bg-ktip-tropical-50 border border-ktip-tropical-200 text-ktip-tropical-700 px-4 py-3 rounded-xl text-sm">
              <CheckCircle size={18} />
              <Trans>Confirmation sent! Check your new email to verify the change.</Trans>
            </div>
          )}

          {emailErrors._form && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
              {emailErrors._form}
            </div>
          )}

          <Input
            type="email"
            label={t`New Email`}
            placeholder={t`Enter new email address`}
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            error={emailErrors.email}
            icon={<Mail size={20} />}
            fullWidth
          />

          <Button onClick={handleChangeEmail} loading={emailLoading}>
            <Trans>Update Email</Trans>
          </Button>
        </div>
      </Card>

      {/* Secondary Email */}
      <Card id="secondary-email" data-spy="Secondary email" className="scroll-mt-24">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-ktip-ocean-100 rounded-xl flex items-center justify-center">
            <MailPlus size={20} className="text-ktip-ocean-600" />
          </div>
          <div>
            <h2 className="text-lg font-display font-bold text-ktip-sand-900"><Trans>Secondary Email</Trans></h2>
            <p className="text-sm text-ktip-sand-600">
              <Trans>A backup address that signs in to this account with the same password</Trans>
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
                  <Trans>Check that inbox for a confirmation link.</Trans>
                </div>
              )}
              <Input
                type="email"
                label={t`Secondary Email`}
                placeholder={t`Enter a backup email address`}
                value={secondaryEmail}
                onChange={(e) => setSecondaryEmail(e.target.value)}
                error={aliasErrors.email}
                icon={<Mail size={20} />}
                fullWidth
              />
              <p className="text-xs text-ktip-sand-500">
                <Trans>You'll need to confirm the address before it can be used. It cannot already belong to another KTIP account.</Trans>
              </p>
              <Button
                onClick={() => submitSecondaryEmail(secondaryEmail)}
                loading={aliasSaving}
              >
                <Trans>Add Secondary Email</Trans>
              </Button>
            </>
          ) : alias.verified_at ? (
            <>
              {alias.email === auth.user?.email?.toLowerCase() ? (
                <div className="bg-ktip-ocean-50 border border-ktip-ocean-200 text-ktip-ocean-700 px-4 py-3 rounded-xl text-sm">
                  <Trans>
                    <strong>{alias.email}</strong> is now your primary email address, so it no
                    longer works as a secondary one. You can remove it and add a different
                    backup address.
                  </Trans>
                </div>
              ) : (
                <div className="flex items-center gap-2 bg-ktip-tropical-50 border border-ktip-tropical-200 text-ktip-tropical-700 px-4 py-3 rounded-xl text-sm">
                  <CheckCircle size={18} />
                  <span>
                    <Trans><strong>{alias.email}</strong> is verified — you can sign in with it.</Trans>
                  </span>
                </div>
              )}
              <Button variant="secondary" onClick={handleRemoveSecondaryEmail} loading={aliasSaving}>
                <Trans>Remove</Trans>
              </Button>
            </>
          ) : (
            <>
              <div className="bg-ktip-sun-50 border border-ktip-sun-200 text-ktip-sun-800 px-4 py-3 rounded-xl text-sm">
                {alias.token_expires_at && new Date(alias.token_expires_at) > new Date() ? (
                  <Trans>
                    Waiting for confirmation of <strong>{alias.email}</strong>. Check that
                    inbox — the link expires 24 hours after it was sent.
                  </Trans>
                ) : (
                  <Trans>
                    The confirmation link for <strong>{alias.email}</strong> expired. Send a
                    fresh one, or remove the address.
                  </Trans>
                )}
              </div>
              <div className="flex flex-wrap gap-3">
                <Button onClick={() => submitSecondaryEmail(alias.email)} loading={aliasSaving}>
                  <Trans>Resend Link</Trans>
                </Button>
                <Button variant="secondary" onClick={handleRemoveSecondaryEmail} loading={aliasSaving}>
                  <Trans>Remove</Trans>
                </Button>
              </div>
            </>
          )}

          {/* OAuth-only accounts have no password, so there is nothing to sign in with yet. */}
          {!auth.user?.identities?.some((i) => i.provider === 'email') && (
            <p className="text-xs text-ktip-sand-500">
              <Trans>You sign in with Google or Microsoft, so this address can't sign in until you set a password — use "Forgot password" with it once it's verified.</Trans>
            </p>
          )}
        </div>
      </Card>

      {/* Your data, on your disk */}
      <Card id="export-data" data-spy="Download your data" className="scroll-mt-24">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-ktip-ocean-100 rounded-xl flex items-center justify-center">
            <Download size={20} className="text-ktip-ocean-700" />
          </div>
          <div>
            <h2 className="text-lg font-display font-bold text-ktip-sand-900">
              <Trans>Download your data</Trans>
            </h2>
            <p className="text-sm text-ktip-sand-600">
              <Trans>A copy of everything on your account, as one JSON file</Trans>
            </p>
          </div>
        </div>

        <p className="text-sm text-ktip-sand-600 mb-4">
          <Trans>
            Your profile, applications and the copies of what you submitted, projects, events and
            funding calls you posted, forum posts and replies, the messages you sent, and the
            documents you uploaded. Built in your browser from your own account, so it contains
            what you can see and nothing more.
          </Trans>
        </p>

        <Button
          variant="outline"
          icon={<Download size={18} />}
          loading={exportLoading}
          onClick={handleExportData}
        >
          <Trans>Download my data</Trans>
        </Button>
      </Card>

      {/* Leaving, reversibly (migration 140).
          Above the permanent option on purpose: a member who wants to step away
          should meet the door that lets them come back first. */}
      <Card id="close-account" data-spy="Leaving KTIP" className="scroll-mt-24">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-ktip-sand-100 rounded-xl flex items-center justify-center">
            <PauseCircle size={20} className="text-ktip-sand-600" />
          </div>
          <div>
            <h2 className="text-lg font-display font-bold text-ktip-sand-900">
              <Trans>Leaving KTIP</Trans>
            </h2>
            <p className="text-sm text-ktip-sand-600">
              <Trans>Step away for a while, or close the account for good</Trans>
            </p>
          </div>
        </div>

        {auth.accountStatus !== 'active' ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-medium text-amber-900">
              {auth.accountStatus === 'pending_deletion' ? (
                <Trans>This account is scheduled for deletion</Trans>
              ) : (
                <Trans>This account is deactivated</Trans>
              )}
            </p>
            <p className="mt-1 text-sm text-amber-800">
              {auth.purgeAfter ? (
                <Trans>Your data is kept until {formatDate(auth.purgeAfter)}. Until then, nothing is lost.</Trans>
              ) : (
                <Trans>Your data is kept for now.</Trans>
              )}
            </p>
            <Button
              size="sm"
              className="mt-3"
              loading={closeLoading}
              onClick={handleReopenAccount}
            >
              <Trans>Keep my account</Trans>
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-ktip-sand-200 p-4">
              <h3 className="text-sm font-semibold text-ktip-sand-900">
                <Trans>Deactivate</Trans>
              </h3>
              <p className="mt-1 text-sm text-ktip-sand-600">
                <Trans>
                  You disappear from the directory and can no longer post. What you have already
                  contributed stays where it is. Sign in within 90 days and everything is exactly as
                  you left it; after that the account is anonymised.
                </Trans>
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => setCloseMode('deactivate')}
              >
                <Trans>Deactivate my account</Trans>
              </Button>
            </div>

            <div className="rounded-xl border border-ktip-sand-200 p-4">
              <h3 className="text-sm font-semibold text-ktip-sand-900">
                <Trans>Delete, with a week to change your mind</Trans>
              </h3>
              <p className="mt-1 text-sm text-ktip-sand-600">
                <Trans>
                  Your account and personal data are erased after 7 days. Signing in during that
                  week stops it — which is also how an account somebody else took over gets
                  recovered.
                </Trans>
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => setCloseMode('delete')}
              >
                <Trans>Schedule deletion</Trans>
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Delete Account */}
      <Card id="delete-account" data-spy="Delete account" className="scroll-mt-24 border-red-200">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
            <Trash2 size={20} className="text-red-600" />
          </div>
          <div>
            <h2 className="text-lg font-display font-bold text-red-700"><Trans>Delete Account</Trans></h2>
            <p className="text-sm text-ktip-sand-600"><Trans>Permanently delete your account and all associated data</Trans></p>
          </div>
        </div>

        <p className="text-sm text-ktip-sand-600 mb-4">
          <Trans>Once deleted, your account cannot be recovered. All your projects, events, messages, and profile data will be permanently removed.</Trans>
        </p>

        <Button
          variant="outline"
          onClick={() => setShowDeleteModal(true)}
          className="border-red-300 text-red-600 hover:bg-red-50"
          icon={<Trash2 size={18} />}
        >
          <Trans>Delete My Account</Trans>
        </Button>
      </Card>

      {/* Fresh recovery codes. Same sheet the enrolment wizard shows, and for
          the same reason: this is the only time these values exist. */}
      <Modal
        open={freshCodes !== null}
        onClose={() => setFreshCodes(null)}
        title={t`Your new recovery codes`}
        description={t`Every code from before now stops working.`}
        size="md"
      >
        {freshCodes && (
          <BackupCodesSheet
            codes={freshCodes}
            accountEmail={auth.user?.email}
            confirmLabel={t`Done`}
            onConfirm={() => setFreshCodes(null)}
          />
        )}
      </Modal>

      {/* Remove authenticator */}
      <Modal
        open={showRemoveMfaModal}
        onClose={() => setShowRemoveMfaModal(false)}
        title={t`Remove your authenticator?`}
        description={t`Your account will be protected by your password alone.`}
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
            <AlertTriangle size={20} className="text-amber-600 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-900">
              <Trans>
                Your recovery codes stay valid but stop being useful — there will be no second
                step for them to recover.
              </Trans>
            </p>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowRemoveMfaModal(false)}>
              <Trans>Cancel</Trans>
            </Button>
            <Button variant="danger" loading={unenrolling} onClick={handleRemoveMfa}>
              <Trans>Remove it</Trans>
            </Button>
          </div>
        </div>
      </Modal>

      {/* Closure confirmation. Short on purpose — neither of these destroys
          anything today, and a DELETE-to-confirm ritual on a reversible act
          teaches people to type it without reading. */}
      <Modal
        open={closeMode !== null}
        onClose={() => setCloseMode(null)}
        title={closeMode === 'delete' ? t`Schedule deletion?` : t`Deactivate your account?`}
        description={
          closeMode === 'delete'
            ? t`Your data is erased in 7 days. Signing in before then cancels it.`
            : t`You can bring it back by signing in within 90 days.`
        }
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-ktip-sand-600">
            {closeMode === 'delete' ? (
              <Trans>
                Funding calls you posted that already have applications against them stay published
                and are handed to your organisation — deleting them would take other people's
                submissions with them.
              </Trans>
            ) : (
              <Trans>
                You will be signed out. Applications you have submitted keep their place in the
                queue and are still reviewed.
              </Trans>
            )}
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setCloseMode(null)} disabled={closeLoading}>
              <Trans>Cancel</Trans>
            </Button>
            <Button
              variant="danger"
              loading={closeLoading}
              onClick={() => closeMode && handleCloseAccount(closeMode)}
            >
              {closeMode === 'delete' ? <Trans>Schedule it</Trans> : <Trans>Deactivate</Trans>}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title={t`Delete Account`}
        description={t`This action is permanent and cannot be undone.`}
        size="md"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
            <AlertTriangle size={20} className="text-red-600 shrink-0 mt-0.5" />
            <div className="text-sm text-red-700">
              <p className="font-medium mb-1"><Trans>Warning: This will permanently delete:</Trans></p>
              <ul className="list-disc ml-4 space-y-1">
                <li><Trans>Your profile and personal data</Trans></li>
                <li><Trans>All projects you created</Trans></li>
                <li><Trans>All messages and conversations</Trans></li>
                <li><Trans>Event registrations and forum posts</Trans></li>
              </ul>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-ktip-sand-700 mb-2">
              <Trans>Type <strong>{DELETE_CONFIRMATION_TEXT}</strong> to confirm</Trans>
            </label>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={DELETE_CONFIRMATION_TEXT}
              className="w-full border border-ktip-sand-200 rounded-xl px-4 py-3 bg-ktip-sand-50/50 transition-all focus:outline-none focus:ring-2 focus:border-red-500 focus:ring-red-500/20 focus:bg-ktip-cream"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>
              <Trans>Cancel</Trans>
            </Button>
            <Button
              onClick={handleDeleteAccount}
              loading={deleteLoading}
              disabled={deleteConfirmText !== DELETE_CONFIRMATION_TEXT}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              <Trans>Delete Forever</Trans>
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
