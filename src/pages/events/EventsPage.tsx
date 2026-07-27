import { createSignal, Show, For, Suspense } from 'solid-js'
import { A } from '@solidjs/router'
import { MainLayout } from '../../components/layout/MainLayout'
import { Button } from '../../components/ui/Button'
import { EventCard } from '../../components/events/EventCard'
import { useEvents } from '../../hooks/useEvents'
import { Plus, Search, CalendarX, ChevronRight } from 'lucide-solid'
import { SkeletonGrid } from '../../components/ui/SkeletonCard'
import { usePageTitle } from '../../hooks/usePageTitle'
import { debounce } from '../../lib/utils'

export default function EventsPage() {
  usePageTitle(() => 'Events')
  const [selectedType, setSelectedType] = createSignal<string>('')
  const [showUpcoming, setShowUpcoming] = createSignal(true)
  const [climateFilter, setClimateFilter] = createSignal(false)
  const [searchQuery, setSearchQuery] = createSignal('')
  const [debouncedSearch, setDebouncedSearch] = createSignal('')
  const debouncedSetSearch = debounce((val: string) => setDebouncedSearch(val), 300)

  const { events } = useEvents({
    get type() {
      return selectedType()
    },
    get upcoming() {
      return showUpcoming()
    },
    get search() {
      return debouncedSearch()
    },
    get climateAction() {
      return climateFilter()
    },
  })

  const clearFilters = () => {
    setSelectedType('')
    setShowUpcoming(true)
    setSearchQuery('')
    setDebouncedSearch('')
    setClimateFilter(false)
  }

  const hasActiveFilters = () => selectedType() || !showUpcoming() || searchQuery() || climateFilter()

  return (
    <MainLayout>
      {/* === Dark Hero Header Band === */}
      <div class="bg-gray-800 min-h-[180px] flex items-center">
        <div class="container mx-auto px-4 py-10">
          <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <p class="text-gray-400 text-sm uppercase tracking-widest mb-2">Event Archives</p>
              <h1 class="text-3xl md:text-4xl font-display font-bold text-white">Events</h1>
            </div>
            <div class="flex items-center gap-4">
              <A href="/events/new">
                <Button icon={<Plus size={16} />} size="sm" class="bg-ktip-ocean-600 text-white hover:bg-ktip-ocean-700 text-sm">
                  Create Event
                </Button>
              </A>
              <nav class="text-sm text-gray-400 hidden md:block" aria-label="Breadcrumb">
                <A href="/" class="hover:text-white transition-colors">Home</A>
                <span class="mx-2"><ChevronRight size={12} class="inline" /></span>
                <span class="text-gray-300">Events List</span>
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
              <Search
                size={18}
                class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                placeholder="Search events..."
                aria-label="Search events"
                value={searchQuery()}
                onInput={(e) => { setSearchQuery(e.currentTarget.value); debouncedSetSearch(e.currentTarget.value) }}
                class="w-full pl-10 pr-4 py-2.5 border border-gray-300 bg-white rounded-lg focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors text-sm"
              />
            </div>
            <button
              class="px-5 py-2.5 bg-ktip-ocean-600 text-white text-sm font-bold uppercase tracking-wider rounded-lg hover:bg-ktip-ocean-700 transition-colors shrink-0"
            >
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
              <option value="">All Event Types</option>
              <option value="hackathon">💻 Hackathon</option>
              <option value="workshop">🛠️ Workshop</option>
              <option value="meetup">🤝 Meetup</option>
              <option value="conference">🎤 Conference</option>
              <option value="demo_day">🚀 Demo Day</option>
            </select>

            <label class="flex items-center gap-2 cursor-pointer text-sm text-ktip-sand-700">
              <input
                type="checkbox"
                checked={showUpcoming()}
                onChange={(e) => setShowUpcoming(e.currentTarget.checked)}
                class="w-4 h-4 text-ktip-ocean-600 border-gray-300 rounded focus:ring-ktip-ocean-500"
              />
              Upcoming Only
            </label>

            <label class="flex items-center gap-2 cursor-pointer text-sm text-ktip-sand-700">
              <input
                type="checkbox"
                checked={climateFilter()}
                onChange={(e) => setClimateFilter(e.currentTarget.checked)}
                class="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
              />
              Climate Action
            </label>
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

      {/* === Events List === */}
      <div class="bg-white pb-12">
        <div class="max-w-5xl mx-auto px-4">
          <Suspense fallback={<SkeletonGrid count={6} />}>
            <Show
              when={!events.loading && events()}
              fallback={<SkeletonGrid count={6} />}
            >
              <Show
                when={events()!.length > 0}
                fallback={
                  <div class="text-center py-16">
                    <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <CalendarX size={32} class="text-gray-400" />
                    </div>
                    <h3 class="text-2xl font-display font-bold text-ktip-sand-900 mb-2">
                      No events found
                    </h3>
                    <p class="text-gray-500 mb-6">
                      {hasActiveFilters()
                        ? 'Try adjusting your filters or search query'
                        : 'Be the first to create an event!'}
                    </p>
                    <Show when={!hasActiveFilters()}>
                      <A href="/events/new">
                        <Button icon={<Plus size={20} />}>Create First Event</Button>
                      </A>
                    </Show>
                  </div>
                }
              >
                <div>
                  <p class="text-sm text-gray-500 mb-6">
                    Found {events()!.length} event{events()!.length !== 1 ? 's' : ''}
                  </p>
                  <div>
                    <For each={events()}>{(event) => <EventCard event={event} />}</For>
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
