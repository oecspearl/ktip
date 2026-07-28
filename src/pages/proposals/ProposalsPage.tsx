import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { SkeletonGrid } from '../../components/ui/SkeletonCard'
import { ProposalCard } from '../../components/proposals/ProposalCard'
import { useProposals } from '../../hooks/useProposals'
import { usePageTitle } from '../../hooks/usePageTitle'
import { PROPOSAL_TYPE_LABELS } from '../../lib/constants'
import { Plus, Search, Inbox } from 'lucide-react'
import { PageHero } from '../../components/layout/PageHero'
import type { ProposalType, ProposalStatus } from '../../types'
import { debounce } from '../../lib/utils'

const proposalTypes = Object.entries(PROPOSAL_TYPE_LABELS).map(([value, label]) => ({ value, label }))

export default function ProposalsPage() {
  usePageTitle('Proposals')

  const [selectedType, setSelectedType] = useState<string>('')
  const [selectedStatus, setSelectedStatus] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const debouncedSetSearch = useMemo(() => debounce((val: string) => setDebouncedSearch(val), 300), [])

  const { proposals, loading } = useProposals({
    type: (selectedType || undefined) as ProposalType | undefined,
    status: (selectedStatus || undefined) as ProposalStatus | undefined,
    search: debouncedSearch,
  })

  const clearFilters = () => {
    setSelectedType('')
    setSelectedStatus('')
    setSearchQuery('')
    setDebouncedSearch('')
  }

  const hasActiveFilters = !!(selectedType || selectedStatus || searchQuery)

  return (
    <>
      <PageHero
        eyebrow="Proposal Archives"
        title="Proposals"
        imageSeed="proposals"
        breadcrumb={[{ label: 'Home', href: '/' }, { label: 'Proposals' }]}
        actions={
          <Link to="/proposals/new">
            <button className="inline-flex items-center gap-2 px-4 py-2 bg-ktip-ocean-600 text-white text-sm font-bold uppercase tracking-wider rounded-lg hover:bg-ktip-ocean-700 transition-colors">
              <Plus size={16} />
              Create Proposal
            </button>
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
                placeholder="Search proposals..."
                aria-label="Search proposals"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); debouncedSetSearch(e.target.value) }}
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
              onChange={(e) => setSelectedType(e.target.value)}
              className="px-3 py-2 border border-gray-300 bg-ktip-cream rounded-lg text-sm focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors"
            >
              <option value="">All Types</option>
              {proposalTypes.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>

            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="px-3 py-2 border border-gray-300 bg-ktip-cream rounded-lg text-sm focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors"
            >
              <option value="">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="completed">Completed</option>
            </select>
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

      {/* === Proposals List === */}
      <div className="bg-ktip-sand-50 pb-12">
        <div className="max-w-[calc(50vw+32rem)] mx-auto px-4">
          {loading || !proposals ? (
            <SkeletonGrid count={6} />
          ) : proposals.length > 0 ? (
            <div>
              <p className="text-sm text-gray-500 mb-6">
                {proposals.length} proposal{proposals.length !== 1 ? 's' : ''}
              </p>
              <div>
                {proposals.map((proposal) => (
                  <ProposalCard key={proposal.id} proposal={proposal} />
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-16">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Inbox size={32} className="text-gray-400" />
              </div>
              <h3 className="text-2xl font-display font-bold text-ktip-sand-900 mb-2">
                {hasActiveFilters ? 'No matching proposals' : 'No proposals yet'}
              </h3>
              <p className="text-gray-500 mb-6">
                {hasActiveFilters
                  ? 'Try adjusting your filters.'
                  : 'Create your first proposal to get started.'}
              </p>
              {!hasActiveFilters && (
                <Link
                  to="/proposals/new"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-ktip-ocean-600 text-white rounded-lg font-medium hover:bg-ktip-ocean-700 transition-colors text-sm"
                >
                  <Plus size={16} />
                  Create Proposal
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
