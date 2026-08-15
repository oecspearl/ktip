import { useState, useSyncExternalStore } from 'react'
import { ScrollText, X } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { ConsentDocument } from './ConsentDocument'
import { useToast } from '../../contexts/ToastContext'
import { useConsents, useRecordConsent } from '../../hooks/useAgreementGate'
import { useAnalyticsConsent } from '../../lib/analytics-consent'
import { CONSENT_BUNDLES, bundleVersion, type LegalBundle, type LegalDocumentKey } from '../../lib/legal'

/**
 * Tells a member a document they accepted has been re-issued.
 *
 * Non-blocking by design. A version bump does NOT set requires_consent for
 * existing members — nothing about that is automatic, precisely so a content
 * edit can never lock the whole membership out by accident. Blocking is a
 * separate, deliberate migration taken after the notice period has run.
 *
 * Only the `account` bundle appears here. The publishing, competition and
 * application bundles re-prompt at the next relevant action, which is both where
 * they are relevant and where a member is already in the right frame of mind to
 * read them.
 *
 * Sits at the BOTTOM, with the clearance AnalyticsConsentBanner already worked
 * out for the floating dock and the home indicator. At the top it covered the
 * navbar — logo, primary nav and the account menu all disappeared behind it,
 * which is a worse trade than sharing the bottom edge.
 *
 * Sharing that edge is avoided rather than negotiated: while the analytics
 * banner is still pending this one renders nothing. Two stacked consent sheets
 * on a first load is worse than showing them one after the other, and the
 * analytics choice is a single click away.
 */

const SNOOZE_KEY = 'ktip_reconsent_snoozed_until'
const SNOOZE_EVENT = 'ktip:reconsent-snooze-change'
const SNOOZE_DAYS = 7

function readSnooze(): string {
  if (typeof window === 'undefined') return ''
  return window.localStorage.getItem(SNOOZE_KEY) ?? ''
}

function subscribeSnooze(listener: () => void) {
  window.addEventListener(SNOOZE_EVENT, listener)
  window.addEventListener('storage', listener)
  return () => {
    window.removeEventListener(SNOOZE_EVENT, listener)
    window.removeEventListener('storage', listener)
  }
}

function snooze() {
  const until = Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000
  window.localStorage.setItem(SNOOZE_KEY, String(until))
  window.dispatchEvent(new Event(SNOOZE_EVENT))
}

export function ReconsentBanner() {
  const { t, i18n } = useLingui()
  const toast = useToast()

  const { data: consents } = useConsents()
  const recordConsent = useRecordConsent()
  const snoozedUntilRaw = useSyncExternalStore(subscribeSnooze, readSnooze, () => '')
  const analyticsConsent = useAnalyticsConsent()

  const [open, setOpen] = useState(false)
  const [accepted, setAccepted] = useState(false)

  const outstanding = (consents ?? []).filter(
    (row) => row.bundle === 'account' && row.is_outstanding
  )

  // "Later" snoozes for a week, never forever. A notice you can permanently
  // dismiss is one nobody ever acts on, and this one has a deadline attached.
  const snoozedUntil = Number(snoozedUntilRaw)
  const snoozed = Number.isFinite(snoozedUntil) && snoozedUntil > Date.now()

  // Both banners take the same bottom edge, so they queue rather than stack.
  if (outstanding.length === 0 || snoozed || analyticsConsent === 'pending') return null

  // The earliest effective date across the outstanding set — what the member
  // needs to know is when this starts to matter, not which of four documents
  // moved first.
  const effective = outstanding
    .map((row) => row.effective_date)
    .sort()[0]
  const inForce = effective ? new Date(effective) <= new Date() : true

  const accept = async () => {
    try {
      await recordConsent.mutateAsync({
        keys: CONSENT_BUNDLES.account as LegalDocumentKey[],
        context: 'reconsent',
        expectedVersion: bundleVersion('account' as LegalBundle),
      })
      toast.success(t`Thank you. Recorded.`)
      setOpen(false)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      toast.error(
        reason === 'version_mismatch'
          ? t`These documents changed again while this page was open. Please reload.`
          : t`We could not record your agreement. Please try again.`
      )
    }
  }

  return (
    <>
      <section
        aria-label={t`Updated agreements`}
        // Same placement contract as AnalyticsConsentBanner: data-bottom-sheet
        // picks up the standalone safe-area rules in index.css, and
        // bottom-fab-clear keeps it off the floating dock until lg, where the
        // sheet is 3xl centred and the corner is free again.
        data-bottom-sheet
        className="fixed inset-x-4 bottom-fab-clear lg:bottom-4 z-toast mx-auto max-w-3xl rounded-xl border border-ktip-sand-200 bg-ktip-cream p-4 shadow-xl"
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="flex flex-1 items-start gap-3">
            <div className="mt-0.5 rounded-lg bg-ktip-ocean-100 p-2 text-ktip-ocean-700">
              <ScrollText size={18} aria-hidden />
            </div>
            <div>
              <h2 className="font-display font-bold text-ktip-sand-900">
                <Trans>We have updated our agreements</Trans>
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-ktip-sand-600">
                {inForce ? (
                  <Trans>
                    The updated documents are now in force. Please read and accept them — it takes a
                    minute.
                  </Trans>
                ) : (
                  <Trans>
                    They take effect on{' '}
                    {i18n.date(new Date(effective!), { dateStyle: 'long' })}. Read them now, or we
                    will remind you.
                  </Trans>
                )}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => snooze()}>
              <Trans>Later</Trans>
            </Button>
            <Button size="sm" onClick={() => setOpen(true)}>
              <Trans>Review</Trans>
            </Button>
            <button
              type="button"
              onClick={() => snooze()}
              aria-label={t`Dismiss for now`}
              className="rounded p-1 text-ktip-sand-400 hover:text-ktip-sand-700"
            >
              <X size={16} aria-hidden />
            </button>
          </div>
        </div>
      </section>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="lg"
        title={t`Updated agreements`}
        description={t`These replace the versions you accepted previously.`}
      >
        <div className="space-y-4">
          <ConsentDocument bundle="account" onAcceptedChange={setAccepted} dense />
          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                setOpen(false)
                snooze()
              }}
            >
              <Trans>Not now</Trans>
            </Button>
            <Button onClick={accept} loading={recordConsent.isPending} disabled={!accepted}>
              <Trans>Accept</Trans>
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
