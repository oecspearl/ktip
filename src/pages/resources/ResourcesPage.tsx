import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ResourceCard } from '../../components/resources/ResourceCard'
import { IntegrationCard } from '../../components/integrations/IntegrationCard'
import { CourseCard } from '../../components/courses/CourseCard'
import { useResources } from '../../hooks/useResources'
import { useIntegrations } from '../../hooks/useIntegrations'
import { useExternalCourses } from '../../hooks/useExternalCourses'
import { useMyKtipEnrollments } from '../../hooks/useMyKtipEnrollments'
import { useTagVocabulary } from '../../hooks/useTagVocabulary'
import { TagFilterSelect } from '../../components/ui/TagFilterSelect'
import { SortSelect } from '../../components/ui/SortSelect'
import { Select } from '../../components/ui/Select'
import { ColumnToggle } from '../../components/ui/ColumnToggle'
import { CollapsibleSearch } from '../../components/ui/CollapsibleSearch'
import { CollapsibleSection } from '../../components/ui/CollapsibleSection'
import { FilterBar } from '../../components/ui/FilterBar'
import { useAuth } from '../../contexts/AuthContext'
import { usePageTitle } from '../../hooks/usePageTitle'
import { useGridColumns } from '../../hooks/useGridColumns'
import { usePersonalizationActive } from '../../hooks/usePersonalization'
import { resolveSort, SORT_OPTIONS, type ContentSort } from '../../lib/personalization'
import { Search, BookOpen, Puzzle, GraduationCap, Plus } from 'lucide-react'
import { PageHero } from '../../components/layout/PageHero'
import { SkeletonGrid } from '../../components/ui/SkeletonCard'
import { integrationCategoryIcon, resourceCategoryIcon } from '../../lib/category-icons'
import { cn, debounce } from '../../lib/utils'
import {
  RESOURCE_TYPE_LABELS,
  RESOURCE_CATEGORY_LABELS,
  INTEGRATION_CATEGORY_LABELS,
} from '../../lib/constants'
import type { Integration, Resource } from '../../types'
import { Plural, Trans, useLingui } from '@lingui/react/macro'
import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'
import { resolveCopy, type Copy } from '../../i18n/copy'

type Tab = 'resources' | 'integrations' | 'courses'

const TABS: { id: Tab; label: MessageDescriptor; icon: typeof BookOpen }[] = [
  { id: 'resources', label: msg`Resources`, icon: BookOpen },
  { id: 'integrations', label: msg`Integrations`, icon: Puzzle },
  { id: 'courses', label: msg`Courses`, icon: GraduationCap },
]

const RESOURCE_TYPE_OPTIONS: { value: string; label: Copy }[] = [
  { value: '', label: msg`All Types` },
  ...Object.entries(RESOURCE_TYPE_LABELS).map(([value, label]) => ({ value, label })),
]

const RESOURCE_CATEGORY_OPTIONS: { value: string; label: Copy }[] = [
  { value: '', label: msg`All Categories` },
  ...Object.entries(RESOURCE_CATEGORY_LABELS).map(([value, label]) => ({ value, label })),
]

const INTEGRATION_CATEGORY_OPTIONS: { value: string; label: Copy }[] = [
  { value: '', label: msg`All Categories` },
  ...Object.entries(INTEGRATION_CATEGORY_LABELS).map(([value, label]) => ({ value, label })),
]

/**
 * Buckets a list into category sections. Fixed vocabulary order, then any
 * category the vocabulary does not know; a single bucket means the caller
 * should stay on a flat grid.
 */
function groupByCategory<T>(
  items: T[],
  categoryOf: (item: T) => string | null | undefined,
  labels: Record<string, string>,
  otherLabel: string
) {
  const buckets = new Map<string, T[]>()
  for (const item of items) {
    const key = categoryOf(item) || 'other'
    const bucket = buckets.get(key)
    if (bucket) bucket.push(item)
    else buckets.set(key, [item])
  }
  const known = Object.keys(labels)
  const ordered = [...known, ...[...buckets.keys()].filter((k) => !known.includes(k))]
  return ordered.flatMap((value) => {
    const group = buckets.get(value)
    return group?.length ? [{ value, label: labels[value] ?? otherLabel, items: group }] : []
  })
}

