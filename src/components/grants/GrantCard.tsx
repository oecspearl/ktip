import { Badge } from '../ui/Badge'
import type { Grant } from '../../types'
import { ClimateBadge } from '../ui/ClimateBadge'
import { BentoCard } from '../ui/BentoCard'
import { formatCurrency, formatDate } from '../../lib/utils'
import { grantImageFor } from '../../lib/hero-images'
import { entityPath } from '../../lib/slug'
import { isPast } from 'date-fns'
import { Trans, useLingui } from '@lingui/react/macro'

interface GrantCardProps {
  grant: Grant
}

export function GrantCard({ grant }: GrantCardProps) {
    const { t } = useLingui()
  const hasDeadline = !!grant.deadline
  const isExpired = hasDeadline && isPast(new Date(grant.deadline!))

  const getAmountDisplay = () => {
    if (grant.amount_min && grant.amount_max) {
      return `${formatCurrency(grant.amount_min, grant.currency)} - ${formatCurrency(grant.amount_max, grant.currency)}`
    } else if (grant.amount_min) {
      return `${formatCurrency(grant.amount_min, grant.currency)}+`
    } else if (grant.amount_max) {
      const amount = formatCurrency(grant.amount_max, grant.currency)
      return t`Up to ${amount}`
    }
    return t`Amount varies`
  }

  return (
    <BentoCard
      to={entityPath('grant', grant)}
      image={grantImageFor(grant.id, grant.grant_type, grant.is_climate_action)}
      imageSeed={grant.id}
      eyebrow={grant.grant_type ? grant.grant_type.replace('_', ' ') : t`Funding`}
      title={grant.title}
      description={grant.summary || grant.description}
      meta={
        <>
          {getAmountDisplay()}
          {hasDeadline && <Trans> · Deadline {formatDate(grant.deadline!)}</Trans>}
        </>
      }
      tags={grant.tags}
      cta={t`View Grant`}
    >
      <div className="flex flex-wrap items-center gap-2">
        {isExpired && (
          <Badge variant="danger" className="bg-red-100 text-red-700">
            <Trans>Expired</Trans>
          </Badge>
        )}
        {!grant.is_active && !isExpired && <Badge variant="default"><Trans>Inactive</Trans></Badge>}
        {grant.is_climate_action && <ClimateBadge />}
      </div>
    </BentoCard>
  )
}
