import { Link } from 'react-router'
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
} from 'lucide-react'
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

export function ResourceCard({ resource }: ResourceCardProps) {
  const Icon = TYPE_ICONS[resource.resource_type] || FileText

  return (
    <Link
      to={`/resources/${resource.id}`}
      className="flex flex-col md:flex-row border-b border-gray-200 pb-8 mb-8 group"
    >
      {/* Left: Thumbnail */}
      <div className="w-full md:w-48 h-36 shrink-0">
        {resource.thumbnail_url ? (
          <img
            src={resource.thumbnail_url!}
            alt={resource.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-ktip-ocean-100 to-ktip-tropical-100 flex items-center justify-center">
            <Icon size={12} />
          </div>
        )}
      </div>

      {/* Right: Content */}
      <div className="flex-1 md:pl-6 pt-4 md:pt-0">
        {/* Badges */}
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <Badge className={RESOURCE_TYPE_COLORS[resource.resource_type] || ''} size="sm">
            <Icon size={12} />
            {RESOURCE_TYPE_LABELS[resource.resource_type] || resource.resource_type}
          </Badge>
          {resource.category && (
            <Badge size="sm" className="bg-ktip-sand-100 text-ktip-sand-700 border-ktip-sand-200">
              {RESOURCE_CATEGORY_LABELS[resource.category!] || resource.category}
            </Badge>
          )}
          {resource.is_climate_action && <ClimateBadge />}
        </div>

        {/* Title */}
        <h3 className="text-lg font-display font-bold text-ktip-sand-900 uppercase line-clamp-2 mb-2 group-hover:text-ktip-ocean-600 transition-colors">
          {resource.title}
        </h3>

        {/* Description */}
        {resource.description && (
          <p className="text-sm text-gray-600 mb-3 line-clamp-2">
            {truncate(resource.description!, 150)}
          </p>
        )}

        {/* Meta */}
        <div className="flex items-center gap-3 text-xs text-gray-400">
          {resource.author && (
            <span>By {resource.author!.display_name}</span>
          )}
          <span>{formatDate(resource.created_at)}</span>
          {resource.download_url && (
            <Download size={12} className="text-gray-400" />
          )}
        </div>
      </div>
    </Link>
  )
}
