import { Users } from 'lucide-react'
import { Badge } from '../ui/Badge'
import type { Project } from '../../types'
import { ClimateBadge } from '../ui/ClimateBadge'
import { BentoCard } from '../ui/BentoCard'
import { PHASE_LABELS, PROJECT_CATEGORIES } from '../../lib/constants'
import { formatDate } from '../../lib/utils'
import { entityPath } from '../../lib/slug'

interface ProjectCardProps {
  project: Project
}

export function ProjectCard({ project }: ProjectCardProps) {
  const categoryLabel = PROJECT_CATEGORIES.find((c) => c.value === project.category)?.label

  return (
    <BentoCard
      to={entityPath('project', project)}
      image={project.image_url}
      imageSeed={project.id}
      eyebrow={categoryLabel || 'Project'}
      title={project.title}
      description={project.summary || project.description}
      meta={`${project.owner?.display_name || 'Unknown'} · ${formatDate(project.created_at, 'MMM dd, yyyy')}`}
      tags={project.hashtags}
      cta="View Project"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="bg-white/90 text-ktip-ocean-700 dark:text-ktip-ocean-50 border-transparent">
          {PHASE_LABELS[project.phase]}
        </Badge>
        {project.is_climate_action && <ClimateBadge />}
        {/* Team size, so a browsing member can tell a solo project from one
            already running a group before opening it. */}
        {project.member_count > 0 && (
          <Badge className="bg-white/90 text-ktip-ocean-700 dark:text-ktip-ocean-50 border-transparent inline-flex items-center gap-1">
            <Users size={12} aria-hidden="true" />
            {project.member_count}
          </Badge>
        )}
      </div>
    </BentoCard>
  )
}
