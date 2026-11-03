import { useLingui } from '@lingui/react/macro'
import { Badge } from '../ui/Badge'
import type { ContentModerationStatus } from '../../hooks/useAdminContentStatus'

/**
 * The moderation column on the console tables (183). "Suspended" is what an
 * admin calls the quarantined state; the database keeps 122's word.
 */
export function ModerationStatusBadge({ status }: { status: ContentModerationStatus | null | undefined }) {
  const { t } = useLingui()
  if (status === 'quarantined') {
    return (
      <Badge size="sm" variant="warning">
        {t`Suspended`}
      </Badge>
    )
  }
  if (status === 'removed') {
    return (
      <Badge size="sm" variant="danger">
        {t`Removed`}
      </Badge>
    )
  }
  return (
    <Badge size="sm" variant="default">
      {t`Active`}
    </Badge>
  )
}
