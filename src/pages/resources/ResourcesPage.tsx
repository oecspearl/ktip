import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { ResourceCard } from '../../components/resources/ResourceCard'
import { IntegrationCard } from '../../components/integrations/IntegrationCard'
import { useResources } from '../../hooks/useResources'
import { useIntegrations } from '../../hooks/useIntegrations'
import { useTagVocabulary } from '../../hooks/useTagVocabulary'
import { TagFilterSelect } from '../../components/ui/TagFilterSelect'
import { SortSelect } from '../../components/ui/SortSelect'
import { Select } from '../../components/ui/Select'
import { ColumnToggle } from '../../components/ui/ColumnToggle'
import { CollapsibleSearch } from '../../components/ui/CollapsibleSearch'
import { CollapsibleSection } from '../../components/ui/CollapsibleSection'
import { usePageTitle } from '../../hooks/usePageTitle'
import { useGridColumns } from '../../hooks/useGridColumns'
import { usePersonalizationActive } from '../../hooks/usePersonalization'
import { resolveSort, SORT_OPTIONS, type ContentSort } from '../../lib/personalization'
import { BookOpen, Puzzle } from 'lucide-react'
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

type Tab = 'resources' | 'integrations'

const TABS: { id: Tab; label: string; icon: typeof BookOpen }[] = [
  { id: 'resources', label: 'Resources', icon: BookOpen },
  { id: 'integrations', label: 'Integrations', icon: Puzzle },
]

const RESOURCE_TYPE_OPTIONS = [
  { value: '', label: 'All Types' },
  ...Object.entries(RESOURCE_TYPE_LABELS).map(([value, label]) => ({ value, label })),
]

const RESOURCE_CATEGORY_OPTIONS = [
  { value: '', label: 'All Categories' },
  ...Object.entries(RESOURCE_CATEGORY_LABELS).map(([value, label]) => ({ value, label })),
]

const INTEGRATION_CATEGORY_OPTIONS = [
  { value: '', label: 'All Categories' },
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
  labels: Record<string, string>
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
    return group?.length ? [{ value, label: labels[value] ?? 'Other', items: group }] : []
  })
}

export default function ResourcesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab: Tab = searchParams.get('tab') === 'integrations' ? 'integrations' : 'resources'
  usePageTitle(tab === 'integrations' ? 'Integrations' : 'Resources')

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
          <div
          role="tablist"
          data-tutorial="resources-tabs"
          aria-label="Knowledge base sections"
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
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {tab === 'resources' ? <ResourcesTab /> : <IntegrationsTab />}
    </>
  )
}

function ResourcesTab() {
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
            RESOURCE_CATEGORY_LABELS
          )
        : [],
    [resources, categoryFilter]
  )

  const hasActiveFilters = !!(searchQuery || typeFilter || categoryFilter || tagFilter.length)

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
      <div id="filters" data-spy="Filters" className="scroll-mt-24 bg-ktip-sand-50 py-8">
        <div className="max-w-[calc(50vw+32rem)] mx-auto px-4">
          <div className="flex flex-wrap items-center gap-3">
            <Select
              value={typeFilter}
              onChange={setTypeFilter}
              options={RESOURCE_TYPE_OPTIONS}
              ariaLabel="Filter by resource type"
            />

            <Select
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={RESOURCE_CATEGORY_OPTIONS}
              ariaLabel="Filter by category"
            />

            <TagFilterSelect options={tagOptions} selected={tagFilter} onChange={setTagFilter} />

            {!loading && resources && (
              <p className="text-sm text-gray-500">
                Found {resources.length} resource{resources.length !== 1 ? 's' : ''}
                {categoryGroups.length > 1 && ` in ${categoryGroups.length} categories`}
              </p>
            )}

            <div className="ml-auto flex items-center gap-2">
              <SortSelect
                value={sort}
                onChange={setSort}
                options={SORT_OPTIONS.resource.options}
                personalizationActive={personalizationActive}
              />
              <CollapsibleSearch
                value={searchQuery}
                onChange={(val) => { setSearchQuery(val); debouncedSetSearch(val) }}
                placeholder="Search resources..."
                ariaLabel="Search resources"
              />
              <ColumnToggle value={columns} onChange={setColumns} />
            </div>
          </div>

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
      <div id="resources" data-spy="Resources" className="scroll-mt-24 bg-ktip-sand-50 pb-12">
        <div className="max-w-[calc(50vw+32rem)] mx-auto px-4">
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
                  className="px-5 py-2.5 btn-brand text-sm rounded-lg"
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
            INTEGRATION_CATEGORY_LABELS
          )
        : [],
    [integrations, category]
  )

  return (
    <div id="integrations" data-spy="Integrations" className="scroll-mt-24 bg-ktip-sand-50 pb-12">
      <div className="max-w-[calc(50vw+32rem)] mx-auto px-4 py-8">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-8">
          <Select
            value={category}
            onChange={setCategory}
            options={INTEGRATION_CATEGORY_OPTIONS}
            ariaLabel="Filter by category"
          />

          <TagFilterSelect options={tagOptions} selected={tagFilter} onChange={setTagFilter} />

          {!loading && integrations && (
            <p className="text-sm text-gray-500">
              Found {integrations.length} integration{integrations.length !== 1 ? 's' : ''}
              {categoryGroups.length > 1 && ` in ${categoryGroups.length} categories`}
            </p>
          )}

          <div className="ml-auto flex items-center gap-2">
            <CollapsibleSearch
              value={searchQuery}
              onChange={(val) => { setSearchQuery(val); debouncedSetSearch(val) }}
              placeholder="Search integrations..."
              ariaLabel="Search integrations"
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
