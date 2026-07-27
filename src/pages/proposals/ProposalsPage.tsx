import { createSignal, Show, For, Suspense } from 'solid-js'
import { A } from '@solidjs/router'
import { MainLayout } from '../../components/layout/MainLayout'
import { SkeletonGrid } from '../../components/ui/SkeletonCard'
import { ProposalCard } from '../../components/proposals/ProposalCard'
import { useProposals } from '../../hooks/useProposals'
import { usePageTitle } from '../../hooks/usePageTitle'
import { PROPOSAL_TYPE_LABELS } from '../../lib/constants'
import { Plus, Search, Inbox, ChevronRight } from 'lucide-solid'
import type { ProposalType, ProposalStatus } from '../../types'
import { debounce } from '../../lib/utils'

const proposalTypes = Object.entries(PROPOSAL_TYPE_LABELS).map(([value, label]) => ({ value, label }))

export default function ProposalsPage() {
  usePageTitle(() => 'Proposals')

  const [selectedType, setSelectedType] = createSignal<string>('')
  const [selectedStatus, setSelectedStatus] = createSignal<string>('')
  const [searchQuery, setSearchQuery] = createSignal('')
  const [debouncedSearch, setDebouncedSearch] = createSignal('')
  const debouncedSetSearch = debounce((val: string) => setDebouncedSearch(val), 300)

  const { proposals } = useProposals({
    get type() { return (selectedType() || undefined) as ProposalType | undefined },
    get status() { return (selectedStatus() || undefined) as ProposalStatus | undefined },
    get search() { return debouncedSearch() },
  })

  const clearFilters = () => {
    setSelectedType('')
    setSelectedStatus('')
    setSearchQuery('')
    setDebouncedSearch('')
  }

  const hasActiveFilters = () => selectedType() || selectedStatus() || searchQuery()

  return (
    <MainLayout>
      {/* === Dark Hero Header Band === */}
      <div class="bg-gray-800 min-h-[180px] flex items-center">
        <div class="container mx-auto px-4 py-10">
          <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <p class="text-gray-400 text-sm uppercase tracking-widest mb-2">Proposal Archives</p>
              <h1 class="text-3xl md:text-4xl font-display font-bold text-white">Proposals</h1>
            </div>
            <div class="flex items-center gap-4">
              <A href="/proposals/new">
                <button class="inline-flex items-center gap-2 px-4 py-2 bg-ktip-ocean-600 text-white text-sm font-bold uppercase tracking-wider rounded-lg hover:bg-ktip-ocean-700 transition-colors">
                  <Plus size={16} />
                  Create Proposal
                </button>
              </A>
              <nav class="text-sm text-gray-400 hidden md:block" aria-label="Breadcrumb">
                <A href="/" class="hover:text-white transition-colors">Home</A>
                <span class="mx-2"><ChevronRight size={12} class="inline" /></span>
                <span class="text-gray-300">Proposals</span>
              </nav>
            </div>
          </div>
        </div>
      </div>

      {/* === Filter Section === */}
      <div class="bg-white py-8">
        <div class="max-w-5xl mx-auto px-4">
          {/* Row 1: Search */}
          <div class="flex gap-2 mb-3">
            <div class="relative flex-1">
              <Search size={18} class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search proposals..."
                aria-label="Search proposals"
                value={searchQuery()}
                onInput={(e) => { setSearchQuery(e.currentTarget.value); debouncedSetSearch(e.currentTarget.value) }}
                class="w-full pl-10 pr-4 py-2.5 border border-gray-300 bg-white rounded-lg focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors text-sm"
              />
            </div>
            <button class="px-5 py-2.5 bg-ktip-ocean-600 text-white text-sm font-bold uppercase tracking-wider rounded-lg hover:bg-ktip-ocean-700 transition-colors shrink-0">
              Search
            </button>
          </div>

          {/* Row 2: Filters */}
          <div class="flex flex-wrap items-center gap-3">
            <select
              value={selectedType()}
              onChange={(e) => setSelectedType(e.currentTarget.value)}
              class="px-3 py-2 border border-gray-300 bg-white rounded-lg text-sm focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors"
            >
              <option value="">All Types</option>
              <For each={proposalTypes}>
                {(t) => <option value={t.value}>{t.label}</option>}
              </For>
            </select>

            <select
              value={selectedStatus()}
              onChange={(e) => setSelectedStatus(e.currentTarget.value)}
              class="px-3 py-2 border border-gray-300 bg-white rounded-lg text-sm focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors"
            >
              <option value="">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          <Show when={hasActiveFilters()}>
            <button
              onClick={clearFilters}
              class="mt-2 text-sm text-ktip-ocean-600 hover:text-ktip-ocean-700 hover:underline transition-colors"
            >
              Clear all filters
            </button>
          </Show>
        </div>
      </div>

      {/* === Proposals List === */}
      <div class="bg-white pb-12">
        <div class="max-w-5xl mx-auto px-4">
          <Suspense fallback={<SkeletonGrid count={6} />}>
            <Show
              when={!proposals.loading && proposals()}
              fallback={<SkeletonGrid count={6} />}
            >
              <Show
                when={proposals()!.length > 0}
                fallback={
                  <div class="text-center py-16">
                    <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Inbox size={32} class="text-gray-400" />
                    </div>
                    <h3 class="text-2xl font-display font-bold text-ktip-sand-900 mb-2">
                      {hasActiveFilters() ? 'No matching proposals' : 'No proposals yet'}
                    </h3>
                    <p class="text-gray-500 mb-6">
                      {hasActiveFilters()
                        ? 'Try adjusting your filters.'
                        : 'Create your first proposal to get started.'}
                    </p>
                    <Show when={!hasActiveFilters()}>
                      <A
                        href="/proposals/new"
                        class="inline-flex items-center gap-2 px-5 py-2.5 bg-ktip-ocean-600 text-white rounded-lg font-medium hover:bg-ktip-ocean-700 transition-colors text-sm"
                      >
                        <Plus size={16} />
                        Create Proposal
                      </A>
                    </Show>
                  </div>
                }
              >
                <div>
                  <p class="text-sm text-gray-500 mb-6">
                    {proposals()!.length} proposal{proposals()!.length !== 1 ? 's' : ''}
                  </p>
                  <div>
                    <For each={proposals()}>
                      {(proposal) => <ProposalCard proposal={proposal} />}
                    </For>
                  </div>
                </div>
              </Show>
            </Show>
          </Suspense>
        </div>
      </div>
    </MainLayout>
  )
}