/** Unique, sorted, non-empty values — used to build filter options from live data. */
function uniqueValues<T>(items: T[], pick: (item: T) => string | null | undefined): string[] {
  return [...new Set(items.map(pick).filter((v): v is string => !!v))].sort()
}

export default function ResourcesPage() {
  const { t, i18n } = useLingui()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const tab: Tab = tabParam === 'integrations' ? 'integrations' : tabParam === 'courses' ? 'courses' : 'resources'
  usePageTitle(tab === 'integrations' ? t`Integrations` : tab === 'courses' ? t`Courses` : t`Resources`)

  const setTab = (t: Tab) => {
    // Keep ?sort= across tab switches; only the tab itself is rewritten.
    const params = new URLSearchParams(searchParams)
    if (t === 'resources') params.delete('tab')
    else params.set('tab', t)
    setSearchParams(params, { replace: true })
  }

  return (
    <>
      <PageHero
        eyebrow={t`Knowledge Base`}
        title={t`Resources & Integrations`}
        imageSeed="resources"
        breadcrumb={[{ label: t`Home`, href: '/' }, { label: t`Resources` }]}
      />

      {/* === Tabs === */}
      <div className="bg-ktip-sand-50 pt-6">
        <div className="max-w-page-narrow mx-auto px-4">
          <div
          role="tablist"
          data-tutorial="resources-tabs"
          aria-label={t`Knowledge base sections`}
          className="flex gap-1 border-b border-ktip-sand-200"
        >
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2.5 text-sm font-semibold -mb-px border-b-2 transition-colors',
                  tab === id
                    ? 'border-ktip-ocean-600 text-ktip-ocean-700'
                    : 'border-transparent text-ktip-sand-500 hover:text-ktip-sand-700'
                )}
              >
                <Icon size={16} />
                {i18n._(label)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {tab === 'resources' ? <ResourcesTab /> : tab === 'integrations' ? <IntegrationsTab /> : <CoursesTab />}
    </>
  )
}

