import { useState } from 'react'
import { Link } from 'react-router'
import { BarChart3, Check, Lock, ScrollText, ShieldCheck } from 'lucide-react'
import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import type { MessageDescriptor } from '@lingui/core'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Toggle } from '../../components/ui/Toggle'
import { ConsentDocument } from '../../components/legal/ConsentDocument'
import { resolveLegal } from '../../components/legal/LegalBody'
import { useToast } from '../../contexts/ToastContext'
import { useConsents, useRecordConsent, type ConsentRow } from '../../hooks/useAgreementGate'
import { setAnalyticsConsent, useAnalyticsConsent } from '../../lib/analytics-consent'
import {
  restoreDisclaimers,
  useDisclaimerDismissals,
} from '../../lib/disclaimer-dismissals'
import {
  CONSENT_BUNDLES,
  LEGAL_TOKENS,
  bundleVersion,
  legalPath,
  type LegalBundle,
  type LegalDocumentKey,
} from '../../lib/legal'

/** Plain English for user_consents.context, which is a slug in the database. */
const CONTEXT_LABEL: Record<string, MessageDescriptor> = {
  signup: msg`at sign-up`,
  onboarding: msg`when you completed your profile`,
  reconsent: msg`when the terms changed`,
  settings: msg`from your settings`,
  project: msg`when publishing a project`,
  event: msg`when publishing an event`,
  forum_post: msg`when posting to a forum`,
  cv_publish: msg`when publishing your CV`,
  org_publish: msg`when publishing an organisation profile`,
  event_solution: msg`when submitting a competition entry`,
  grant_application: msg`when submitting a grant application`,
  grant_post: msg`when posting a funding call`,
}

const LOCALE_LABEL: Record<string, MessageDescriptor> = {
  en: msg`English`,
  fr: msg`French`,
  es: msg`Spanish`,
  pseudo: msg`Pseudo`,
}

/**
 * What you agreed to, when, and the two device-level choices that were
 * previously unreachable.
 *
 * The analytics toggle here is a BUG FIX rather than a new feature. The consent
 * banner returns null once a choice is made and `setAnalyticsConsent` was called
 * from nowhere else in the codebase, so the first click was permanent per device
 * — while the banner's own copy promised the choice could be changed in
 * Settings. The app was making a claim it did not honour.
 */
