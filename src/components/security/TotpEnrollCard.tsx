import { useState } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import { Check, ChevronDown, Copy, Smartphone } from 'lucide-react'
import { Button } from '../ui/Button'
import { OtpInput } from '../ui/OtpInput'
import { formatSecret, qrCodeSrc } from '../../lib/mfa'

interface TotpEnrollCardProps {
  qrCode: string | null
  secret: string | null
  uri: string | null
  code: string
  onCodeChange: (value: string) => void
  onVerify: (code: string) => void
  verifying: boolean
  error?: string
}

/**
 * The QR, the manual fallback, and the confirm-it-works field (118).
 *
 * The manual secret is not a nicety. A member on a desktop with no camera, or
 * with camera permission blocked, has no other way through — and this is a
 * blocking gate, so "no other way through" means "no account".
 */
export function TotpEnrollCard({
  qrCode,
  secret,
  uri,
  code,
  onCodeChange,
  onVerify,
  verifying,
  error,
}: TotpEnrollCardProps) {
  const { t } = useLingui()
  const [showSecret, setShowSecret] = useState(false)
  const [copied, setCopied] = useState(false)
  const qrSrc = qrCodeSrc(qrCode)

  const copySecret = async () => {
    if (!secret) return
    await navigator.clipboard.writeText(secret)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        {qrSrc ? (
          <img
            src={qrSrc}
            // Decorative: the same value is offered as copyable text below, so a
            // screen reader announcing this would only add noise.
            alt=""
            width={200}
            height={200}
            className="mx-auto rounded-control bg-white p-3 border border-ktip-sand-200"
          />
        ) : (
          <div className="mx-auto w-[200px] h-[200px] rounded-control bg-ktip-sand-100 animate-pulse" />
        )}

        <p className="text-body-sm text-ktip-sand-600 mt-4 max-w-sm mx-auto">
          <Trans>
            Scan this with Google Authenticator, Authy, or any authenticator app, then enter
            the 6-digit code it shows.
          </Trans>
        </p>
      </div>

      <div className="border-t border-ktip-sand-200 pt-4">
        <button
          type="button"
          onClick={() => setShowSecret((open) => !open)}
          className="flex items-center gap-2 text-body-sm font-medium text-ktip-ocean-600 hover:text-ktip-ocean-700"
        >
          <ChevronDown
            size={16}
            className={showSecret ? 'rotate-180 transition-transform' : 'transition-transform'}
          />
          <Trans>Can't scan the code?</Trans>
        </button>

        {showSecret && (
          <div className="mt-3 space-y-3">
            <p className="text-caption text-ktip-sand-500">
              <Trans>Type this key into your authenticator app by hand instead.</Trans>
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 font-mono text-body-sm tracking-wider bg-ktip-sand-50 border border-ktip-sand-200 rounded-control px-3 py-2 break-all">
                {formatSecret(secret)}
              </code>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={copySecret}
                icon={copied ? <Check size={16} /> : <Copy size={16} />}
                aria-label={t`Copy setup key`}
              />
            </div>
            {uri && (
              <a
                href={uri}
                className="inline-flex items-center gap-2 text-body-sm text-ktip-ocean-600 hover:text-ktip-ocean-700"
              >
                <Smartphone size={16} />
                {/* For the member reading this email on the same phone that
                    holds the authenticator — tapping opens it directly. */}
                <Trans>Open in my authenticator app</Trans>
              </a>
            )}
          </div>
        )}
      </div>

      <OtpInput
        label={t`Code from your authenticator app`}
        value={code}
        onChange={onCodeChange}
        onComplete={onVerify}
        disabled={verifying || !qrCode}
        error={error}
        helperText={t`The code changes every 30 seconds.`}
      />

      <Button
        type="button"
        fullWidth
        loading={verifying}
        disabled={code.length !== 6}
        onClick={() => onVerify(code)}
      >
        <Trans>Verify and continue</Trans>
      </Button>
    </div>
  )
}
