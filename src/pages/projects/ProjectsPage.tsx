import { useState, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Button } from '../../components/ui/Button'
import { ProjectCard } from '../../components/projects/ProjectCard'
import { useAuth } from '../../contexts/AuthContext'
import { useProjects } from '../../hooks/useProjects'
import { SortSelect } from '../../components/ui/SortSelect'
import { Select } from '../../components/ui/Select'
import { ColumnToggle } from '../../components/ui/ColumnToggle'
import { Plus, Inbox } from 'lucide-react'
import { CollapsibleSearch } from '../../components/ui/CollapsibleSearch'
import { CollapsibleSection } from '../../components/ui/CollapsibleSection'
import { PageHero } from '../../components/layout/PageHero'
import { projectCategoryIcon } from '../../lib/category-icons'
import { SkeletonGrid } from '../../components/ui/SkeletonCard'
import { PHASE_LABELS, PROJECT_CATEGORIES } from '../../lib/constants'
import { usePageTitle } from '../../hooks/usePageTitle'
import { useTutorialAutoStart } from '../../hooks/useTutorialAutoStart'
import { TUTORIAL_IDS } from '../../data/tutorials'
import { useGridColumns } from '../../hooks/useGridColumns'
import { usePersonalizationActive } from '../../hooks/usePersonalization'
import { resolveSort, SORT_OPTIONS, type ContentSort } from '../../lib/personalization'
import { cn, debounce } from '../../lib/utils'
import { Trans, useLingui, Plural } from '@lingui/react/macro'
import { msg } from '@lingui/core/macro'
import { resolveCopy, type Copy } from '../../i18n/copy'

// Two different translation mechanisms end up in one list, and the type has to
// admit both: "All Categories" is ours (a msg descriptor), while the category
// labels come from lib/constants and are harvested into the catalog as plain
// source strings. i18n._() resolves either, so the difference disappears at the
// render site below — but only there, never at module scope, where no language
// has been chosen yet.
type FilterOption = { value: string; label: Copy }

const CATEGORY_OPTIONS: FilterOption[] = [
  { value: '', label: msg`All Categories` },
  ...PROJECT_CATEGORIES.map((c) => ({ value: c.value as string, label: c.label })),
]

const PHASE_OPTIONS: FilterOption[] = [
  { value: '', label: msg`All Phases` },
  ...Object.entries(PHASE_LABELS).map(([value, label]) => ({ value, label })),
]

