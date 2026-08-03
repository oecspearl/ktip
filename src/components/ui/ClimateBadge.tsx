import { Leaf } from 'lucide-react'
import { Badge } from './Badge'
import { CLIMATE_ACTION_BADGE_CLASS } from '../../lib/constants'
import { Trans } from '@lingui/react/macro'

interface ClimateBadgeProps {
  size?: 'sm' | 'md'
}

export function ClimateBadge({ size }: ClimateBadgeProps) {
  return (
    <Badge className={CLIMATE_ACTION_BADGE_CLASS} size={size || 'sm'}>
      <Leaf size={size === 'md' ? 14 : 12} />
      <Trans>Climate Action</Trans>
    </Badge>
  )
}
