import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Button } from '../../components/ui/Button'
import { GrantCard } from '../../components/grants/GrantCard'
import { useGrants } from '../../hooks/useGrants'
import { Search, Wallet, FileText } from 'lucide-react'
import { PageHero } from '../../components/layout/PageHero'
import { SkeletonGrid } from '../../components/ui/SkeletonCard'
import { TagFilterChips } from '../../components/ui/TagFilterChips'
import { SortSelect } from '../../components/ui/SortSelect'
import { usePageTitle } from '../../hooks/usePageTitle'
import { useTagVocabulary } from '../../hooks/useTagVocabulary'
import { usePersonalizationActive } from '../../hooks/usePersonalization'
import { resolveSort, SORT_OPTIONS, type ContentSort } from '../../lib/personalization'
import { debounce } from '../../lib/utils'

export default function GrantsPage() {
  usePageTitle('Grants')
  const [selectedType, setSelectedType] = useState<string>('')
  const [showActive, setShowActive] = useState(true)
  const [climateFilter, setClimateFilter] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const debouncedSetSearch = useMemo(() => debounce((val: string) => setDebouncedSearch(val), 300), [])

  const { tags: tagOptions } = useTagVocabulary('grants')
  const [searchParams, setSearchParams] = useSearchParams()

  // Sort lives in the URL so it is shareable and survives back/forward. The
  // fallback here is deadline order, which is what the query already does.
  const { active: personalizationActive } = usePersonalizationActive()
  const sort = resolveSort(searchParams.get('sort'), personalizationActive, 'deadline')

  const setSort = (next: ContentSort) => {
    const params = new URLSearchParams(searchParams)
    params.set('sort', next)
    setSearchParams(params, { replace: true })
  }

  const { grants, loading } = useGrants({
    type: selectedType,
    active: showActive,
    search: debouncedSearch,
    climateAction: climateFilter,
    tags: selectedTags,
    sort,
  })

  const clearFilters = () => {
    setSelectedType('')
    setShowActive(true)
    setSearchQuery('')
    setDebouncedSearch('')
    setClimateFilter(false)
    setSelectedTags([])
  }

  const hasActiveFilters = !!(
    selectedType ||
    !showActive ||
    searchQuery ||
    climateFilter ||
    selectedTags.length
  )

  const grantTypes = [
    { value: 'startup', label: 'Startup Funding' },
    { value: 'research', label: 'Research Grants' },
    { value: 'innovation', label: 'Innovation Awards' },
    { value: 'development', label: 'Development Funds' },
    { value: 'education', label: 'Education Grants' },
  ]

  return (
    <>
      <PageHero
        eyebrow="Grant Archives"
        title="Grants & Funding"
        imageSeed="grants"
        breadcrumb={[{ label: 'Home', href: '/' }, { label: 'Grants' }]}
        actions={
          <Link to="/grants/my-applications">
            <Button icon={<FileText size={16} />} size="sm" className="bg-ktip-ocean-600 text-white hover:bg-ktip-ocean-700 text-sm">
              My Applications
            </Button>
          </Link>
        }
      />

      {/* === Filter Section === */}
      <div className="bg-ktip-sand-50 py-8">
        <div className="max-w-[calc(50vw+32rem)] mx-auto px-4">
          {/* Row 1: Search */}
          <div className="flex gap-2 mb-3">
            <div className="relative flex-1">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search grants..."
                aria-label="Search grants"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.currentTarget.value); debouncedSetSearch(e.currentTarget.value) }}
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
              value={selectedType}
              onChange={(e) => setSelectedType(e.currentTarget.value)}
              className="px-3 py-2 border border-gray-300 bg-ktip-cream rounded-lg text-sm focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors"
            >
              <option value="">All Grant Types</option>
              {grantTypes.map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>

            <label className="flex items-center gap-2 cursor-pointer text-sm text-ktip-sand-700">
              <input
                type="checkbox"
                checked={showActive}
                onChange={(e) => setShowActive(e.currentTarget.checked)}
                className="w-4 h-4 text-ktip-ocean-600 border-gray-300 rounded focus:ring-ktip-ocean-500"
              />
              Active Only
            </label>

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
                options={SORT_OPTIONS.grant.options}
                personalizationActive={personalizationActive}
              />
            </div>
          </div>

          <TagFilterChips options={tagOptions} selected={selectedTags} onChange={setSelectedTags} />

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
      <div className="bg-ktip-sand-50 pb-12">
        <div className="max-w-[calc(50vw+32rem)] mx-auto px-4">
          {loading || !grants ? (
            <SkeletonGrid count={6} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-fr" />
          ) : grants.length > 0 ? (
            <div>
              <p className="text-sm text-gray-500 mb-6">
                Found {grants.length} grant{grants.length !== 1 ? 's' : ''}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-fr stagger-children">
                {grants.map((grant) => <GrantCard key={grant.id} grant={grant} />)}
              </div>
            </div>
          ) : (
            <div className="text-center py-16">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
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
