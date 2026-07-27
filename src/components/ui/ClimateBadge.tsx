import { Leaf } from 'lucide-solid'
import { Badge } from './Badge'
import { CLIMATE_ACTION_BADGE_CLASS } from '../../lib/constants'

interface ClimateBadgeProps {
  size?: 'sm' | 'md'
}

export function ClimateBadge(props: ClimateBadgeProps) {
  return (
    <Badge class={CLIMATE_ACTION_BADGE_CLASS} size={props.size || 'sm'}>
      <Leaf size={props.size === 'md' ? 14 : 12} />
      Climate Action
    </Badge>
  )
}
