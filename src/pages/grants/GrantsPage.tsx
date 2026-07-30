import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Button } from '../../components/ui/Button'
import { GrantCard } from '../../components/grants/GrantCard'
import { useGrants } from '../../hooks/useGrants'
import { Wallet, FileText } from 'lucide-react'
import { PageHero } from '../../components/layout/PageHero'
import { SkeletonGrid } from '../../components/ui/SkeletonCard'
import { TagFilterSelect } from '../../components/ui/TagFilterSelect'
import { SortSelect } from '../../components/ui/SortSelect'
import { Select } from '../../components/ui/Select'
import { ColumnToggle } from '../../components/ui/ColumnToggle'
import { CollapsibleSearch } from '../../components/ui/CollapsibleSearch'
import { CollapsibleSection } from '../../components/ui/CollapsibleSection'
import { usePageTitle } from '../../hooks/usePageTitle'
import { useGridColumns } from '../../hooks/useGridColumns'
import { useTagVocabulary } from '../../hooks/useTagVocabulary'
import { usePersonalizationActive } from '../../hooks/usePersonalization'
import { grantTypeIcon } from '../../lib/category-icons'
import { resolveSort, SORT_OPTIONS, type ContentSort } from '../../lib/personalization'
import { cn, debounce } from '../../lib/utils'
import { isPast } from 'date-fns'
import type { Grant } from '../../types'

const GRANT_TYPES = [
  { value: 'startup', label: 'Startup Funding' },
  { value: 'research', label: 'Research Grants' },
  { value: 'innovation', label: 'Innovation Awards' },
  { value: 'development', label: 'Development Funds' },
  { value: 'education', label: 'Education Grants' },
]

const TYPE_OPTIONS = [{ value: '', label: 'All Grant Types' }, ...GRANT_TYPES]

