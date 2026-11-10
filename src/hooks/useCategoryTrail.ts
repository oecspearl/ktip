import { useMemo } from 'react'
import { useLingui } from '@lingui/react/macro'
import { useProjects } from './useProjects'
import { useEvents } from './useEvents'
import { useGrants } from './useGrants'
import { useResources } from './useResources'
import {
  categoryTrail,
  EVENT_TYPE_OPTIONS,
  RESOURCE_CATEGORY_OPTIONS,
  type CategoryOption,
} from '../lib/category-crumbs'
import { PROJECT_CATEGORIES } from '../lib/constants'
import { GRANT_FOCUS_AREAS } from '../lib/funding-types'
import { entityPath, type SlugEntity } from '../lib/slug'
import { truncate } from '../lib/utils'
import type { BreadcrumbItem } from '../components/layout/BreadcrumbNav'
import type { CrumbBadge } from '../components/layout/breadcrumb-menu'
import { eventPhase } from '../lib/event-timing'
import { isOpenCall } from '../lib/grant-metrics'
import type { Event, Grant, Project, Resource } from '../types'

/**
 * Breadcrumbs for the four categorised detail pages:
 *
 *   Home › Projects › Environment › ReefWatch AI
 *   Home › Events › Hackathon › Blue Economy Build Week
 *   Home › Grants › Research Grants › Caribbean Marine Fund
 *   Home › Resources › Climate Action › Coastal Toolkit
 *
 * Each reads the same unfiltered list its listing page reads, so the menus
 * usually come straight out of the query cache, and the counts are the ones
 * the listing would show.
 */

interface Row {
  id: string
  slug?: string | null
  title: string
}

function useTrail<T extends Row>(
  entity: SlugEntity,
  section: { label: string; href: string },
  param: string,
  categories: readonly CategoryOption[],
  current: T | null | undefined,
  categoryOf: (item: T) => string | null | undefined,
  items: readonly T[] | undefined,
  /** The title as the reader sees it, when the page translates it. */
  displayTitle?: string,
  badgeOf?: (item: T) => CrumbBadge | undefined
): BreadcrumbItem[] | undefined {
  const { t } = useLingui()
  return useMemo(() => {
    if (!current) return undefined
    return categoryTrail<T>({
      home: t`Home`,
      section,
      param,
      categories,
      current: {
        id: current.id,
        title: truncate(displayTitle ?? current.title, 30),
        category: categoryOf(current),
      },
      items,
      categoryOf,
      idOf: (item) => item.id,
      titleOf: (item) => item.title,
      pathOf: (item) => entityPath(entity, item),
      seeAll: (count) => t`See all ${count}`,
      badgeOf,
    })
    // section/categoryOf are rebuilt by each caller every render; what the
    // trail depends on is the row, the list and the language.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, items, displayTitle, t])
}

export function useProjectTrail(project: Project | null | undefined) {
  const { t } = useLingui()
  const { projects } = useProjects()
  return useTrail<Project>(
    'project',
    { label: t`Projects`, href: '/projects' },
    'category',
    PROJECT_CATEGORIES,
    project,
    (p) => p.category,
    projects
  )
}

export function useEventTrail(
  event: Event | null | undefined,
  displayTitle?: string
) {
  const { t } = useLingui()
  const { events } = useEvents()
  return useTrail<Event>(
    'event',
    { label: t`Events`, href: '/events' },
    'type',
    EVENT_TYPE_OPTIONS,
    event,
    (e) => e.event_type,
    events,
    displayTitle,
    // Open while it is coming up or running; closed once it ends or is called off.
    (e) =>
      e.status !== 'cancelled' && eventPhase(e) !== 'past'
        ? { label: t`Open`, tone: 'open' }
        : { label: t`Closed`, tone: 'closed' }
  )
}

export function useGrantTrail(grant: Grant | null | undefined) {
  const { t } = useLingui()
  const { grants } = useGrants()
  return useTrail<Grant>(
    'grant',
    { label: t`Grants`, href: '/grants' },
    'type',
    GRANT_FOCUS_AREAS,
    grant,
    (g) => g.grant_type,
    grants,
    undefined,
    // The same rule the Funding page splits its open and closed calls by.
    (g) => (isOpenCall(g) ? { label: t`Open`, tone: 'open' } : { label: t`Closed`, tone: 'closed' })
  )
}

export function useResourceTrail(resource: Resource | null | undefined) {
  const { t } = useLingui()
  const { resources } = useResources()
  return useTrail<Resource>(
    'resource',
    { label: t`Resources`, href: '/resources' },
    'category',
    RESOURCE_CATEGORY_OPTIONS,
    resource,
    (r) => r.category,
    resources
  )
}
