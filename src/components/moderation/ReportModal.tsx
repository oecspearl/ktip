import { useState } from 'react'
import { AlertTriangle, Flag, ShieldAlert } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Textarea } from '../ui/Textarea'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { useReportContent } from '../../hooks/useModeration'
import type { ModerationTargetType, ReportCategory } from '../../types'
import { Trans, useLingui } from '@lingui/react/macro'
import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'

interface ReportOption {
  value: ReportCategory
  label: MessageDescriptor
  description: MessageDescriptor
  urgent?: boolean
}

export const REPORT_CATEGORIES: ReportOption[] = [
  {
    value: 'hate_harassment',
    label: msg`Hate speech or harassment`,
    description: msg`Attacks based on identity, or targeted abuse of a person.`,
  },
  {
    value: 'bullying',
    label: msg`Bullying or cyberbullying`,
    description: msg`Repeated intimidation, humiliation or threats.`,
  },
  {
    value: 'nsfw',
    label: msg`Inappropriate or explicit content`,
    description: msg`Sexual, graphic or otherwise unsuitable material.`,
  },
  {
    value: 'spam_scam',
    label: msg`Spam or scam`,
    description: msg`Unsolicited promotion, fraud, or a deceptive funding offer.`,
  },
  {
    value: 'grooming_risk',
    label: msg`Unsolicited contact or grooming risk`,
    description: msg`An adult contacting a student inappropriately, or requests for secrecy.`,
    urgent: true,
  },
  {
    value: 'pii_leak',
    label: msg`Personal information exposed`,
    description: msg`A phone number, address or personal account shared publicly.`,
  },
]

interface ReportModalProps {
  open: boolean
  onClose: () => void
  targetType: ModerationTargetType
  targetId: string
  targetAuthorId?: string | null
  /** Copied into the report so triage survives an edit or delete. */
  contentSnapshot?: string | null
  targetLabel?: string
}

/**
 * The reporting surface. Category first, detail optional — asking for a written
 * explanation up front is the main reason people abandon a report.
 */
export function ReportModal({
  open,
  onClose,
  targetType,
  targetId,
  targetAuthorId,
  contentSnapshot,
  targetLabel: targetLabelProp,
}: ReportModalProps) {
    const { t, i18n } = useLingui()
  const targetLabel = targetLabelProp ?? t`this content`
  const auth = useAuth()
  const toast = useToast()
  const { reportContent, loading } = useReportContent()

  const [category, setCategory] = useState<ReportCategory | null>(null)
  const [detail, setDetail] = useState('')

  const reset = () => {
    setCategory(null)
    setDetail('')
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleSubmit = async () => {
    if (!auth.user || !category) return
    try {
      await reportContent({
        reporterId: auth.user.id,
        targetType,
        targetId,
        targetAuthorId,
        category,
        detail: detail.trim() || undefined,
        contentSnapshot,
      })
      toast.success(t`Report submitted. Our safety team will review it.`)
      handleClose()
    } catch (err: any) {
      toast.error(err.message || t`Failed to submit report`)
    }
  }

  const selected = REPORT_CATEGORIES.find((c) => c.value === category)

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={t`Report ${targetLabel}`}
      description={t`Reports are confidential. The person you report is not told who filed it.`}
      size="md"
    >
      <div className="space-y-4">
        <div className="space-y-2">
          {REPORT_CATEGORIES.map((option) => {
            const isSelected = category === option.value
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setCategory(option.value)}
                className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-colors ${
                  isSelected
                    ? 'border-ktip-ocean-500 bg-ktip-ocean-50'
                    : 'border-ktip-sand-200 hover:border-ktip-ocean-300'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  {option.urgent ? (
                    <ShieldAlert size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
                  ) : (
                    <Flag size={16} className="text-ktip-sand-400 mt-0.5 flex-shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ktip-sand-900">{i18n._(option.label)}</p>
                    <p className="text-xs text-ktip-sand-600 mt-0.5">{i18n._(option.description)}</p>
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {selected?.urgent && (
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-50 border border-red-200">
            <AlertTriangle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-red-700">
              <Trans>This report is treated as high priority. It is sent to our safety administrators and, if a school-verified student is involved, to their institution.</Trans>
            </p>
          </div>
        )}

        <Textarea
          label={t`Anything else we should know? (optional)`}
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder={t`Add context that would help a reviewer.`}
          fullWidth
        />

        <div className="flex justify-end gap-3 pt-4 border-t border-ktip-sand-100">
          <Button variant="outline" size="sm" onClick={handleClose}>
            <Trans>Cancel</Trans>
          </Button>
          <Button size="sm" loading={loading} disabled={!category} onClick={handleSubmit}>
            <Trans>Submit report</Trans>
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export default ReportModal
