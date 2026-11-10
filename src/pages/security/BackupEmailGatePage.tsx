import { useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { Trans, useLingui } from '@lingui/react/macro'
import { CheckCircle, Mail, MailPlus } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { AuthSplitShell, type AuthStep } from '../../components/auth/AuthSplitShell'
import { RouteSplash } from '../../components/RouteSplash'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { useEmailAliasMutations, useSecondaryEmailStatus } from '../../hooks/useEmailAlias'
import { useSecondaryEmailCopy } from '../../hooks/useSecondaryEmailCopy'
import { usePageTitle } from '../../hooks/usePageTitle'
import { secondaryEmailProblem } from '../../lib/email-policy'
import { isSafeReturnPath, takeReturnTo } from '../../lib/return-to'

/**
 * The secondary-email gate (204). ProtectedRoute sends every session here whose
 * account has no backup address, whose backup link expired unconfirmed, or
 * whose two addresses are both school ones.
 *
 * A bare route, like /security/set-up, for the same reason: inside the
 * ProtectedRoute subtree it would redirect to itself.
 *
 * Every signup path ends up here when it needs to. The email wizard collects
 * the address itself, so its members only arrive if that send failed. OAuth and
 * Virtual Campus accounts never saw a backup field, so they arrive straight
 * after onboarding. Existing accounts arrive on their next visit.
 */
export default function BackupEmailGatePage() {
  const { t } = useLingui()
  usePageTitle(t`Add a backup email`)
  const auth = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const copy = useSecondaryEmailCopy()
  const { status, loading } = useSecondaryEmailStatus(auth.user?.id)
  const { addAlias, replaceAlias, loading: saving } = useEmailAliasMutations()

  const [value, setValue] = useState('')
  const [touched, setTouched] = useState(false)
  const [formError, setFormError] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  // Holds the page open after a send. A pending link counts as compliant, so
  // without this the status refresh would whisk the member away before they
  // read where the link went.
  const finishing = useRef(false)

  const from = (location.state as { from?: { pathname?: string; search?: string } } | null)?.from
  const fromPath = from?.pathname ? `${from.pathname}${from.search ?? ''}` : null
  const destination = () => (isSafeReturnPath(fromPath) ? fromPath : takeReturnTo() ?? '/')

  if (auth.loading || auth.profileLoading || (loading && !finishing.current)) {
    return <RouteSplash />
  }

  if (!auth.user) {
    return <Navigate to="/login" replace />
  }

  // Nothing owed (or the check failed, which ProtectedRoute also lets through).
  if ((!status || status.compliant) && !finishing.current) {
    return <Navigate to={destination()} replace />
  }

  const primary = auth.user.email ?? ''
  const problem = secondaryEmailProblem({
    primary,
    secondary: value,
    primarySchool: status?.primary_school,
  })
  const fieldError = touched ? copy.problem(problem) : undefined

  // Why they are here, in the words that fit their case.
  const bothSchool = !!status?.has_secondary && status.primary_school && status.secondary_school
  const expired = !!status?.has_secondary && !status.verified && !status.pending_live
  const current = status?.secondary_email ?? ''

  const submit = async () => {
    setTouched(true)
    setFormError('')
    if (problem) return
    const email = value.trim().toLowerCase()
    finishing.current = true
    try {
      // A verified alias blocks add-alias, so it is swapped instead. A pending
      // or expired one is simply overwritten by add-alias itself.
      const res = status?.verified
        ? await replaceAlias(auth.user!.id, email)
        : await addAlias(email)
      if (res.dev_link) {
        console.log('[dev] verification link:', res.dev_link)
        toast.success(t`Verification link logged to the console (dev mode).`)
      }
      setSentTo(email)
    } catch (err: any) {
      finishing.current = false
      setFormError(err?.message || t`Failed to save the address`)
    }
  }

  const steps: AuthStep[] = [
    { title: t`Backup email`, caption: t`A second way into your account.` },
  ]

  return (
    <AuthSplitShell
      step={1}
      steps={steps}
      heading={sentTo ? t`Check your inbox` : t`Add a backup email`}
      heroOffset={5}
    >
      {sentTo ? (
        <div className="space-y-5">
          <div className="flex gap-3 rounded-control border border-ktip-tropical-200 bg-ktip-tropical-50 p-4">
            <CheckCircle size={20} className="text-ktip-tropical-700 shrink-0 mt-0.5" />
            <p className="text-body-sm text-ktip-sand-700">
              <Trans>
                We sent a link to <strong>{sentTo}</strong>. Open it within 24 hours to confirm the
                address. You can carry on in the meantime.
              </Trans>
            </p>
          </div>
          <Button fullWidth onClick={() => navigate(destination(), { replace: true })}>
            <Trans>Continue</Trans>
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex gap-3 rounded-control border border-ktip-ocean-200 bg-ktip-ocean-50/50 p-4">
            <MailPlus size={20} className="text-ktip-ocean-600 shrink-0 mt-0.5" />
            <p className="text-body-sm text-ktip-sand-700">
              {bothSchool ? (
                <Trans>
                  Both of your addresses are school addresses. School accounts usually close when
                  you leave, so replace <strong>{current}</strong> with a personal
                  one.
                </Trans>
              ) : expired ? (
                <Trans>
                  The confirmation link for <strong>{current}</strong> expired.
                  Send a new one, or use a different address.
                </Trans>
              ) : (
                <Trans>
                  Every account needs a second email address, so you can still get in if you lose
                  access to <strong>{primary}</strong>.
                </Trans>
              )}
            </p>
          </div>

          {formError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
              {formError}
            </div>
          )}

          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault()
              void submit()
            }}
          >
            <Input
              type="email"
              label={t`Backup email`}
              placeholder={t`A personal address, like Gmail or Outlook`}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onBlur={() => setTouched(true)}
              error={fieldError}
              helperText={copy.helper}
              icon={<Mail size={20} />}
              // Not "email": autofill would copy the main address in here.
              autoComplete="off"
              fullWidth
              required
            />
            <div className="flex flex-wrap gap-3">
              <Button type="submit" loading={saving}>
                <Trans>Send confirmation link</Trans>
              </Button>
              {expired && current && !bothSchool && (
                <Button
                  type="button"
                  variant="secondary"
                  loading={saving}
                  onClick={() => {
                    setValue(current)
                    setTouched(false)
                    finishing.current = true
                    setFormError('')
                    addAlias(current)
                      .then((res) => {
                        if (res.dev_link) console.log('[dev] verification link:', res.dev_link)
                        setSentTo(current)
                      })
                      .catch((err: any) => {
                        finishing.current = false
                        setFormError(err?.message || t`Failed to save the address`)
                      })
                  }}
                >
                  <Trans>Resend to {current}</Trans>
                </Button>
              )}
            </div>
          </form>

          <p className="text-body-sm text-ktip-sand-600">
            <Trans>Not you?</Trans>{' '}
            <button
              type="button"
              className="font-medium text-ktip-ocean-700 underline underline-offset-2"
              onClick={() => void auth.signOut()}
            >
              <Trans>Sign out</Trans>
            </button>
          </p>
        </div>
      )}
    </AuthSplitShell>
  )
}
