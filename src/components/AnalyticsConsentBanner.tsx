import { Link } from 'react-router'
import { BarChart3, ShieldCheck } from 'lucide-react'
import { setAnalyticsConsent, useAnalyticsConsent } from '../lib/analytics-consent'
import { Button } from './ui/Button'
import { Trans, useLingui } from '@lingui/react/macro'

export function AnalyticsConsentBanner() {
    const { t } = useLingui()
  const consent = useAnalyticsConsent()
  if (consent !== 'pending') return null

  return (
    <section
      aria-label={t`Analytics preferences`}
      // Picked up by the standalone safe-area rules in index.css so the
      // buttons clear the home indicator when installed.
      data-bottom-sheet
      // Below lg the banner is effectively full width, so at bottom-4 it sat
      // squarely on top of the floating dock and hid it completely on phones
      // and tablets. It clears the dock until there is room beside it — from
      // lg the banner is 3xl centred and the corner is free again.
      className="fixed inset-x-4 bottom-fab-clear lg:bottom-4 z-toast mx-auto max-w-3xl rounded-xl border border-ktip-sand-200 bg-ktip-cream p-5 shadow-xl"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        <div className="flex flex-1 items-start gap-3">
          <div className="mt-0.5 rounded-lg bg-ktip-ocean-100 p-2 text-ktip-ocean-700">
            <BarChart3 size={20} />
          </div>
          <div>
            <h2 className="font-display font-bold text-ktip-sand-900"><Trans>Help us improve KTIP</Trans></h2>
            {/* Names what is actually stored rather than describing the
                category. "Optional usage analytics help us understand which
                pages are useful" is true of every tracker anyone has ever
                objected to; one identifier, page paths and feature events is
                checkable. */}
            <p className="mt-1 text-sm leading-relaxed text-ktip-sand-600">
              <Trans>
                We use one analytics identifier to see which pages and features help people. It
                records page paths and feature events — never the content of a message, a document
                or a proposal — and nothing is stored unless you allow it.
              </Trans>{' '}
              <Link
                to="/legal/cookies"
                className="font-medium text-ktip-ocean-700 underline underline-offset-2 hover:opacity-80"
              >
                <Trans>Cookie notice</Trans>
              </Link>
              <span aria-hidden className="mx-1.5 text-ktip-sand-300">·</span>
              <Link
                to="/legal/privacy"
                className="font-medium text-ktip-ocean-700 underline underline-offset-2 hover:opacity-80"
              >
                <Trans>Privacy policy</Trans>
              </Link>
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          {/* "No thanks", not "Necessary only" — the latter reads as a third
              option sitting beside "Allow analytics" rather than as the refusal
              it is. */}
          <Button
            variant="secondary"
            size="sm"
            icon={<ShieldCheck size={17} />}
            onClick={() => setAnalyticsConsent('denied')}
          >
            <Trans>No thanks</Trans>
          </Button>
          <Button size="sm" onClick={() => setAnalyticsConsent('granted')}>
            <Trans>Allow analytics</Trans>
          </Button>
        </div>
      </div>
    </section>
  )
}
