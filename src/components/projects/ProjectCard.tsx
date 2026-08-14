import { Users } from 'lucide-react'
import { useLingui } from '@lingui/react/macro'
import { Badge } from '../ui/Badge'
import type { Project } from '../../types'
import { ClimateBadge } from '../ui/ClimateBadge'
import { BentoCard } from '../ui/BentoCard'
import { PHASE_LABELS, PROJECT_CATEGORIES } from '../../lib/constants'
import { formatDate } from '../../lib/utils'
import { entityPath } from '../../lib/slug'
import { useTranslatedFields, isMachineTranslated } from '../../hooks/useTranslated'
import { TranslatedMark } from '../legal/TranslatedMark'
import { resolveCopy } from '../../i18n/copy'

interface ProjectCardProps {
  project: Project
}

export function ProjectCard({ project }: ProjectCardProps) {
  const { t, i18n } = useLingui()

  /**
   * The member-written half of this card.
   *
   * `title`, `summary` and `description` are free text somebody typed; they
   * cannot be in a build-time catalog because they did not exist at build time.
   * They go through the shared cache instead — the first reader in French pays
   * for the translation, every reader after them gets it free, and a project
   * published thirty seconds ago is covered without anyone registering a column.
   *
   * Deliberately NOT here: `owner.display_name`. That is a person's name, and
   * translating one is always wrong.
   */
  const translated = useTranslatedFields(project, ['title', 'summary', 'description'])
  const shown = translated ?? project

  const rawCategoryLabel = PROJECT_CATEGORIES.find((c) => c.value === project.category)?.label
  const categoryLabel = rawCategoryLabel ? resolveCopy(i18n, rawCategoryLabel) : null

  return (
    <BentoCard
      to={entityPath('project', project)}
      image={project.image_url}
      imageSeed={project.id}
      eyebrow={categoryLabel || t`Project`}
      title={shown.title}
      description={shown.summary || shown.description}
      meta={`${project.owner?.display_name || t`Unknown`} · ${formatDate(project.created_at, 'MMM dd, yyyy')}`}
      tags={project.hashtags}
      cta={t`View Project`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="bg-white/90 text-ktip-ocean-700 dark:text-ktip-ocean-50 border-transparent">
          {resolveCopy(i18n, PHASE_LABELS[project.phase])}
        </Badge>
        {project.is_climate_action && <ClimateBadge />}
        {/* No source passed: a card is too small to expand the original into,
            and the detail page offers it. The mark is still worth having here —
            it is the first place a French reader meets translated copy. */}
        {isMachineTranslated(project, translated) && <TranslatedMark />}
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
