import { Badge } from '../ui/Badge'
import type { Project } from '../../types'
import { ClimateBadge } from '../ui/ClimateBadge'
import { BentoCard } from '../ui/BentoCard'
import { PHASE_LABELS, PROJECT_CATEGORIES } from '../../lib/constants'
import { formatDate } from '../../lib/utils'

interface ProjectCardProps {
  project: Project
}

export function ProjectCard({ project }: ProjectCardProps) {
  const categoryLabel = PROJECT_CATEGORIES.find((c) => c.value === project.category)?.label

  return (
    <BentoCard
      to={`/projects/${project.id}`}
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
        <Badge className="bg-white/90 text-gray-900 border-transparent">
          {PHASE_LABELS[project.phase]}
        </Badge>
        {project.is_climate_action && <ClimateBadge />}
      </div>
    </BentoCard>
  )
}