function ResourcesTab() {
  const { t, i18n } = useLingui()
  const auth = useAuth()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const debouncedSetSearch = useMemo(() => debounce((val: string) => setDebouncedSearch(val), 300), [])
  const [typeFilter, setTypeFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [tagFilter, setTagFilter] = useState<string[]>([])
  const [searchParams, setSearchParams] = useSearchParams()

  const { tags: tagOptions } = useTagVocabulary('resources')
  const { columns, setColumns, gridClass } = useGridColumns('resources:columns')

  // Sort lives in the URL so it is shareable and survives back/forward.
  const { active: personalizationActive } = usePersonalizationActive()
  const sort = resolveSort(searchParams.get('sort'), personalizationActive, 'newest')

  const setSort = (next: ContentSort) => {
    const params = new URLSearchParams(searchParams)
    params.set('sort', next)
    setSearchParams(params, { replace: true })
  }

  const { resources, loading } = useResources({
    search: debouncedSearch,
    type: typeFilter,
    category: categoryFilter,
    tags: tagFilter,
    sort,
  })

  // Category sections replace the flat grid unless a single category is picked
  const categoryGroups = useMemo(
    () =>
      resources && !categoryFilter
        ? groupByCategory<Resource>(
            resources,
            (resource) => resource.category,
            RESOURCE_CATEGORY_LABELS,
            t`Other`
          )
        : [],
    [resources, categoryFilter, t]
  )

  const hasActiveFilters = !!(searchQuery || typeFilter || categoryFilter || tagFilter.length)

  // Only the controls that live inside the sheet count toward the badge —
  // search has its own visible affordance in the bar at every width.
  const activeFilterCount =
    (typeFilter ? 1 : 0) + (categoryFilter ? 1 : 0) + (tagFilter.length ? 1 : 0)

  // Signed-out visitors keep the CTA: it funnels to login rather than hiding
  // that contributing is possible at all. Same call ProjectsPage makes.
  const canSubmit = !auth.user || auth.can('resource:submit')

  const clearFilters = () => {
    setSearchQuery('')
    setDebouncedSearch('')
    setTypeFilter('')
    setCategoryFilter('')
    setTagFilter([])
  }

  return (
    <>
      {/* === Filter Section === */}
      {/* data-spy-off: Resources / Integrations / Courses are exclusive tabs,
          so only one grid is ever mounted — the rail would be the filter bar
          and that grid. The marker stays for the tour. */}
      <div
        id="filters"
        data-spy="Filters"
        data-spy-off
        className="scroll-mt-24 bg-ktip-sand-50 py-8"
      >
        <div className="max-w-page-narrow mx-auto px-4">
          {/* Was a hand-rolled `flex flex-wrap` row. FilterBar is the same bar
              on a desktop and a working one on a phone — see its header. The
              submit CTA is the reason for the swap: `ml-auto` puts a button
              past the viewport edge at 393px, which is exactly where a member
              is most likely to be reading. */}
          <FilterBar
            open={filtersOpen}
            onOpenChange={setFiltersOpen}
            sheetTitle={t`Filter resources`}
            activeCount={activeFilterCount}
            onClear={hasActiveFilters ? clearFilters : undefined}
            filters={
              <>
                <Select
                  value={typeFilter}
                  onChange={setTypeFilter}
                  options={RESOURCE_TYPE_OPTIONS.map((o) => ({ ...o, label: resolveCopy(i18n, o.label) }))}
                  ariaLabel={t`Filter by resource type`}
                />

                <Select
                  value={categoryFilter}
                  onChange={setCategoryFilter}
                  options={RESOURCE_CATEGORY_OPTIONS.map((o) => ({ ...o, label: resolveCopy(i18n, o.label) }))}
                  ariaLabel={t`Filter by category`}
                />

                <TagFilterSelect options={tagOptions} selected={tagFilter} onChange={setTagFilter} />
              </>
            }
            count={
              !loading && resources ? (
                <>
                  <Plural value={resources.length} one="Found # resource" other="Found # resources" />
                  {categoryGroups.length > 1 && (
                    <>
                      {' '}
                      <Plural value={categoryGroups.length} one="in # category" other="in # categories" />
                    </>
                  )}
                </>
              ) : undefined
            }
            actions={
              <>
                <SortSelect
                  value={sort}
                  onChange={setSort}
                  options={SORT_OPTIONS.resource.options}
                  personalizationActive={personalizationActive}
                />
                <CollapsibleSearch
                  value={searchQuery}
                  onChange={(val) => { setSearchQuery(val); debouncedSetSearch(val) }}
                  placeholder={t`Search resources...`}
                  ariaLabel={t`Search resources`}
                />
                <ColumnToggle value={columns} onChange={setColumns} />
              </>
            }
            cta={
              canSubmit ? (
                <Link to="/resources/submit">
                  <button
                    className="btn-brand inline-flex items-center gap-2 rounded-control px-4 py-2 text-label font-bold uppercase tracking-wider"
                    aria-label={t`Submit a resource`}
                  >
                    <Plus size={16} />
                    <span className="hidden sm:inline"><Trans>Submit</Trans></span>
                  </button>
                </Link>
              ) : undefined
            }
          />
        </div>
      </div>

      {/* === Resources List === */}
      <div id="resources" data-spy="Resources" className="scroll-mt-24 bg-ktip-sand-50 pb-12">
        <div className="max-w-page-narrow mx-auto px-4">
          {loading || !resources ? (
            <SkeletonGrid count={6} className={cn(gridClass, 'gap-4 auto-rows-fr')} />
          ) : resources.length ? (
            categoryGroups.length > 1 ? (
              <div className="space-y-2">
                {categoryGroups.map((group) => {
                  const Icon = resourceCategoryIcon(group.value)
                  return (
                    <CollapsibleSection
                      key={group.value}
                      title={group.label}
                      count={group.items.length}
                      icon={<Icon size={16} className="text-ktip-sand-400" />}
                      className="first:border-t-0 first:pt-0"
                    >
                      <div className={cn(gridClass, 'gap-4 auto-rows-fr')}>
                        {group.items.map((resource) => (
                          <ResourceCard key={resource.id} resource={resource} />
                        ))}
                      </div>
                    </CollapsibleSection>
                  )
                })}
              </div>
            ) : (
              <div className={cn(gridClass, 'gap-4 auto-rows-fr stagger-children')}>
                {resources.map((resource) => (
                  <ResourceCard key={resource.id} resource={resource} />
                ))}
              </div>
            )
          ) : (
            <div className="text-center py-16">
              <div className="w-16 h-16 bg-ktip-sand-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <BookOpen size={32} className="text-gray-400" />
              </div>
              <h3 className="text-2xl font-display font-bold text-ktip-sand-900 mb-2">
                <Trans>No resources found</Trans>
              </h3>
              <p className="text-gray-500 mb-6">
                {hasActiveFilters
                  ? t`Try adjusting your filters to find more resources.`
                  : t`Resources will appear here once they are published.`}
              </p>
              {hasActiveFilters ? (
                <button
                  onClick={clearFilters}
                  className="px-5 py-2.5 btn-brand text-sm rounded-lg"
                >
                  <Trans>Clear Filters</Trans>
                </button>
              ) : (
                // An empty library with no filters on is the one moment the
                // invitation to contribute is most useful — same placement
                // ProjectsPage uses.
                canSubmit && (
                  <Link to="/resources/submit">
                    <button className="btn-brand inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm">
                      <Plus size={16} />
                      <Trans>Submit a Resource</Trans>
                    </button>
                  </Link>
                )
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function IntegrationsTab() {
  const { t, i18n } = useLingui()
  // Global search links here with ?search=<name> — there is no integration
  // detail route, so the pre-filtered list stands in for one.
  const [searchParams] = useSearchParams()
  const initialSearch = searchParams.get('search') || ''

  const [category, setCategory] = useState('')
  const [searchQuery, setSearchQuery] = useState(initialSearch)
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch)
  const [tagFilter, setTagFilter] = useState<string[]>([])
  const debouncedSetSearch = useMemo(() => debounce((val: string) => setDebouncedSearch(val), 300), [])

  const { tags: tagOptions } = useTagVocabulary('integrations')
  const { columns, setColumns, gridClass } = useGridColumns('integrations:columns')

  const { integrations, loading } = useIntegrations({
    category,
    search: debouncedSearch,
    tags: tagFilter,
  })

  const categoryGroups = useMemo(
    () =>
      integrations && !category
        ? groupByCategory<Integration>(
            integrations,
            (integration) => integration.category,
            INTEGRATION_CATEGORY_LABELS,
            t`Other`
          )
        : [],
    [integrations, category, t]
  )

  return (
    <div id="integrations" data-spy="Integrations" className="scroll-mt-24 bg-ktip-sand-50 pb-12">
      <div className="max-w-page-narrow mx-auto px-4 py-8">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-8">
          <Select
            value={category}
            onChange={setCategory}
            options={INTEGRATION_CATEGORY_OPTIONS.map((o) => ({ ...o, label: resolveCopy(i18n, o.label) }))}
            ariaLabel={t`Filter by category`}
          />

          <TagFilterSelect options={tagOptions} selected={tagFilter} onChange={setTagFilter} />

          {!loading && integrations && (
            <p className="text-sm text-gray-500">
              <Plural value={integrations.length} one="Found # integration" other="Found # integrations" />
              {categoryGroups.length > 1 && (
                <>
                  {' '}
                  <Plural value={categoryGroups.length} one="in # category" other="in # categories" />
                </>
              )}
            </p>
          )}

          <div className="ml-auto flex items-center gap-2">
            <CollapsibleSearch
              value={searchQuery}
              onChange={(val) => { setSearchQuery(val); debouncedSetSearch(val) }}
              placeholder={t`Search integrations...`}
              ariaLabel={t`Search integrations`}
            />
            <ColumnToggle value={columns} onChange={setColumns} />
          </div>
        </div>

        {loading ? (
          <SkeletonGrid count={6} className={cn(gridClass, 'gap-4 auto-rows-fr')} />
        ) : integrations && integrations.length > 0 ? (
          categoryGroups.length > 1 ? (
            <div className="space-y-2">
              {categoryGroups.map((group) => {
                const Icon = integrationCategoryIcon(group.value)
                return (
                  <CollapsibleSection
                    key={group.value}
                    title={group.label}
                    count={group.items.length}
                    icon={<Icon size={16} className="text-ktip-sand-400" />}
                    className="first:border-t-0 first:pt-0"
                  >
                    <div className={cn(gridClass, 'gap-4 auto-rows-fr')}>
                      {group.items.map((integration) => (
                        <IntegrationCard key={integration.id} integration={integration} />
                      ))}
                    </div>
                  </CollapsibleSection>
                )
              })}
            </div>
          ) : (
            <div className={cn(gridClass, 'gap-4 auto-rows-fr stagger-children')}>
              {integrations.map((integration) => (
                <IntegrationCard key={integration.id} integration={integration} />
              ))}
            </div>
          )
        ) : (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-ktip-sand-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Puzzle size={32} className="text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-ktip-sand-900 mb-1"><Trans>No integrations found</Trans></h3>
            <p className="text-gray-500 text-sm">
              {searchQuery || category || tagFilter.length
                ? t`Try adjusting your search, category or tag filters.`
                : t`The directory is being curated — check back soon.`}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function CoursesTab() {
  const { t } = useLingui()
  const [subjectArea, setSubjectArea] = useState('')
  const [gradeLevel, setGradeLevel] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const debouncedSetSearch = useMemo(() => debounce((val: string) => setDebouncedSearch(val), 300), [])

  const { courses, allCourses, loading, error, refetch } = useExternalCourses({
    subjectArea,
    gradeLevel,
    search: debouncedSearch,
  })
  const { enrollmentsByCourseId, refetch: refetchEnrollments } = useMyKtipEnrollments()

  // Subject/grade values are free text set by Virtual Campus course admins,
  // not a closed KTIP-owned enum — so options come from the live catalog
  // rather than a constants.ts label map. Built from the unfiltered list so
  // picking one filter doesn't hide the options for the other.
  const subjectAreaOptions = useMemo(() => uniqueValues(allCourses ?? [], (c) => c.subject_area), [allCourses])
  const gradeLevelOptions = useMemo(() => uniqueValues(allCourses ?? [], (c) => c.grade_level), [allCourses])

  return (
    <div className="bg-ktip-sand-50 pb-12">
      <div className="max-w-page-narrow mx-auto px-4 py-8">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-8">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder={t`Search courses...`}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                debouncedSetSearch(e.target.value)
              }}
              className="w-full pl-9 pr-3 py-2.5 border border-gray-300 bg-ktip-cream rounded-lg text-sm focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors"
            />
          </div>
          <select
            value={subjectArea}
            onChange={(e) => setSubjectArea(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-ktip-cream focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500"
          >
            <option value=""><Trans>All Subjects</Trans></option>
            {subjectAreaOptions.map((value) => (
              <option value={value} key={value}>{value}</option>
            ))}
          </select>
          <select
            value={gradeLevel}
            onChange={(e) => setGradeLevel(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-ktip-cream focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500"
          >
            <option value=""><Trans>All Grade Levels</Trans></option>
            {gradeLevelOptions.map((value) => (
              <option value={value} key={value}>{value}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <SkeletonGrid count={6} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5" />
        ) : error ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <GraduationCap size={32} className="text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-ktip-sand-900 mb-1">
              <Trans>Course catalog is temporarily unavailable</Trans>
            </h3>
            <p className="text-gray-500 text-sm mb-4"><Trans>Please try again shortly.</Trans></p>
            <button
              onClick={() => refetch()}
              className="px-5 py-2.5 bg-ktip-ocean-600 text-white text-sm rounded-lg hover:bg-ktip-ocean-700 transition-colors"
            >
              <Trans>Retry</Trans>
            </button>
          </div>
        ) : courses && courses.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 stagger-children">
            {courses.map((course) => (
              <CourseCard
                key={course.course_id}
                course={course}
                enrollment={enrollmentsByCourseId.get(course.course_id)}
                onEnrolled={() => {
                  void refetchEnrollments()
                }}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <GraduationCap size={32} className="text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-ktip-sand-900 mb-1"><Trans>No courses found</Trans></h3>
            <p className="text-gray-500 text-sm">
              {searchQuery || subjectArea || gradeLevel
                ? t`Try adjusting your search, subject or grade level filters.`
                : t`The catalog is being curated — check back soon.`}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
