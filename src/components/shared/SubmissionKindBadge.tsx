import { FileText, CalendarCheck, ShieldAlert, Trophy } from 'lucide-react'
import { msg } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import type { MessageDescriptor } from '@lingui/core'
import { Badge } from '../ui/Badge'
import type { SubmissionKind } from '../../types'

export const SUBMISSION_KIND_LABELS: Record<SubmissionKind, MessageDescriptor> = {
  grant_application: msg`Grant Application`,
  event_registration: msg`Event Registration`,
  grievance: msg`Report`,
  event_submission: msg`Hackathon Entry`,
}

export function SubmissionKindIcon({ kind, size = 20 }: { kind: SubmissionKind; size?: number }) {
  if (kind === 'event_registration') return <CalendarCheck size={size} />
  if (kind === 'grievance') return <ShieldAlert size={size} />
  if (kind === 'event_submission') return <Trophy size={size} />
  return <FileText size={size} />
}

export function SubmissionKindBadge({ kind }: { kind: SubmissionKind }) {
  const { i18n } = useLingui()
  const label = SUBMISSION_KIND_LABELS[kind]
  return (
    <div className="flex items-center gap-2">
      <span className="text-ktip-ocean-600">
        <SubmissionKindIcon kind={kind} size={18} />
      </span>
      <Badge variant="primary" size="sm">
        {label ? i18n._(label) : kind}
      </Badge>
    </div>
  )
}
