import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { ResourceCard } from '../../components/resources/ResourceCard'
import { IntegrationCard } from '../../components/integrations/IntegrationCard'
import { CourseCard } from '../../components/courses/CourseCard'
import { useResources } from '../../hooks/useResources'
import { useIntegrations } from '../../hooks/useIntegrations'
import { useExternalCourses } from '../../hooks/useExternalCourses'
import { useTagVocabulary } from '../../hooks/useTagVocabulary'
import { TagFilterChips } from '../../components/ui/TagFilterChips'
import { SortSelect } from '../../components/ui/SortSelect'
import { usePageTitle } from '../../hooks/usePageTitle'
import { usePersonalizationActive } from '../../hooks/usePersonalization'
import { resolveSort, SORT_OPTIONS, type ContentSort } from '../../lib/personalization'
import { Search, BookOpen, Puzzle, GraduationCap } from 'lucide-react'
import { PageHero } from '../../components/layout/PageHero'
import { SkeletonGrid } from '../../components/ui/SkeletonCard'
import { cn, debounce } from '../../lib/utils'
import {
  RESOURCE_TYPE_LABELS,
  RESOURCE_CATEGORY_LABELS,
  INTEGRATION_CATEGORY_LABELS,
} from '../../lib/constants'

type Tab = 'resources' | 'integrations' | 'courses'

const TABS: { id: Tab; label: string; icon: typeof BookOpen }[] = [
  { id: 'resources', label: 'Resources', icon: BookOpen },
  { id: 'integrations', label: 'Integrations', icon: Puzzle },
  { id: 'courses', label: 'Courses', icon: GraduationCap },
]

/** Unique, sorted, non-empty values — used to build filter options from live data. */
function uniqueValues<T>(items: T[], pick: (item: T) => string | null | undefined): string[] {
  return [...new Set(items.map(pick).filter((v): v is string => !!v))].sort()
}

