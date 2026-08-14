import { useState } from 'react'
import { Link } from 'react-router'
import { AlertTriangle, Scale } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { Button } from '../ui/Button'
import { Textarea } from '../ui/Textarea'
import { Modal } from '../ui/Modal'
import { Badge } from '../ui/Badge'
import { useToast } from '../../contexts/ToastContext'
import {
  useFileCounterNotice,
  useMyTakedownNotices,
  type MyTakedownNotice,
} from '../../hooks/useTakedowns'
import { formatDate } from '../../lib/utils'

/**
 * Notices filed against this member's content, and the route to answer one.
 *
 * The Copyright & Takedown Policy promises the accused is told what was removed,
 * why, and who filed it — a complaint you cannot see is a complaint you cannot
 * answer. This is where that promise is kept, and it is why the RPC behind it
 * returns the claimant's name and their claim rather than a redacted summary.
 *
 * Renders nothing when there are no notices, so it can sit unconditionally in
 * the reports page without adding an empty section for the many members who
 * will never see one.
 */
export function MyTakedownNotices() {
  const { t } = useLingui()
  const toast = useToast()
  const { data: notices } = useMyTakedownNotices()
  const fileCounter = useFileCounterNotice()

  const [answering, setAnswering] = useState<MyTakedownNotice | null>(null)
  const [statement, setStatement] = useState('')

  if (!notices || notices.length === 0) return null

  const submit = async () => {
    if (!answering) return
    try {
      const result = await fileCounter.mutateAsync({
        noticeId: answering.id,
        statement: statement.trim(),
      })
      toast.success(t`Counter-notice filed. Your reference is ${result.reference}.`)
      setAnswering(null)
      setStatement('')
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      toast.error(
        reason === 'statement_too_short'
          ? t`Please explain why you believe the notice was a mistake.`
          : reason === 'already_answered'
            ? t`You have already answered this notice.`
            : t`We could not file your counter-notice. Please try again.`
      )
    }
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="flex items-center gap-2 font-display text-title-sm font-bold text-ktip-sand-900">
          <Scale size={18} aria-hidden className="text-ktip-sand-500" />
          <Trans>Infringement notices about your content</Trans>
        </h2>
        <p className="mt-1 text-body text-ktip-sand-600">
          <Trans>
            Someone has claimed that content you published infringes their rights. If you believe
            that is a mistake, file a counter-notice and we will pass it to them.
          </Trans>{' '}
          <Link
            to="/legal/copyright"
            className="font-medium text-ktip-ocean-700 hover:underline underline-offset-2"
          >
            <Trans>How this works</Trans>
          </Link>
        </p>
      </div>

      <ul className="space-y-3">
        {notices.map((notice) => (
          <li
            key={notice.id}
            className="rounded-surface border border-ktip-sand-200 bg-ktip-cream p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-caption text-ktip-sand-500">{notice.reference}</p>
                <p className="mt-1 text-body font-semibold text-ktip-sand-900">
                  <Trans>Filed by {notice.claimant_name}</Trans>
                  {notice.claimant_org ? ` · ${notice.claimant_org}` : ''}
                </p>
                <p className="mt-1 break-all text-caption text-ktip-sand-600">
                  {notice.target_url}
                </p>
              </div>
              {notice.counts_as_strike && (
                <Badge variant="danger" size="sm">
                  <Trans>Standing</Trans>
                </Badge>
              )}
            </div>

            <div className="mt-3 space-y-2 text-body text-ktip-sand-700">
              <p>
                <strong className="text-ktip-sand-900">
                  <Trans>The work claimed:</Trans>
                </strong>{' '}
                {notice.work_description}
              </p>
              <p>
                <strong className="text-ktip-sand-900">
                  <Trans>Why they say it infringes:</Trans>
                </strong>{' '}
                {notice.infringement_detail}
              </p>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-caption text-ktip-sand-500">{formatDate(notice.created_at)}</p>
              {notice.answered ? (
                <p className="text-caption text-ktip-sand-500">
                  <Trans>Counter-notice filed. We will be in touch.</Trans>
                </p>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setAnswering(notice)
                    setStatement('')
                  }}
                >
                  <Trans>File a counter-notice</Trans>
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <Modal
        open={!!answering}
        onClose={() => setAnswering(null)}
        title={t`File a counter-notice`}
        description={t`Explain why you believe the content was removed by mistake or misidentification.`}
      >
        <div className="space-y-4">
          <div className="flex gap-3 rounded-surface border border-ktip-sun-300 bg-ktip-sun-50 p-4">
            <AlertTriangle size={18} aria-hidden className="mt-0.5 shrink-0 text-ktip-sun-700" />
            <p className="text-body leading-relaxed text-ktip-sand-800">
              <Trans>
                Your name and contact details are passed to the person who filed the notice — they
                cannot answer a counter-notice they cannot see. Do not file one in bad faith.
              </Trans>
            </p>
          </div>

          <Textarea
            label={t`Why was this a mistake?`}
            value={statement}
            onChange={(e) => setStatement(e.target.value)}
            rows={5}
            fullWidth
            helperText={t`Say what right you hold, or why the use is permitted.`}
          />

          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setAnswering(null)}>
              <Trans>Cancel</Trans>
            </Button>
            <Button
              onClick={submit}
              loading={fileCounter.isPending}
              disabled={statement.trim().length < 20}
            >
              <Trans>File counter-notice</Trans>
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  )
}