export function LegalSettingsTab() {
  const { t, i18n } = useLingui()
  const toast = useToast()

  const { data: consents, isPending } = useConsents()
  const recordConsent = useRecordConsent()
  const analytics = useAnalyticsConsent()
  const dismissals = useDisclaimerDismissals()

  // Narrowed to the promptable bundles: get_my_consents() never marks an
  // informational document outstanding, so a row that reaches the accept button
  // cannot be one — and typing it this way means the compiler agrees.
  const [accepting, setAccepting] = useState<Exclude<LegalBundle, 'informational'> | null>(null)
  const [accepted, setAccepted] = useState(false)

  const outstanding = (consents ?? []).filter((row) => row.is_outstanding)
  const settled = (consents ?? []).filter((row) => !row.is_outstanding && row.accepted_at)
  const informational = (consents ?? []).filter((row) => row.bundle === 'informational')

  const acceptBundle = async () => {
    if (!accepting) return
    try {
      await recordConsent.mutateAsync({
        keys: CONSENT_BUNDLES[accepting] as LegalDocumentKey[],
        context: 'settings',
        expectedVersion: bundleVersion(accepting),
      })
      toast.success(t`Recorded. Thank you.`)
      setAccepting(null)
      setAccepted(false)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      toast.error(
        reason === 'version_mismatch'
          ? t`These documents have changed since this page loaded. Reload and read the current version.`
          : t`We could not record your agreement. Please try again.`
      )
    }
  }

  return (
    <div className="space-y-8">
      <section>
        <h2 className="font-display text-title-sm font-bold text-ktip-sand-900">
          <Trans>What you have agreed to</Trans>
        </h2>
        <p className="mt-1 text-body text-ktip-sand-600">
          <Trans>
            Every version you accepted, and when. Documents are re-issued only when they materially
            change, and you are given {LEGAL_TOKENS.noticePeriod} notice before that happens.
          </Trans>
        </p>

        {isPending ? (
          <p className="py-6 text-body text-ktip-sand-500">
            <Trans>Loading…</Trans>
          </p>
        ) : (
          <>
            {outstanding.length > 0 && (
              <div className="mt-4 rounded-surface border border-ktip-sun-300 bg-ktip-sun-50 p-4">
                <h3 className="text-body font-semibold text-ktip-sand-900">
                  <Trans>Waiting for your agreement</Trans>
                </h3>
                <ul className="mt-2 space-y-1">
                  {outstanding.map((row) => (
                    <li key={row.document_key} className="text-body text-ktip-sand-700">
                      <Link
                        to={legalPath(row.document_key)}
                        className="font-medium text-ktip-ocean-700 hover:underline underline-offset-2"
                      >
                        {resolveLegal(i18n, row.title)}
                      </Link>{' '}
                      <span className="text-ktip-sand-500">
                        <Trans>version {row.current_version}</Trans>
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex flex-wrap gap-2">
                  {Array.from(new Set(outstanding.map((row) => row.bundle)))
                    .filter((bundle): bundle is Exclude<LegalBundle, 'informational'> => bundle !== 'informational')
                    .map((bundle) => (
                    <Button
                      key={bundle}
                      size="sm"
                      onClick={() => {
                        setAccepting(bundle)
                        setAccepted(false)
                      }}
                    >
                      <Trans>Review and accept</Trans>
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {settled.length > 0 ? (
              <ul className="mt-4 space-y-2">
                {settled.map((row) => (
                  <ConsentRowItem key={row.document_key} row={row} />
                ))}
              </ul>
            ) : (
              outstanding.length === 0 && (
                <p className="mt-4 text-body text-ktip-sand-500">
                  <Trans>Nothing recorded yet.</Trans>
                </p>
              )
            )}

            {informational.length > 0 && (
              <div className="mt-6">
                <h3 className="text-caption font-semibold uppercase tracking-wide text-ktip-sand-500">
                  <Trans>Published for reference — nothing to accept</Trans>
                </h3>
                <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                  {informational.map((row) => (
                    <li key={row.document_key}>
                      <Link
                        to={legalPath(row.document_key)}
                        className="text-body text-ktip-ocean-700 hover:underline underline-offset-2"
                      >
                        {resolveLegal(i18n, row.title)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>

      <section className="border-t border-ktip-sand-200 pt-6">
        <h2 className="font-display text-title-sm font-bold text-ktip-sand-900">
          <Trans>Cookies and analytics</Trans>
        </h2>
        <p className="mt-1 text-body text-ktip-sand-600">
          <Trans>This choice is stored on this device, so it is per browser.</Trans>{' '}
          <Link
            to="/legal/cookies"
            className="font-medium text-ktip-ocean-700 hover:underline underline-offset-2"
          >
            <Trans>What we store</Trans>
          </Link>
        </p>

        <div className="mt-4 space-y-3">
          <div className="rounded-surface border border-ktip-sand-200 bg-ktip-cream p-4">
            <div className="flex items-start gap-3">
              <BarChart3 size={18} aria-hidden className="mt-0.5 shrink-0 text-ktip-ocean-600" />
              <div className="flex-1">
                <Toggle
                  checked={analytics === 'granted'}
                  onChange={(next) => {
                    setAnalyticsConsent(next ? 'granted' : 'denied')
                    toast.success(next ? t`Analytics on.` : t`Analytics off.`)
                  }}
                  label={t`Usage analytics`}
                  description={t`Page paths and feature events, so we can see which pages help people. Never the content of a message, a document or a proposal.`}
                />
              </div>
            </div>
          </div>

          <div className="rounded-surface border border-ktip-sand-200 bg-ktip-sand-50 p-4">
            <div className="flex items-start gap-3">
              <Lock size={18} aria-hidden className="mt-0.5 shrink-0 text-ktip-sand-500" />
              <div>
                <p className="text-body font-semibold text-ktip-sand-900">
                  <Trans>Necessary storage</Trans>
                </p>
                <p className="mt-1 text-body text-ktip-sand-600">
                  <Trans>
                    Your session, your language, your theme and accessibility preferences. These
                    cannot be switched off — without them you would be signed out on every page.
                  </Trans>
                </p>
              </div>
            </div>
          </div>

          {dismissals.length > 0 && (
            <div className="rounded-surface border border-ktip-sand-200 bg-ktip-cream p-4">
              <p className="text-body font-semibold text-ktip-sand-900">
                <Trans>Hidden notes</Trans>
              </p>
              <p className="mt-1 text-body text-ktip-sand-600">
                <Trans>
                  You have hidden {dismissals.length} of the notes that appear beside AI features on
                  this device.
                </Trans>
              </p>
              <Button
                size="sm"
                variant="secondary"
                className="mt-3"
                onClick={() => {
                  restoreDisclaimers()
                  toast.success(t`Notes restored.`)
                }}
              >
                <Trans>Show them again</Trans>
              </Button>
            </div>
          )}
        </div>
      </section>

      <section className="border-t border-ktip-sand-200 pt-6">
        <h2 className="font-display text-title-sm font-bold text-ktip-sand-900">
          <Trans>Your data</Trans>
        </h2>
        <ul className="mt-3 space-y-2 text-body text-ktip-sand-700">
          <li className="flex items-start gap-2">
            <ShieldCheck size={16} aria-hidden className="mt-0.5 shrink-0 text-ktip-sand-400" />
            <span>
              <Trans>
                You can request access, correction, deletion, restriction, objection and
                portability, and withdraw consent at any time. We respond within{' '}
                {LEGAL_TOKENS.rightsResponsePeriod}.
              </Trans>{' '}
              <Link
                to="/legal/privacy#your-rights"
                className="font-medium text-ktip-ocean-700 hover:underline underline-offset-2"
              >
                <Trans>Your rights in full</Trans>
              </Link>
            </span>
          </li>
          <li className="flex items-start gap-2">
            <ScrollText size={16} aria-hidden className="mt-0.5 shrink-0 text-ktip-sand-400" />
            <span>
              <Trans>Privacy and data-rights requests: {LEGAL_TOKENS.privacyEmail}</Trans>
            </span>
          </li>
        </ul>
      </section>

      <Modal
        open={!!accepting}
        onClose={() => setAccepting(null)}
        size="lg"
        title={t`Review and accept`}
      >
        {accepting && (
          <div className="space-y-4">
            <ConsentDocument bundle={accepting} onAcceptedChange={setAccepted} dense />
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setAccepting(null)}>
                <Trans>Cancel</Trans>
              </Button>
              <Button
                onClick={acceptBundle}
                loading={recordConsent.isPending}
                disabled={!accepted}
              >
                <Trans>Accept</Trans>
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

function ConsentRowItem({ row }: { row: ConsentRow }) {
  const { i18n } = useLingui()

  const context = row.context ? CONTEXT_LABEL[row.context] : undefined
  const locale = row.locale ? LOCALE_LABEL[row.locale] : undefined

  return (
    <li className="flex flex-wrap items-start justify-between gap-3 rounded-surface border border-ktip-sand-200 bg-ktip-cream p-4">
      <div className="min-w-0">
        <Link
          to={legalPath(row.document_key)}
          className="text-body font-semibold text-ktip-ocean-700 hover:underline underline-offset-2"
        >
          {resolveLegal(i18n, row.title)}
        </Link>
        <p className="mt-1 text-caption text-ktip-sand-500">
          <Trans>Version {row.accepted_version}</Trans>
          {row.accepted_at && (
            <>
              <span aria-hidden className="mx-1.5 text-ktip-sand-300">
                ·
              </span>
              {i18n.date(new Date(row.accepted_at), { dateStyle: 'long' })}
            </>
          )}
          {context && (
            <>
              <span aria-hidden className="mx-1.5 text-ktip-sand-300">
                ·
              </span>
              {i18n._(context)}
            </>
          )}
          {/* The catalog it was read in is evidence, not a preference: the
              English text is the authoritative one, and a French reader
              accepted a translation of it. */}
          {locale && (
            <>
              <span aria-hidden className="mx-1.5 text-ktip-sand-300">
                ·
              </span>
              <Trans>read in {i18n._(locale)}</Trans>
            </>
          )}
        </p>
      </div>
      <Check size={16} aria-hidden className="mt-1 shrink-0 text-ktip-tropical-600" />
    </li>
  )
}
