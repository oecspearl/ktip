import { Link } from 'react-router'
import { Badge } from '../ui/Badge'
import type { Project } from '../../types'
import { ClimateBadge } from '../ui/ClimateBadge'
import { PHASE_LABELS, PHASE_COLORS, PROJECT_CATEGORIES } from '../../lib/constants'
import { formatDate, truncate } from '../../lib/utils'

interface ProjectCardProps {
  project: Project
}

export function ProjectCard({ project }: ProjectCardProps) {
  const getCategoryIcon = (category: string | null) => {
    const cat = PROJECT_CATEGORIES.find((c) => c.value === category)
    return cat?.icon || '✨'
  }

  return (
    <div className="flex flex-col sm:flex-row gap-5 py-6">
      {/* Project Image */}
      <Link to={`/projects/${project.id}`} className="shrink-0">
        {project.image_url ? (
          <img
            src={project.image_url}
            alt={project.title}
            className="w-full sm:w-48 h-36 object-cover rounded"
            loading="lazy"
            width={192}
            height={144}
          />
        ) : (
          <div className="w-full sm:w-48 h-36 bg-gradient-to-br from-ktip-ocean-100 to-ktip-tropical-100 rounded flex items-center justify-center text-5xl">
            {getCategoryIcon(project.category)}
          </div>
        )}
      </Link>

      {/* Content Block */}
      <div className="flex-1 min-w-0">
        {/* Posted by */}
        <p className="text-sm text-ktip-ocean-600 mb-1">
          Posted by{' '}
          <span className="font-medium">
            {project.owner?.display_name || 'Unknown'}
          </span>
        </p>

        {/* Title */}
        <Link to={`/projects/${project.id}`}>
          <h3 className="text-lg font-display font-bold text-ktip-sand-900 uppercase line-clamp-2 mb-2 hover:text-ktip-ocean-600 transition-colors">
            {project.title}
          </h3>
        </Link>

        {/* Description */}
        {project.description && (
          <p className="text-sm text-gray-600 mb-3 line-clamp-2">
            {truncate(project.description, 150)}
          </p>
        )}

        {/* Bottom metadata row */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-gray-400 uppercase tracking-wider">
            {formatDate(project.created_at, 'MMMM dd, yyyy')}
          </span>
          <div className="flex items-center gap-2">
            <Badge className={PHASE_COLORS[project.phase]}>
              {PHASE_LABELS[project.phase]}
            </Badge>
            {project.is_climate_action && <ClimateBadge />}
          </div>
        </div>
      </div>
    </div>
  )
}
