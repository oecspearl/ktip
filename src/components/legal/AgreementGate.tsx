import { useState } from 'react'
import { Link } from 'react-router'
import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import type { MessageDescriptor } from '@lingui/core'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { ConsentDocument } from './ConsentDocument'
import type { AgreementGate as GateState, ConsentContext } from '../../hooks/useAgreementGate'
import { documentsInBundle, legalPath, type LegalBundle } from '../../lib/legal'
import { resolveLegal } from './LegalBody'

type GatedBundle = Exclude<LegalBundle, 'informational'>

/**
 * The inline notice above a submit button.
 *
 * Each pairs what the member grants with what they keep. That is deliberate: a
 * wall of legal text above a submit button that only lists what you give up
 * reads as a warning, and warnings above submit buttons depress submissions. The
 * reassurance is also the more important half of the sentence, and it is true.
 */
const NOTICE_COPY: Record<GatedBundle, MessageDescriptor> = {
  account: msg`By continuing you agree to the account documents.`,
  publishing: msg`By publishing you agree to the IP, Content & Licensing Policy and the Copyright & Takedown Policy. You keep ownership of your work.`,
  competition: msg`By submitting an entry you agree to the Submission & Competition IP Terms. You keep ownership of your work, and a prize buys no rights to it.`,
  application: msg`Your application is confidential and reaches only the named funder and its reviewers. Submitting it licenses nothing.`,
}

/** One-line notice, rendered ALWAYS — not only when the gate is outstanding. */
export function AgreementNotice({
  bundle,
  className,
}: {
  bundle: GatedBundle
  className?: string
}) {
  const { i18n } = useLingui()
  const docs = documentsInBundle(bundle)

  return (
    <p className={className ?? 'text-caption leading-relaxed text-ktip-sand-500'}>
      {i18n._(NOTICE_COPY[bundle])}{' '}
      {docs.map((doc, index) => (
        <span key={doc.key}>
          {index > 0 && <span aria-hidden> · </span>}
          <Link
            to={legalPath(doc.key)}
            target="_blank"
            className="font-medium text-ktip-ocean-700 hover:underline underline-offset-2"
          >
            {resolveLegal(i18n, doc.title)}
          </Link>
        </span>
      ))}
    </p>
  )
}

interface AgreementGateModalProps {
  gate: GateState
  bundle: GatedBundle
  open: boolean
  onClose: () => void
  /** Runs after the acceptance is recorded — resume whatever the member was doing. */
  onAccepted: () => void | Promise<void>
  context: ConsentContext
  /**
   * `action` — the default: opened by a submit, once per version.
   * `entry`  — opened by AgreementRoute every time a gated page is entered,
   *            whatever the member has accepted before. Closing it leaves the
   *            page, so the secondary button says "Go back".
   */
  mode?: 'action' | 'entry'
}

/**
 * The blocking modal. On a submit (`action`) it shows once per version; on the
 * way into a create or edit page (`entry`, via AgreementRoute) it shows on
 * every visit.
 *
 * There is no "remind me later". A member who declines simply closes it and
 * their content is not published — which is the honest outcome, and better than
 * a dismissal that silently leaves the work unpublished for reasons they will
 * not connect to this dialog an hour later.
 */
export function AgreementGateModal({
  gate,
  bundle,
  open,
  onClose,
  onAccepted,
  context,
  mode = 'action',
}: AgreementGateModalProps) {
  const { t } = useLingui()
  const [accepted, setAccepted] = useState(false)
  const [failure, setFailure] = useState('')
  const entry = mode === 'entry'

  const handleAccept = async () => {
    setFailure('')
    try {
      await gate.accept(context)
      await onAccepted()
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      setFailure(
        reason === 'version_mismatch'
          ? t`These terms have been updated since this page loaded. Reload and read the current version.`
          : t`We could not record your agreement. Please try again.`
      )
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={
        bundle === 'competition'
          ? t`Before you submit your entry`
          : bundle === 'application'
            ? t`Before you submit your application`
            : t`Before you publish`
      }
      description={
        entry
          ? bundle === 'application'
            ? t`One agreement covers every application you submit. It opens each time you start or return to an application.`
            : t`Two documents cover everything you publish on KTIP. They open each time you start or edit something here.`
          : bundle === 'competition'
            ? t`One agreement covers every entry you submit. You will not be asked again unless it changes.`
            : bundle === 'application'
              ? t`One agreement covers every application you submit. You will not be asked again unless it changes.`
              : t`Two documents cover everything you publish on KTIP. You will not be asked again unless they change.`
      }
    >
      <div className="space-y-4">
        {/* On entry, a member who already accepted this version ticks the box
            again but is not made to scroll the same text on every visit. */}
        <ConsentDocument
          bundle={bundle}
          onAcceptedChange={setAccepted}
          dense
          requireScroll={!entry || gate.outstanding.length > 0}
        />

        {failure && (
          <p role="alert" className="text-body text-red-600">
            {failure}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="secondary" onClick={onClose} disabled={gate.accepting}>
            {entry ? <Trans>Go back</Trans> : <Trans>Not now</Trans>}
          </Button>
          <Button onClick={handleAccept} loading={gate.accepting} disabled={!accepted}>
            <Trans>Agree & continue</Trans>
          </Button>
        </div>
      </div>
    </Modal>
  )
}