export default function GrantsPage() {
  usePageTitle('Grants')
  const [selectedType, setSelectedType] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const debouncedSetSearch = useMemo(() => debounce((val: string) => setDebouncedSearch(val), 300), [])

  const { tags: tagOptions } = useTagVocabulary('grants')
  const [searchParams, setSearchParams] = useSearchParams()
  const { columns, setColumns, gridClass } = useGridColumns('grants:columns')

  // Sort lives in the URL so it is shareable and survives back/forward. The
  // fallback here is deadline order, which is what the query already does.
  const { active: personalizationActive } = usePersonalizationActive()
  const sort = resolveSort(searchParams.get('sort'), personalizationActive, 'deadline')

  const setSort = (next: ContentSort) => {
    const params = new URLSearchParams(searchParams)
    params.set('sort', next)
    setSearchParams(params, { replace: true })
  }

  // Closed grants are no longer filtered out at the query — they are split off
  // below and parked in a folded section at the end of the list.
  const { grants, loading } = useGrants({
    type: selectedType,
    search: debouncedSearch,
    tags: selectedTags,
    sort,
  })

  // A grant is closed once it is flagged inactive or its deadline has passed.
  const { openGrants, closedGrants } = useMemo(() => {
    const open: Grant[] = []
    const closed: Grant[] = []
    for (const grant of grants ?? []) {
      const expired = !!grant.deadline && isPast(new Date(grant.deadline))
      ;(grant.is_active === false || expired ? closed : open).push(grant)
    }
    return { openGrants: open, closedGrants: closed }
  }, [grants])

  // Type sections replace the flat grid whenever the open list spans more than
  // one type. Picking a single type collapses back to one grid.
  const typeGroups = useMemo(() => {
    if (selectedType) return []
    const buckets = new Map<string, Grant[]>()
    for (const grant of openGrants) {
      const type = grant.grant_type || 'other'
      const bucket = buckets.get(type)
      if (bucket) bucket.push(grant)
      else buckets.set(type, [grant])
    }
    // Under "For You" the sections follow the ranking; otherwise fixed
    // vocabulary order first, then anything the vocabulary does not know.
    const known = GRANT_TYPES.map((t) => t.value)
    const ordered =
      sort === 'for_you'
        ? [...buckets.keys()]
        : [...known, ...[...buckets.keys()].filter((t) => !known.includes(t))]
    return ordered.flatMap((value) => {
      const items = buckets.get(value)
      if (!items?.length) return []
      const label = GRANT_TYPES.find((t) => t.value === value)?.label ?? 'Other Funding'
      return [{ value, label, items }]
    })
  }, [openGrants, selectedType, sort])

  const clearFilters = () => {
    setSelectedType('')
    setSearchQuery('')
    setDebouncedSearch('')
    setSelectedTags([])
  }

  const hasActiveFilters = !!(selectedType || searchQuery || selectedTags.length)

  return (
    <>
      <PageHero
        eyebrow="Grant Archives"
        title="Grants & Funding"
        image="/grants/grant-startup.jpg"
        imageSeed="grants"
        breadcrumb={[{ label: 'Home', href: '/' }, { label: 'Grants' }]}
        actions={
          <Link to="/grants/my-applications">
            <Button icon={<FileText size={16} />} size="sm" className="text-sm">
              My Applications
            </Button>
          </Link>
        }
      />

      {/* === Filter Section === */}
      <div id="filters" data-spy="Filters" className="scroll-mt-24 bg-ktip-sand-50 py-8">
        <div className="max-w-[calc(50vw+32rem)] mx-auto px-4">
          <div className="flex flex-wrap items-center gap-3">
            <Select
              value={selectedType}
              onChange={setSelectedType}
              options={TYPE_OPTIONS}
              ariaLabel="Filter by grant type"
            />

            <TagFilterSelect
              options={tagOptions}
              selected={selectedTags}
              onChange={setSelectedTags}
            />

            {!loading && grants && (
              <p className="text-sm text-gray-500">
                Found {openGrants.length} open grant{openGrants.length !== 1 ? 's' : ''}
                {closedGrants.length > 0 && ` · ${closedGrants.length} closed`}
              </p>
            )}

            <div className="ml-auto flex items-center gap-2">
              <SortSelect
                value={sort}
                onChange={setSort}
                options={SORT_OPTIONS.grant.options}
                personalizationActive={personalizationActive}
              />
              <CollapsibleSearch
                value={searchQuery}
                onChange={(val) => { setSearchQuery(val); debouncedSetSearch(val) }}
                placeholder="Search grants..."
                ariaLabel="Search grants"
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

      {/* === Grants List === */}
      <div id="grants" data-spy="Grants" className="scroll-mt-24 bg-ktip-sand-50 pb-12">
        <div className="max-w-[calc(50vw+32rem)] mx-auto px-4">
          {loading || !grants ? (
            <SkeletonGrid count={6} className={cn(gridClass, 'gap-4 auto-rows-fr')} />
          ) : grants.length > 0 ? (
            <div>
              {openGrants.length === 0 ? (
                <p className="text-sm text-gray-500 mb-8">
                  No open grants match these filters — the closed ones are below.
                </p>
              ) : typeGroups.length > 1 ? (
                <div className="space-y-2">
                  {typeGroups.map((group) => {
                    const Icon = grantTypeIcon(group.value)
                    return (
                      <CollapsibleSection
                        key={group.value}
                        title={group.label}
                        count={group.items.length}
                        icon={<Icon size={16} className="text-ktip-sand-400" />}
                        className="first:border-t-0 first:pt-0"
                      >
                        <div className={cn(gridClass, 'gap-4 auto-rows-fr')}>
                          {group.items.map((grant) => <GrantCard key={grant.id} grant={grant} />)}
                        </div>
                      </CollapsibleSection>
                    )
                  })}
                </div>
              ) : (
                <div className={cn(gridClass, 'gap-4 auto-rows-fr stagger-children')}>
                  {openGrants.map((grant) => <GrantCard key={grant.id} grant={grant} />)}
                </div>
              )}

              {closedGrants.length > 0 && (
                <CollapsibleSection
                  title="Closed grants"
                  count={closedGrants.length}
                  subtitle="Expired or no longer accepting applications"
                  defaultOpen={false}
                  className="mt-10"
                >
                  <div className={cn(gridClass, 'gap-4 auto-rows-fr opacity-75')}>
                    {closedGrants.map((grant) => <GrantCard key={grant.id} grant={grant} />)}
                  </div>
                </CollapsibleSection>
              )}
            </div>
          ) : (
            <div className="text-center py-16">
              <div className="w-16 h-16 bg-ktip-sand-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Wallet size={32} className="text-gray-400" />
              </div>
              <h3 className="text-2xl font-display font-bold text-ktip-sand-900 mb-2">
                No grants found
              </h3>
              <p className="text-gray-500 mb-6">
                {hasActiveFilters
                  ? 'Try adjusting your filters or search query'
                  : 'No grants are currently available'}
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
