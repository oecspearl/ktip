import { Badge } from '../ui/Badge'
import type { Grant } from '../../types'
import { ClimateBadge } from '../ui/ClimateBadge'
import { BentoCard } from '../ui/BentoCard'
import { formatCurrency, formatDate } from '../../lib/utils'
import { isPast } from 'date-fns'

interface GrantCardProps {
  grant: Grant
}

export function GrantCard({ grant }: GrantCardProps) {
  const hasDeadline = !!grant.deadline
  const isExpired = hasDeadline && isPast(new Date(grant.deadline!))

  const getAmountDisplay = () => {
    if (grant.amount_min && grant.amount_max) {
      return `${formatCurrency(grant.amount_min, grant.currency)} - ${formatCurrency(grant.amount_max, grant.currency)}`
    } else if (grant.amount_min) {
      return `${formatCurrency(grant.amount_min, grant.currency)}+`
    } else if (grant.amount_max) {
      return `Up to ${formatCurrency(grant.amount_max, grant.currency)}`
    }
    return 'Amount varies'
  }

  return (
    <BentoCard
      to={`/grants/${grant.id}`}
      imageSeed={grant.id}
      eyebrow={grant.grant_type ? grant.grant_type.replace('_', ' ') : 'Funding'}
      title={grant.title}
      description={grant.summary || grant.description}
      meta={
        <>
          {getAmountDisplay()}
          {hasDeadline && <> · Deadline {formatDate(grant.deadline!)}</>}
        </>
      }
      cta="View Grant"
    >
      <div className="flex items-center gap-2">
        {isExpired && (
          <Badge variant="danger" className="bg-red-100 text-red-700">
            Expired
          </Badge>
        )}
        {!grant.is_active && !isExpired && <Badge variant="default">Inactive</Badge>}
        {grant.is_climate_action && <ClimateBadge />}
      </div>
    </BentoCard>
  )
}
