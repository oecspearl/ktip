import { useMemo } from 'react'
import { Link } from 'react-router'
import { Trans, useLingui } from '@lingui/react/macro'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { AuthenticatorAppGuide } from '../../components/security/AuthenticatorAppGuide'
import { usePageTitle } from '../../hooks/usePageTitle'
import { detectPlatform, isMobilePlatform } from '../../lib/platform'

/**
 * Where the "get an authenticator app" QR lands (150).
 *
 * A member setting up two-step verification on a computer, with no app on
 * their phone yet, scans a QR that points here. The phone has no KTIP session
 * and needs none: this page works out which phone it is, shows the app store
 * for it and the steps for each app, and then sends the member back to the
 * computer where the enrolment QR is waiting.
 *
 * Bare route with its own shell rather than MainLayout — a phone that has just
 * scanned a code wants one screen with one job, not a navbar, a footer and a
 * floating tutorial button.
 */
export default function GetAuthenticatorPage() {
  const { t } = useLingui()
  usePageTitle(t`Get an authenticator app`)
  const platform = useMemo(() => detectPlatform(), [])
  const onPhone = isMobilePlatform(platform)

  return (
    <div className="min-h-screen bg-ktip-cream px-4 py-8">
      <div className="mx-auto w-full max-w-md space-y-6">
        <header className="space-y-3">
          <img src="/ktip-logo-128.webp" alt="KTiP" className="h-9 w-auto" />
          <div className="flex items-start gap-3">
            <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ktip-ocean-100 text-ktip-ocean-700">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold text-ktip-sand-900">
                <Trans>Get an authenticator app</Trans>
              </h1>
              <p className="mt-1 text-body-sm text-ktip-sand-600">
                {onPhone ? (
                  <Trans>
                    An authenticator app shows a 6-digit code that changes every 30 seconds. KTIP asks
                    for it when you sign in, so a stolen password is not enough to get in. Pick an app
                    below to install it and see how to add KTIP.
                  </Trans>
                ) : (
                  <Trans>
                    An authenticator app shows a 6-digit code that changes every 30 seconds. You can run
                    one on a phone or on this computer. Pick an app below to get it and see how to add
                    KTIP.
                  </Trans>
                )}
              </p>
            </div>
          </div>
        </header>

        <AuthenticatorAppGuide mode="get" />

        <div className="rounded-xl border border-ktip-ocean-200 bg-ktip-ocean-50/60 p-4 text-body-sm text-ktip-sand-700">
          <p className="font-semibold text-ktip-sand-900">
            <Trans>Then, back on the screen that sent you here:</Trans>
          </p>
          <p className="mt-1">
            <Trans>
              Open the app, choose to add an account, and scan the square code KTIP is showing. Type
              the 6 digits the app gives you into KTIP, and you are done.
            </Trans>
          </p>
        </div>

        <p className="text-caption text-ktip-sand-500">
          <Trans>
            No smartphone? Ente Auth, Proton Authenticator and the 2FAS browser extension all run on a
            computer. Or, when KTIP asks how you want your code, choose “Email code” instead.
          </Trans>
        </p>

        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-body-sm font-medium text-ktip-ocean-600 hover:text-ktip-ocean-700"
        >
          <ArrowLeft size={15} />
          <Trans>Back to KTIP</Trans>
        </Link>
      </div>
    </div>
  )
}
