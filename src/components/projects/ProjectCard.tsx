import { A } from '@solidjs/router'
import { Show } from 'solid-js'
import { Badge } from '../ui/Badge'
import type { Project } from '../../types'
import { ClimateBadge } from '../ui/ClimateBadge'
import { PHASE_LABELS, PHASE_COLORS, PROJECT_CATEGORIES } from '../../lib/constants'
import { formatDate, truncate } from '../../lib/utils'

interface ProjectCardProps {
  project: Project
}

export function ProjectCard(props: ProjectCardProps) {
  const getCategoryIcon = (category: string | null) => {
    const cat = PROJECT_CATEGORIES.find((c) => c.value === category)
    return cat?.icon || '✨'
  }

  return (
    <div class="flex flex-col sm:flex-row gap-5 py-6">
      {/* Project Image */}
      <A href={`/projects/${props.project.id}`} class="shrink-0">
        <Show
          when={props.project.image_url}
          fallback={
            <div class="w-full sm:w-48 h-36 bg-gradient-to-br from-ktip-ocean-100 to-ktip-tropical-100 rounded flex items-center justify-center text-5xl">
              {getCategoryIcon(props.project.category)}
            </div>
          }
        >
          <img
            src={props.project.image_url!}
            alt={props.project.title}
            class="w-full sm:w-48 h-36 object-cover rounded"
            loading="lazy"
            width={192}
            height={144}
          />
        </Show>
      </A>

      {/* Content Block */}
      <div class="flex-1 min-w-0">
        {/* Posted by */}
        <p class="text-sm text-ktip-ocean-600 mb-1">
          Posted by{' '}
          <span class="font-medium">
            {props.project.owner?.display_name || 'Unknown'}
          </span>
        </p>

        {/* Title */}
        <A href={`/projects/${props.project.id}`}>
          <h3 class="text-lg font-display font-bold text-ktip-sand-900 uppercase line-clamp-2 mb-2 hover:text-ktip-ocean-600 transition-colors">
            {props.project.title}
          </h3>
        </A>

        {/* Description */}
        <Show when={props.project.description}>
          <p class="text-sm text-gray-600 mb-3 line-clamp-2">
            {truncate(props.project.description!, 150)}
          </p>
        </Show>

        {/* Bottom metadata row */}
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="text-xs text-gray-400 uppercase tracking-wider">
            {formatDate(props.project.created_at, 'MMMM dd, yyyy')}
          </span>
          <div class="flex items-center gap-2">
            <Badge class={PHASE_COLORS[props.project.phase]}>
              {PHASE_LABELS[props.project.phase]}
            </Badge>
            <Show when={props.project.is_climate_action}>
              <ClimateBadge />
            </Show>
          </div>
        </div>
      </div>
    </div>
  )
}
