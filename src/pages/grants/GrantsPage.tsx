import { useMemo, useState } from 'react'
import { Disclaimer } from '../../components/legal/Disclaimer'
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
import { FilterBar } from '../../components/ui/FilterBar'
import { usePageTitle } from '../../hooks/usePageTitle'
import { useTutorialAutoStart } from '../../hooks/useTutorialAutoStart'
import { TUTORIAL_IDS } from '../../data/tutorials'
import { useGridColumns } from '../../hooks/useGridColumns'
import { useTagVocabulary } from '../../hooks/useTagVocabulary'
import { usePersonalizationActive } from '../../hooks/usePersonalization'
import { grantTypeIcon } from '../../lib/category-icons'
import { resolveSort, SORT_OPTIONS, type ContentSort } from '../../lib/personalization'
import { cn, debounce } from '../../lib/utils'
import { isPast } from 'date-fns'
import type { Grant } from '../../types'
import { Trans, Plural, useLingui } from '@lingui/react/macro'
import { msg } from '@lingui/core/macro'

const GRANT_TYPES = [
  { value: 'startup', label: msg`Startup Funding` },
  { value: 'research', label: msg`Research Grants` },
  { value: 'innovation', label: msg`Innovation Awards` },
  { value: 'development', label: msg`Development Funds` },
  { value: 'education', label: msg`Education Grants` },
]

const TYPE_OPTIONS = [{ value: '', label: msg`All Grant Types` }, ...GRANT_TYPES]
const OTHER_FUNDING = msg`Other Funding`

export default function GrantsPage() {
    const { t, i18n } = useLingui()
  usePageTitle(t`Grants`)
  const typeSelectOptions = useMemo(
    () => TYPE_OPTIONS.map((opt) => ({ value: opt.value, label: i18n._(opt.label) })),
    [i18n]
  )
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
      const label = i18n._(GRANT_TYPES.find((t) => t.value === value)?.label ?? OTHER_FUNDING)
      return [{ value, label, items }]
    })
  }, [openGrants, selectedType, sort, i18n])

  useTutorialAutoStart(TUTORIAL_IDS.GRANTS, !loading)

  const clearFilters = () => {
    setSelectedType('')
    setSearchQuery('')
    setDebouncedSearch('')
    setSelectedTags([])
  }

  // Counted, not just tested: the phone trigger hides the controls, so the
  // badge is the only thing telling you the list has been narrowed and by how
  // much. Tags count as one filter however many are picked — the trigger stands
  // for the tag control, not for its contents.
  const activeFilterCount =
    (selectedType ? 1 : 0) + (searchQuery ? 1 : 0) + (selectedTags.length ? 1 : 0)
  const hasActiveFilters = activeFilterCount > 0
  const [filterSheetOpen, setFilterSheetOpen] = useState(false)

  return (
    <>
      <PageHero
        eyebrow={t`Grant Archives`}
        title={t`Grants & Funding`}
        image="/grants/grant-startup.webp"
        imageSeed="grants"
        breadcrumb={[{ label: t`Home`, href: '/' }, { label: t`Grants` }]}
        actions={
          <Link to="/grants/my-applications" data-tutorial="grants-applications">
            <Button icon={<FileText size={16} />} size="sm" className="text-sm">
              <Trans>My Applications</Trans>
            </Button>
          </Link>
        }
      />

      {/* === Filter Section ===
          data-spy-off: the only two sections are this bar and the grid under
          it, which is not navigation. Markers stay for the tour. */}
      <div
        id="filters"
        data-spy="Filters"
        data-spy-off
        className="scroll-mt-24 bg-ktip-sand-50 py-8"
      >
        <div className="max-w-page-narrow mx-auto px-4">
          <FilterBar
            sheetTitle={t`Filter grants`}
            open={filterSheetOpen}
            onOpenChange={setFilterSheetOpen}
            activeCount={activeFilterCount}
            onClear={clearFilters}
            filters={
              <>
                <Select
                  value={selectedType}
                  onChange={setSelectedType}
                  options={typeSelectOptions}
                  ariaLabel={t`Filter by grant type`}
                />

                <TagFilterSelect
                  options={tagOptions}
                  selected={selectedTags}
                  onChange={setSelectedTags}
                />

                {/* Sort lives with the filters rather than in the tool cluster:
                    both shape which results you see and in what order, so they
                    belong to the same sheet on a phone. */}
                <SortSelect
                  value={sort}
                  onChange={setSort}
                  options={SORT_OPTIONS.grant.options}
                  personalizationActive={personalizationActive}
                />
              </>
            }
            count={
              !loading && grants ? (
                <>
                  <Plural
                    value={openGrants.length}
                    one="Found # open grant"
                    other="Found # open grants"
                  />
                  {closedGrants.length > 0 && (
                    <Trans> · {closedGrants.length} closed</Trans>
                  )}
                </>
              ) : null
            }
            actions={
              <>
                <CollapsibleSearch
                  value={searchQuery}
                  onChange={(val) => { setSearchQuery(val); debouncedSetSearch(val) }}
                  placeholder={t`Search grants...`}
                  ariaLabel={t`Search grants`}
                />
                <ColumnToggle value={columns} onChange={setColumns} />
              </>
            }
          />
        </div>
      </div>

      {/* === Grants List === */}
      <div id="grants" data-spy="Grants" className="scroll-mt-24 bg-ktip-sand-50 pb-12">
        <div className="max-w-page-narrow mx-auto px-4">
          {loading || !grants ? (
            <SkeletonGrid count={6} className={cn(gridClass, 'gap-4 auto-rows-fr')} />
          ) : grants.length > 0 ? (
            <div>
              {openGrants.length === 0 ? (
                <p className="text-sm text-gray-500 mb-8">
                  <Trans>No open grants match these filters — the closed ones are below.</Trans>
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
                  title={t`Closed grants`}
                  count={closedGrants.length}
                  subtitle={t`Expired or no longer accepting applications`}
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
                <Trans>No grants found</Trans>
              </h3>
              <p className="text-gray-500 mb-6">
                {hasActiveFilters
                  ? t`Try adjusting your filters or search query`
                  : t`No grants are currently available`}
              </p>
            </div>
          )}

          {/* Renders for signed-out visitors too — someone browsing grants
              without an account is exactly who the advance-fee warning is for. */}
          <Disclaimer variant="funding" placement="footer" />
        </div>
      </div>
    </>
  )
}
