import { FileText, CalendarCheck, ShieldAlert } from 'lucide-react'
import { Badge } from '../ui/Badge'
import type { SubmissionKind } from '../../types'

export const SUBMISSION_KIND_LABELS: Record<SubmissionKind, string> = {
  grant_application: 'Grant Application',
  event_registration: 'Event Registration',
  grievance: 'Report',
}

export function SubmissionKindIcon({ kind, size = 20 }: { kind: SubmissionKind; size?: number }) {
  if (kind === 'event_registration') return <CalendarCheck size={size} />
  if (kind === 'grievance') return <ShieldAlert size={size} />
  return <FileText size={size} />
}

export function SubmissionKindBadge({ kind }: { kind: SubmissionKind }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-ktip-ocean-600">
        <SubmissionKindIcon kind={kind} size={18} />
      </span>
      <Badge variant="primary" size="sm">
        {SUBMISSION_KIND_LABELS[kind]}
      </Badge>
    </div>
  )
}