export default function ProjectsPage() {
  const { t, i18n } = useLingui()

  // Resolved here rather than at module scope, and memoised on `i18n` so the
  // labels re-resolve when the language changes.
  const categoryOptions = useMemo(
    () => CATEGORY_OPTIONS.map((o) => ({ value: o.value, label: resolveCopy(i18n, o.label) })),
    [i18n]
  )
  const phaseOptions = useMemo(
    () => PHASE_OPTIONS.map((o) => ({ value: o.value, label: resolveCopy(i18n, o.label) })),
    [i18n]
  )

  usePageTitle(t`Projects`)
  const auth = useAuth()
  // This page is public. Signed-out visitors keep every Create Project CTA —
  // it sends them to login, which is the funnel. Members whose role lacks
  // project:create (investor, for one) do not, since migration 064 made that
  // permission the RLS insert check and the form would only end in a denial.
  const canCreateProject = !auth.user || auth.can('project:create')
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [selectedPhase, setSelectedPhase] = useState<string>('')
  const initialSearch = searchParams.get('search') || ''
  const [searchQuery, setSearchQuery] = useState(initialSearch)
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch)
  const debouncedSetSearch = useMemo(() => debounce((val: string) => setDebouncedSearch(val), 300), [])

  const { columns, setColumns, gridClass } = useGridColumns('projects:columns')

  // Sort lives in the URL so it is shareable and survives back/forward, the
  // same convention as ?tab= elsewhere. With no param it resolves to "Top
  // Picks" for a personalized member and to "Newest" for everyone else.
  const { active: personalizationActive } = usePersonalizationActive()
  const sort = resolveSort(searchParams.get('sort'), personalizationActive, 'newest')

  const setSort = (next: ContentSort) => {
    const params = new URLSearchParams(searchParams)
    params.set('sort', next)
    setSearchParams(params, { replace: true })
  }

  const { projects, loading: projectsLoading } = useProjects({
    category: selectedCategory,
    phase: selectedPhase,
    search: debouncedSearch,
    sort,
  })

  useTutorialAutoStart(TUTORIAL_IDS.PROJECTS, !projectsLoading)

  const clearFilters = () => {
    setSelectedCategory('')
    setSelectedPhase('')
    setSearchQuery('')
    setDebouncedSearch('')
  }

  const hasActiveFilters = Boolean(selectedCategory || selectedPhase || searchQuery)

  // Category sections replace the flat grid whenever the list spans more than
  // one category. Picking a single category collapses back to one grid.
  const categoryGroups = useMemo(() => {
    if (!projects || selectedCategory) return []
    const buckets = new Map<string, typeof projects>()
    for (const project of projects) {
      const cat = PROJECT_CATEGORIES.some((c) => c.value === project.category)
        ? (project.category as string)
        : 'other'
      const bucket = buckets.get(cat)
      if (bucket) bucket.push(project)
      else buckets.set(cat, [project])
    }
    // Under "For You" the sections follow the ranking — best match's category
    // first. Otherwise fixed vocabulary order, so the page reads the same on
    // every visit.
    const order =
      sort === 'for_you'
        ? [...buckets.keys()]
        : PROJECT_CATEGORIES.map((c) => c.value as string)
    return order.flatMap((value) => {
      const items = buckets.get(value)
      if (!items?.length) return []
      const rawLabel = PROJECT_CATEGORIES.find((c) => c.value === value)?.label ?? 'Other'
      return [{ value, label: resolveCopy(i18n, rawLabel), items }]
    })
  }, [projects, selectedCategory, sort, i18n])

  return (
    <>
      <PageHero
        eyebrow={t`Project Archives`}
        title={t`Projects`}
        imageSeed="projects"
        breadcrumb={[{ label: t`Home`, href: '/' }, { label: t`Projects` }]}
      />

      {/* === Content Area — full width, no sidebar ===
          data-spy-off: the only two sections are the filter bar and the grid
          under it, which is not navigation. Markers stay for the tour. */}
      <div data-spy-off className="bg-ktip-sand-50 py-12">
        <div className="max-w-page-narrow mx-auto px-4">

          <div>
            {/* Filter Bar */}
            <div id="filters" data-spy="Filters" className="scroll-mt-24 mb-8">
              {/* Filter row — search collapses into it, same as the events page */}
              <div className="flex flex-wrap items-center gap-3">
                <Select
                  value={selectedCategory}
                  onChange={setSelectedCategory}
                  options={categoryOptions}
                  ariaLabel={t`Filter by category`}
                />

                <Select
                  value={selectedPhase}
                  onChange={setSelectedPhase}
                  options={phaseOptions}
                  ariaLabel={t`Filter by phase`}
                />

                {/* Result count rides the filter row rather than sitting above
                    the grid */}
                {!projectsLoading && projects && (
                  <p className="text-sm text-gray-500">
                    <Plural
                      value={projects.length}
                      one="Found # project"
                      other="Found # projects"
                    />
                    {categoryGroups.length > 1 && (
                      <>
                        {' '}
                        <Plural
                          value={categoryGroups.length}
                          one="in # category"
                          other="in # categories"
                        />
                      </>
                    )}
                  </p>
                )}

                <div className="ml-auto flex items-center gap-2">
                  <SortSelect
                    value={sort}
                    onChange={setSort}
                    options={SORT_OPTIONS.project.options}
                    personalizationActive={personalizationActive}
                  />
                  <CollapsibleSearch
                    value={searchQuery}
                    onChange={(val) => { setSearchQuery(val); debouncedSetSearch(val) }}
                    placeholder={t`Search projects...`}
                    ariaLabel={t`Search projects`}
                  />

                  <ColumnToggle value={columns} onChange={setColumns} />

                  {canCreateProject && (
                    <Link to="/projects/new" data-tutorial="projects-create">
                      <button className="flex items-center gap-1.5 px-4 py-2 btn-brand text-sm font-bold uppercase tracking-wider rounded-lg">
                        <Plus size={16} />
                        <Trans>Create Project</Trans>
                      </button>
                    </Link>
                  )}
                </div>
              </div>

              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="mt-2 text-sm text-ktip-ocean-600 hover:text-ktip-ocean-700 hover:underline transition-colors"
                >
                  <Trans>Clear all filters</Trans>
                </button>
              )}
            </div>

            {/* Project List */}
            <div id="projects" data-spy="Projects" className="scroll-mt-24">
            {projectsLoading || !projects ? (
              <SkeletonGrid count={6} className={cn(gridClass, 'gap-4 auto-rows-fr')} />
            ) : projects.length > 0 ? (
              <div>
                {categoryGroups.length > 1 ? (
                  <div className="space-y-2">
                    {categoryGroups.map((group) => {
                      const Icon = projectCategoryIcon(group.value)
                      return (
                        <CollapsibleSection
                          key={group.value}
                          title={group.label}
                          count={group.items.length}
                          icon={<Icon size={16} className="text-ktip-sand-400" />}
                          className="first:border-t-0 first:pt-0"
                        >
                          <div className={cn(gridClass, 'gap-4 auto-rows-fr')}>
                            {group.items.map((project) => (
                              <ProjectCard key={project.id} project={project} />
                            ))}
                          </div>
                        </CollapsibleSection>
                      )
                    })}
                  </div>
                ) : (
                  <div className={cn(gridClass, 'gap-4 auto-rows-fr stagger-children')}>
                    {projects.map((project) => (
                      <ProjectCard key={project.id} project={project} />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-16">
                <div className="w-16 h-16 bg-ktip-sand-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Inbox size={32} className="text-gray-400" />
                </div>
                <h3 className="text-2xl font-display font-bold text-ktip-sand-900 mb-2">
                  <Trans>No projects found</Trans>
                </h3>
                <p className="text-gray-500 mb-6">
                  {hasActiveFilters
                    ? t`Try adjusting your filters or search query`
                    : t`Be the first to create a project!`}
                </p>
                {!hasActiveFilters && canCreateProject && (
                  <Link to="/projects/new">
                    <Button icon={<Plus size={20} />}><Trans>Create First Project</Trans></Button>
                  </Link>
                )}
              </div>
            )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
