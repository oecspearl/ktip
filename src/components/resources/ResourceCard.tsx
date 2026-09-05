import { Badge } from '../ui/Badge'
import { ClimateBadge } from '../ui/ClimateBadge'
import { BentoCard } from '../ui/BentoCard'
import {
  RESOURCE_TYPE_LABELS,
  RESOURCE_CATEGORY_LABELS,
} from '../../lib/constants'
import { formatDate } from '../../lib/utils'
import type { Resource } from '../../types'
import { entityPath } from '../../lib/slug'
import { Trans, useLingui } from '@lingui/react/macro'
import { resolveCopy } from '../../i18n/copy'

interface ResourceCardProps {
  resource: Resource
}

export function ResourceCard({ resource }: ResourceCardProps) {
    const { t, i18n } = useLingui()
  const resourceTypeLabel = RESOURCE_TYPE_LABELS[resource.resource_type]
  return (
    <BentoCard
      to={entityPath('resource', resource)}
      image={resource.thumbnail_url}
      imageSeed={resource.id}
      eyebrow={resourceTypeLabel ? resolveCopy(i18n, resourceTypeLabel) : resource.resource_type}
      title={resource.title}
      description={resource.summary || resource.description}
      meta={
        <>
          {resource.author && <><Trans>By {resource.author!.display_name}</Trans> · </>}
          {formatDate(resource.created_at)}
        </>
      }
      tags={resource.tags}
      cta={t`View Resource`}
    >
      <div className="flex flex-wrap items-center gap-2">
        {resource.category && (
          <Badge size="sm" className="bg-white/90 text-ktip-ocean-700 dark:text-ktip-ocean-50 border-transparent">
            {resource.category in RESOURCE_CATEGORY_LABELS
              ? resolveCopy(i18n, RESOURCE_CATEGORY_LABELS[resource.category])
              : resource.category}
          </Badge>
        )}
        {resource.is_climate_action && <ClimateBadge />}
      </div>
    </BentoCard>
  )
}
