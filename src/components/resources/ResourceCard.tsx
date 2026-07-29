import { Badge } from '../ui/Badge'
import { ClimateBadge } from '../ui/ClimateBadge'
import { MatchReasonChip } from '../ui/MatchReasonChip'
import { BentoCard } from '../ui/BentoCard'
import {
  RESOURCE_TYPE_LABELS,
  RESOURCE_CATEGORY_LABELS,
} from '../../lib/constants'
import { formatDate } from '../../lib/utils'
import type { Resource } from '../../types'

interface ResourceCardProps {
  resource: Resource
}

export function ResourceCard({ resource }: ResourceCardProps) {
  return (
    <BentoCard
      to={`/resources/${resource.id}`}
      image={resource.thumbnail_url}
      imageSeed={resource.id}
      eyebrow={RESOURCE_TYPE_LABELS[resource.resource_type] || resource.resource_type}
      title={resource.title}
      description={resource.summary || resource.description}
      meta={
        <>
          {resource.author && <>By {resource.author!.display_name} · </>}
          {formatDate(resource.created_at)}
        </>
      }
      tags={resource.tags}
      cta="View Resource"
    >
      <div className="flex flex-wrap items-center gap-2">
        {resource.category && (
          <Badge size="sm" className="bg-white/90 text-gray-700 border-transparent">
            {RESOURCE_CATEGORY_LABELS[resource.category!] || resource.category}
          </Badge>
        )}
        {resource.is_climate_action && <ClimateBadge />}
        {/* Only present when the list was fetched under the "For You" sort. */}
        <MatchReasonChip reasons={resource.match_reasons} />
      </div>
    </BentoCard>
  )
}
