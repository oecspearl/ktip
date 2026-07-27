import { Show } from 'solid-js'
import { A } from '@solidjs/router'
import { Badge } from '../ui/Badge'
import { ClimateBadge } from '../ui/ClimateBadge'
import {
  FileText,
  BookOpen,
  Briefcase,
  FileCode,
  Video,
  Star,
  Download,
} from 'lucide-solid'
import {
  RESOURCE_TYPE_LABELS,
  RESOURCE_TYPE_COLORS,
  RESOURCE_CATEGORY_LABELS,
} from '../../lib/constants'
import { formatDate, truncate } from '../../lib/utils'
import type { Resource } from '../../types'

const TYPE_ICONS: Record<string, any> = {
  article: FileText,
  guide: BookOpen,
  case_study: Briefcase,
  template: FileCode,
  video: Video,
  success_story: Star,
}

interface ResourceCardProps {
  resource: Resource
}

export function ResourceCard(props: ResourceCardProps) {
  const IconComponent = () => {
    const Ic = TYPE_ICONS[props.resource.resource_type] || FileText
    return <Ic size={12} />
  }

  return (
    <A
      href={`/resources/${props.resource.id}`}
      class="flex flex-col md:flex-row border-b border-gray-200 pb-8 mb-8 group"
    >
      {/* Left: Thumbnail */}
      <div class="w-full md:w-48 h-36 shrink-0">
        <Show
          when={props.resource.thumbnail_url}
          fallback={
            <div class="w-full h-full bg-gradient-to-br from-ktip-ocean-100 to-ktip-tropical-100 flex items-center justify-center">
              <IconComponent />
            </div>
          }
        >
          <img
            src={props.resource.thumbnail_url!}
            alt={props.resource.title}
            class="w-full h-full object-cover"
            loading="lazy"
          />
        </Show>
      </div>

      {/* Right: Content */}
      <div class="flex-1 md:pl-6 pt-4 md:pt-0">
        {/* Badges */}
        <div class="flex flex-wrap items-center gap-2 mb-2">
          <Badge class={RESOURCE_TYPE_COLORS[props.resource.resource_type] || ''} size="sm">
            <IconComponent />
            {RESOURCE_TYPE_LABELS[props.resource.resource_type] || props.resource.resource_type}
          </Badge>
          <Show when={props.resource.category}>
            <Badge size="sm" class="bg-ktip-sand-100 text-ktip-sand-700 border-ktip-sand-200">
              {RESOURCE_CATEGORY_LABELS[props.resource.category!] || props.resource.category}
            </Badge>
          </Show>
          <Show when={props.resource.is_climate_action}>
            <ClimateBadge />
          </Show>
        </div>

        {/* Title */}
        <h3 class="text-lg font-display font-bold text-ktip-sand-900 uppercase line-clamp-2 mb-2 group-hover:text-ktip-ocean-600 transition-colors">
          {props.resource.title}
        </h3>

        {/* Description */}
        <Show when={props.resource.description}>
          <p class="text-sm text-gray-600 mb-3 line-clamp-2">
            {truncate(props.resource.description!, 150)}
          </p>
        </Show>

        {/* Meta */}
        <div class="flex items-center gap-3 text-xs text-gray-400">
          <Show when={props.resource.author}>
            <span>By {props.resource.author!.display_name}</span>
          </Show>
          <span>{formatDate(props.resource.created_at)}</span>
          <Show when={props.resource.download_url}>
            <Download size={12} class="text-gray-400" />
          </Show>
        </div>
      </div>
    </A>
  )
}
