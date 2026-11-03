import { useState, type FormEvent } from 'react'
import { BadgeCheck, KeyRound, ShieldAlert } from 'lucide-react'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { useToast } from '../../contexts/ToastContext'
import { useRedeemVerificationCode, type RedeemResult } from '../../hooks/useVerificationLifecycle'
import { ROLE_LABELS } from '../../lib/constants'
import { normaliseVerificationCode } from '../../lib/verification-term'
import { resolveCopy } from '../../i18n/copy'
import { Trans, useLingui } from '@lingui/react/macro'

/**
 * "Have a code from your organisation?" (migration 176).
 *
 * Every failure the server returns for a wrong code reads the same on
 * purpose, so this does not try to tell "expired" from "not yours" either.
 */
export function RedeemCodeCard({
  compact = false,
  onRedeemed,
}: {
  compact?: boolean
  onRedeemed?: (result: RedeemResult) => void
}) {
  const { t, i18n } = useLingui()
  const toast = useToast()
  const { redeem, loading } = useRedeemVerificationCode()
  const [code, setCode] = useState('')
  const [result, setResult] = useState<RedeemResult | null>(null)

  const failure = (r: RedeemResult): string => {
    switch (r.reason) {
      case 'rate_limited':
        return t`Too many tries. Wait an hour and try again.`
      case 'on_hold':
        return t`A reviewer removed the badge from this account, so a code cannot restore it.`
      case 'email_unconfirmed':
        return t`Confirm your sign-in email first, then enter the code.`
      default:
        return t`That code did not work. Check it with the person who gave it to you. Codes work once and expire.`
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!code.trim()) return
    // Caught here so a typo does not spend one of the ten tries an hour.
    if (!normaliseVerificationCode(code)) {
      setResult({ ok: false, reason: 'invalid_code' })
      return
    }
    try {
      const r = await redeem(code)
      setResult(r)
      if (r.ok) {
        setCode('')
        onRedeemed?.(r)
      }
    } catch (err: any) {
      toast.error(err.message || t`The code could not be checked.`)
    }
  }

  const body = (
    <>
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 sm:items-end">
        <Input
          label={t`Verification code`}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="KTIP-XXXX-XXXX-XXXX"
          autoComplete="one-time-code"
          spellCheck={false}
          disabled={loading}
          fullWidth
        />
        <Button type="submit" loading={loading} disabled={!code.trim()} className="shrink-0">
          <Trans>Use code</Trans>
        </Button>
      </form>

      {result && (
        <div
          className={`mt-4 flex items-start gap-3 p-4 rounded-xl border ${
            result.ok
              ? 'bg-ktip-tropical-50 border-ktip-tropical-200 text-ktip-tropical-800'
              : 'bg-ktip-sand-50 border-ktip-sand-200 text-ktip-sand-800'
          }`}
          role="status"
        >
          <span className="mt-0.5 shrink-0">
            {result.ok ? <BadgeCheck size={20} /> : <ShieldAlert size={20} />}
          </span>
          <div className="min-w-0 text-sm">
            {result.ok ? (
              <>
                <p className="font-medium">
                  {result.outcome === 'renewed' ? (
                    <Trans>Your verification is renewed for 12 months.</Trans>
                  ) : (
                    <Trans>Your account is verified.</Trans>
                  )}
                </p>
                {result.org_name && (
                  <p className="mt-1">
                    <Trans>{result.org_name} vouched for you.</Trans>
                    {result.granted_role ? (
                      <>
                        {' '}
                        <Trans>
                          Your account now holds the{' '}
                          {resolveCopy(i18n, ROLE_LABELS[result.granted_role] ?? result.granted_role)} role.
                        </Trans>
                      </>
                    ) : null}
                  </p>
                )}
              </>
            ) : (
              <p>{failure(result)}</p>
            )}
          </div>
        </div>
      )}
    </>
  )

  if (compact) return body

  return (
    <Card>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 bg-ktip-ocean-100 rounded-xl flex items-center justify-center">
          <KeyRound size={20} className="text-ktip-ocean-600" />
        </div>
        <div>
          <h2 className="text-lg font-display font-bold text-ktip-sand-900">
            <Trans>Have a code from your organisation?</Trans>
          </h2>
          <p className="text-sm text-ktip-sand-600">
            <Trans>A verified business, school or college can vouch for you with a one-time code.</Trans>
          </p>
        </div>
      </div>
      {body}
    </Card>
  )
}

export default RedeemCodeCard