export default function ResourcesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const tab: Tab = tabParam === 'integrations' ? 'integrations' : tabParam === 'courses' ? 'courses' : 'resources'
  usePageTitle(tab === 'integrations' ? 'Integrations' : tab === 'courses' ? 'Courses' : 'Resources')

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
        eyebrow="Knowledge Base"
        title="Resources & Integrations"
        imageSeed="resources"
        breadcrumb={[{ label: 'Home', href: '/' }, { label: 'Resources' }]}
      />

      {/* === Tabs === */}
      <div className="bg-ktip-sand-50 pt-6">
        <div className="max-w-[calc(50vw+32rem)] mx-auto px-4">
          <div role="tablist" aria-label="Knowledge base sections" className="flex gap-1 border-b border-ktip-sand-200">
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
                {label}
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
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [climateFilter, setClimateFilter] = useState(false)
  const [tagFilter, setTagFilter] = useState<string[]>([])
  const [searchParams, setSearchParams] = useSearchParams()

  const { tags: tagOptions } = useTagVocabulary('resources')

  // Sort lives in the URL so it is shareable and survives back/forward.
  const { active: personalizationActive } = usePersonalizationActive()
  const sort = resolveSort(searchParams.get('sort'), personalizationActive, 'newest')

  const setSort = (next: ContentSort) => {
    const params = new URLSearchParams(searchParams)
    params.set('sort', next)
    setSearchParams(params, { replace: true })
  }

  const { resources, loading } = useResources({
    search: searchQuery,
    type: typeFilter,
    category: categoryFilter,
    climateAction: climateFilter,
    tags: tagFilter,
    sort,
  })

  const hasActiveFilters = !!(
    searchQuery ||
    typeFilter ||
    categoryFilter ||
    climateFilter ||
    tagFilter.length
  )

  const clearFilters = () => {
    setSearchQuery('')
    setTypeFilter('')
    setCategoryFilter('')
    setClimateFilter(false)
    setTagFilter([])
  }

  return (
    <>
      {/* === Filter Section === */}
      <div className="bg-ktip-sand-50 py-8">
        <div className="max-w-[calc(50vw+32rem)] mx-auto px-4">
          {/* Row 1: Search */}
          <div className="flex gap-2 mb-3">
            <div className="relative flex-1">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search resources..."
                aria-label="Search resources"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.currentTarget.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 bg-ktip-cream rounded-lg focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors text-sm"
              />
            </div>
            <button className="px-5 py-2.5 bg-ktip-ocean-600 text-white text-sm font-bold uppercase tracking-wider rounded-lg hover:bg-ktip-ocean-700 transition-colors shrink-0">
              Search
            </button>
          </div>

          {/* Row 2: Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.currentTarget.value)}
              className="px-3 py-2 border border-gray-300 bg-ktip-cream rounded-lg text-sm focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors"
            >
              <option value="">All Types</option>
              {Object.entries(RESOURCE_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.currentTarget.value)}
              className="px-3 py-2 border border-gray-300 bg-ktip-cream rounded-lg text-sm focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors"
            >
              <option value="">All Categories</option>
              {Object.entries(RESOURCE_CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>

            <label className="flex items-center gap-2 cursor-pointer text-sm text-ktip-sand-700">
              <input
                type="checkbox"
                checked={climateFilter}
                onChange={(e) => setClimateFilter(e.currentTarget.checked)}
                className="w-4 h-4 text-ktip-tropical-700 border-gray-300 rounded focus:ring-ktip-tropical-500"
              />
              Climate Action
            </label>

            <div className="ml-auto">
              <SortSelect
                value={sort}
                onChange={setSort}
                options={SORT_OPTIONS.resource.options}
                personalizationActive={personalizationActive}
              />
            </div>
          </div>

          <TagFilterChips options={tagOptions} selected={tagFilter} onChange={setTagFilter} />

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="mt-2 text-sm text-ktip-ocean-600 hover:text-ktip-ocean-700 hover:underline transition-colors"
            >
              Clear all filters
            </button>
          )}
        </div>
      </div>

      {/* === Resources List === */}
      <div className="bg-ktip-sand-50 pb-12">
        <div className="max-w-[calc(50vw+32rem)] mx-auto px-4">
          {loading || !resources ? (
            <SkeletonGrid count={6} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-fr" />
          ) : resources.length ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-fr stagger-children">
              {resources.map((resource) => (
                <ResourceCard key={resource.id} resource={resource} />
              ))}
            </div>
          ) : (
            <div className="text-center py-16">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <BookOpen size={32} className="text-gray-400" />
              </div>
              <h3 className="text-2xl font-display font-bold text-ktip-sand-900 mb-2">
                No resources found
              </h3>
              <p className="text-gray-500 mb-6">
                {hasActiveFilters
                  ? 'Try adjusting your filters to find more resources.'
                  : 'Resources will appear here once they are published.'}
              </p>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="px-5 py-2.5 bg-ktip-ocean-600 text-white text-sm rounded-lg hover:bg-ktip-ocean-700 transition-colors"
                >
                  Clear Filters
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function IntegrationsTab() {
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

  const { integrations, loading } = useIntegrations({
    category,
    search: debouncedSearch,
    tags: tagFilter,
  })

  return (
    <div className="bg-ktip-sand-50 pb-12">
      <div className="max-w-[calc(50vw+32rem)] mx-auto px-4 py-8">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-8">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search integrations..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                debouncedSetSearch(e.target.value)
              }}
              className="w-full pl-9 pr-3 py-2.5 border border-gray-300 bg-ktip-cream rounded-lg text-sm focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors"
            />
          </div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-ktip-cream focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500"
          >
            <option value="">All Categories</option>
            {Object.entries(INTEGRATION_CATEGORY_LABELS).map(([value, label]) => (
              <option value={value} key={value}>{label}</option>
            ))}
          </select>
        </div>

        <div className="mb-8 -mt-4">
          <TagFilterChips options={tagOptions} selected={tagFilter} onChange={setTagFilter} />
        </div>

        {loading ? (
          <SkeletonGrid count={6} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5" />
        ) : integrations && integrations.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 stagger-children">
            {integrations.map((integration) => (
              <IntegrationCard key={integration.id} integration={integration} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Puzzle size={32} className="text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-ktip-sand-900 mb-1">No integrations found</h3>
            <p className="text-gray-500 text-sm">
              {searchQuery || category || tagFilter.length
                ? 'Try adjusting your search, category or tag filters.'
                : 'The directory is being curated — check back soon.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function CoursesTab() {
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

  // Subject/grade values are free text set by Virtual Campus course admins,
  // not a closed KTIP-owned enum — so options come from the live catalog
  // rather than a constants.ts label map. Built from the unfiltered list so
  // picking one filter doesn't hide the options for the other.
  const subjectAreaOptions = useMemo(() => uniqueValues(allCourses ?? [], (c) => c.subject_area), [allCourses])
  const gradeLevelOptions = useMemo(() => uniqueValues(allCourses ?? [], (c) => c.grade_level), [allCourses])

  return (
    <div className="bg-ktip-sand-50 pb-12">
      <div className="max-w-[calc(50vw+32rem)] mx-auto px-4 py-8">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-8">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search courses..."
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
            <option value="">All Subjects</option>
            {subjectAreaOptions.map((value) => (
              <option value={value} key={value}>{value}</option>
            ))}
          </select>
          <select
            value={gradeLevel}
            onChange={(e) => setGradeLevel(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-ktip-cream focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500"
          >
            <option value="">All Grade Levels</option>
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
              Course catalog is temporarily unavailable
            </h3>
            <p className="text-gray-500 text-sm mb-4">Please try again shortly.</p>
            <button
              onClick={() => refetch()}
              className="px-5 py-2.5 bg-ktip-ocean-600 text-white text-sm rounded-lg hover:bg-ktip-ocean-700 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : courses && courses.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 stagger-children">
            {courses.map((course) => (
              <CourseCard key={course.course_id} course={course} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <GraduationCap size={32} className="text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-ktip-sand-900 mb-1">No courses found</h3>
            <p className="text-gray-500 text-sm">
              {searchQuery || subjectArea || gradeLevel
                ? 'Try adjusting your search, subject or grade level filters.'
                : 'The catalog is being curated — check back soon.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
