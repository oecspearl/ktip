import { useState, useMemo } from 'react'
import { Link } from 'react-router'
import { Button } from '../../components/ui/Button'
import { EventCard } from '../../components/events/EventCard'
import { useEvents } from '../../hooks/useEvents'
import { Plus, Search, CalendarX, ChevronRight } from 'lucide-react'
import { SkeletonGrid } from '../../components/ui/SkeletonCard'
import { usePageTitle } from '../../hooks/usePageTitle'
import { debounce } from '../../lib/utils'

export default function EventsPage() {
  usePageTitle('Events')
  const [selectedType, setSelectedType] = useState('')
  const [showUpcoming, setShowUpcoming] = useState(true)
  const [climateFilter, setClimateFilter] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const debouncedSetSearch = useMemo(() => debounce((val: string) => setDebouncedSearch(val), 300), [])

  const { events, loading: eventsLoading } = useEvents({
    type: selectedType,
    upcoming: showUpcoming,
    search: debouncedSearch,
    climateAction: climateFilter,
  })

  const clearFilters = () => {
    setSelectedType('')
    setShowUpcoming(true)
    setSearchQuery('')
    setDebouncedSearch('')
    setClimateFilter(false)
  }

  const hasActiveFilters = Boolean(selectedType || !showUpcoming || searchQuery || climateFilter)

  return (
    <>
      {/* === Dark Hero Header Band === */}
      <div className="bg-gray-800 min-h-[180px] flex items-center">
        <div className="container mx-auto px-4 py-10">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <p className="text-gray-400 text-sm uppercase tracking-widest mb-2">Event Archives</p>
              <h1 className="text-3xl md:text-4xl font-display font-bold text-white">Events</h1>
            </div>
            <div className="flex items-center gap-4">
              <Link to="/events/new">
                <Button icon={<Plus size={16} />} size="sm" className="bg-ktip-ocean-600 text-white hover:bg-ktip-ocean-700 text-sm">
                  Create Event
                </Button>
              </Link>
              <nav className="text-sm text-gray-400 hidden md:block" aria-label="Breadcrumb">
                <Link to="/" className="hover:text-white transition-colors">Home</Link>
                <span className="mx-2"><ChevronRight size={12} className="inline" /></span>
                <span className="text-gray-300">Events List</span>
              </nav>
            </div>
          </div>
        </div>
      </div>

      {/* === Filter Section === */}
      <div className="bg-white py-8">
        <div className="max-w-5xl mx-auto px-4">
          {/* Row 1: Search */}
          <div className="flex gap-2 mb-3">
            <div className="relative flex-1">
              <Search
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                placeholder="Search events..."
                aria-label="Search events"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); debouncedSetSearch(e.target.value) }}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 bg-white rounded-lg focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors text-sm"
              />
            </div>
            <button
              className="px-5 py-2.5 bg-ktip-ocean-600 text-white text-sm font-bold uppercase tracking-wider rounded-lg hover:bg-ktip-ocean-700 transition-colors shrink-0"
            >
              Search
            </button>
          </div>

          {/* Row 2: Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="px-3 py-2 border border-gray-300 bg-white rounded-lg text-sm focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors"
            >
              <option value="">All Event Types</option>
              <option value="hackathon">💻 Hackathon</option>
              <option value="workshop">🛠️ Workshop</option>
              <option value="meetup">🤝 Meetup</option>
              <option value="conference">🎤 Conference</option>
              <option value="demo_day">🚀 Demo Day</option>
            </select>

            <label className="flex items-center gap-2 cursor-pointer text-sm text-ktip-sand-700">
              <input
                type="checkbox"
                checked={showUpcoming}
                onChange={(e) => setShowUpcoming(e.target.checked)}
                className="w-4 h-4 text-ktip-ocean-600 border-gray-300 rounded focus:ring-ktip-ocean-500"
              />
              Upcoming Only
            </label>

            <label className="flex items-center gap-2 cursor-pointer text-sm text-ktip-sand-700">
              <input
                type="checkbox"
                checked={climateFilter}
                onChange={(e) => setClimateFilter(e.target.checked)}
                className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
              />
              Climate Action
            </label>
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

      {/* === Events List === */}
      <div className="bg-white pb-12">
        <div className="max-w-5xl mx-auto px-4">
          {eventsLoading || !events ? (
            <SkeletonGrid count={6} />
          ) : events.length > 0 ? (
            <div>
              <p className="text-sm text-gray-500 mb-6">
                Found {events.length} event{events.length !== 1 ? 's' : ''}
              </p>
              <div>
                {events.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-16">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CalendarX size={32} className="text-gray-400" />
              </div>
              <h3 className="text-2xl font-display font-bold text-ktip-sand-900 mb-2">
                No events found
              </h3>
              <p className="text-gray-500 mb-6">
                {hasActiveFilters
                  ? 'Try adjusting your filters or search query'
                  : 'Be the first to create an event!'}
              </p>
              {!hasActiveFilters && (
                <Link to="/events/new">
                  <Button icon={<Plus size={20} />}>Create First Event</Button>
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
