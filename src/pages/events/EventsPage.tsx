import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  format,
  max as maxDate,
  startOfDay,
  startOfMonth,
  subDays,
} from 'date-fns'
import { Button } from '../../components/ui/Button'
import { EventCard } from '../../components/events/EventCard'
import { EventCalendar } from '../../components/events/EventCalendar'
import { EventDayPanel } from '../../components/events/EventDayPanel'
import { useCalendarMonth } from '../../components/calendar/useCalendarMonth'
import { useEvents } from '../../hooks/useEvents'
import { useTagVocabulary } from '../../hooks/useTagVocabulary'
import { TagFilterChips } from '../../components/ui/TagFilterChips'
import { Plus, Search, CalendarX, CalendarDays, LayoutGrid } from 'lucide-react'
import { PageHero } from '../../components/layout/PageHero'
import { SkeletonGrid } from '../../components/ui/SkeletonCard'
import { usePageTitle } from '../../hooks/usePageTitle'
import { cn, debounce } from '../../lib/utils'
import { groupByDay } from '../../lib/calendar'
import { EVENT_TYPE_LABELS } from '../../lib/constants'
import type { Event } from '../../types'

type EventsView = 'calendar' | 'grid'

const VIEW_STORAGE_KEY = 'events:view'

export default function EventsPage() {
  usePageTitle('Events')
  const [selectedType, setSelectedType] = useState('')
  const [showUpcoming, setShowUpcoming] = useState(true)
  const [climateFilter, setClimateFilter] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const debouncedSetSearch = useMemo(() => debounce((val: string) => setDebouncedSearch(val), 300), [])
  const [tagFilter, setTagFilter] = useState<string[]>([])

  const { tags: tagOptions } = useTagVocabulary('events')

  const [view, setView] = useState<EventsView>(() =>
    localStorage.getItem(VIEW_STORAGE_KEY) === 'grid' ? 'grid' : 'calendar'
  )
  const {
    monthDate,
    selectedDate,
    direction: monthDir,
    gridStart,
    gridEnd,
    setSelectedDate,
    goPrevMonth,
    goNextMonth,
    goToday,
  } = useCalendarMonth()
  const autoSelectedRef = useRef(false)

  // Collapsible search — expands on click, collapses on outside click / Escape when empty
  const [searchOpen, setSearchOpen] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useLayoutEffect(() => {
    if (!searchOpen) return
    searchInputRef.current?.focus()
  }, [searchOpen])

  useEffect(() => {
    if (!searchOpen) return
    const handleClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        if (!searchInputRef.current?.value) setSearchOpen(false)
      }
    }
    const handleKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setSearchOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [searchOpen])

  const { events, loading: eventsLoading } = useEvents(
    view === 'calendar'
      ? {
          type: selectedType,
          search: debouncedSearch,
          climateAction: climateFilter,
          tags: tagFilter,
          upcoming: false,
          // 31-day back-buffer catches multi-day events starting before the grid
          dateRange: {
            start: subDays(gridStart, 31).toISOString(),
            end: gridEnd.toISOString(),
          },
        }
      : {
          type: selectedType,
          upcoming: showUpcoming,
          search: debouncedSearch,
          climateAction: climateFilter,
          tags: tagFilter,
        }
  )

  // Group events by visible day, expanding multi-day spans
  const eventsByDay = useMemo(
    () =>
      view === 'calendar'
        ? groupByDay(events, gridStart, gridEnd, (event) => ({
            start: event.start_date,
            end: event.end_date,
          }))
        : new Map<string, Event[]>(),
    [events, view, gridStart, gridEnd]
  )

  // Auto-select nearest upcoming day with an event (once, on first load)
  useEffect(() => {
    if (view !== 'calendar' || !events || autoSelectedRef.current) return
    autoSelectedRef.current = true
    const today = startOfDay(new Date())
    const scanStart = maxDate([startOfMonth(monthDate), today])
    const scanEnd = endOfMonth(monthDate)
    if (scanStart > scanEnd) return
    for (const day of eachDayOfInterval({ start: scanStart, end: scanEnd })) {
      if (eventsByDay.has(format(day, 'yyyy-MM-dd'))) {
        setSelectedDate(day)
        return
      }
    }
  }, [view, events, eventsByDay, monthDate])

  const changeView = (next: EventsView) => {
    setView(next)
    localStorage.setItem(VIEW_STORAGE_KEY, next)
  }

  const jumpToNextEvent = () => {
    const from = addDays(selectedDate, 1)
    if (from <= gridEnd) {
      for (const day of eachDayOfInterval({ start: from, end: gridEnd })) {
        if (eventsByDay.has(format(day, 'yyyy-MM-dd'))) {
          setSelectedDate(day)
          return
        }
      }
    }
    goNextMonth()
  }

  const clearFilters = () => {
    setSelectedType('')
    setShowUpcoming(true)
    setSearchQuery('')
    setDebouncedSearch('')
    setClimateFilter(false)
    setSearchOpen(false)
    setTagFilter([])
  }

  const hasActiveFilters = Boolean(
    selectedType ||
      (view === 'grid' && !showUpcoming) ||
      searchQuery ||
      climateFilter ||
      tagFilter.length
  )

  const selectedDayEvents = eventsByDay.get(format(selectedDate, 'yyyy-MM-dd')) ?? []

  return (
    <>
      <PageHero
        eyebrow="Event Archives"
        title="Events"
        imageSeed="events"
        breadcrumb={[{ label: 'Home', href: '/' }, { label: 'Events List' }]}
        actions={
          <Link to="/events/new">
            <Button icon={<Plus size={16} />} size="sm" className="bg-ktip-ocean-600 text-white hover:bg-ktip-ocean-700 text-sm">
              Create Event
            </Button>
          </Link>
        }
      />

      {/* === Filter Section === */}
      <div className="bg-ktip-sand-50 py-8">
        <div className="max-w-[calc(50vw+32rem)] mx-auto px-4">
          {/* Filters + collapsible search + view toggle */}
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="px-3 py-2 border border-gray-300 bg-ktip-cream rounded-lg text-sm focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors"
            >
              <option value="">All Event Types</option>
              {Object.entries(EVENT_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>

            {view === 'grid' && (
              <label className="flex items-center gap-2 cursor-pointer text-sm text-ktip-sand-700">
                <input
                  type="checkbox"
                  checked={showUpcoming}
                  onChange={(e) => setShowUpcoming(e.target.checked)}
                  className="w-4 h-4 text-ktip-ocean-600 border-gray-300 rounded focus:ring-ktip-ocean-500"
                />
                Upcoming Only
              </label>
            )}

            <label className="flex items-center gap-2 cursor-pointer text-sm text-ktip-sand-700">
              <input
                type="checkbox"
                checked={climateFilter}
                onChange={(e) => setClimateFilter(e.target.checked)}
                className="w-4 h-4 text-ktip-tropical-700 border-gray-300 rounded focus:ring-ktip-tropical-500"
              />
              Climate Action
            </label>

            <div className="ml-auto flex items-center gap-2">
              {/* Collapsible search — icon expands to input, like the navbar */}
              <div ref={searchRef} className="flex items-center justify-end">
                <div
                  className={cn(
                    'relative overflow-hidden transition-[width] duration-300 ease-out',
                    searchOpen ? 'w-48 sm:w-64' : 'w-10'
                  )}
                >
                  {searchOpen ? (
                    <>
                      <Search
                        size={16}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                      />
                      <input
                        ref={searchInputRef}
                        type="text"
                        placeholder="Search events..."
                        aria-label="Search events"
                        value={searchQuery}
                        onChange={(e) => { setSearchQuery(e.target.value); debouncedSetSearch(e.target.value) }}
                        className="w-full pl-9 pr-3 py-2 border border-gray-300 bg-ktip-cream rounded-lg focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors text-sm"
                      />
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSearchOpen(true)}
                      aria-label="Open search"
                      className={cn(
                        'p-2 rounded-lg transition-all duration-200 hover:bg-ktip-sand-100 hover:scale-110',
                        searchQuery ? 'text-ktip-ocean-600' : 'text-ktip-sand-700'
                      )}
                    >
                      <Search size={18} />
                    </button>
                  )}
                </div>
              </div>

              <div className="inline-flex rounded-lg border border-gray-300 bg-ktip-cream p-0.5">
              <button
                type="button"
                onClick={() => changeView('calendar')}
                aria-pressed={view === 'calendar'}
                aria-label="Calendar view"
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-colors',
                  view === 'calendar'
                    ? 'bg-ktip-ocean-600 text-white shadow-soft'
                    : 'text-ktip-sand-700 hover:bg-ktip-sand-100'
                )}
              >
                <CalendarDays size={16} />
                <span className="hidden sm:inline">Calendar</span>
              </button>
              <button
                type="button"
                onClick={() => changeView('grid')}
                aria-pressed={view === 'grid'}
                aria-label="Grid view"
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-colors',
                  view === 'grid'
                    ? 'bg-ktip-ocean-600 text-white shadow-soft'
                    : 'text-ktip-sand-700 hover:bg-ktip-sand-100'
                )}
              >
                <LayoutGrid size={16} />
                <span className="hidden sm:inline">Grid</span>
              </button>
              </div>
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

      {/* === Events === */}
      <div className="bg-ktip-sand-50 pb-12">
        <div className="max-w-[calc(50vw+32rem)] mx-auto px-4">
          {view === 'calendar' ? (
            <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-4 lg:gap-6 items-start">
              <EventCalendar
                monthDate={monthDate}
                selectedDate={selectedDate}
                eventsByDay={eventsByDay}
                direction={monthDir}
                onSelectDate={setSelectedDate}
                onPrevMonth={goPrevMonth}
                onNextMonth={goNextMonth}
                onToday={goToday}
              />
              <EventDayPanel
                date={selectedDate}
                events={selectedDayEvents}
                loading={eventsLoading}
                onJumpToNext={jumpToNextEvent}
              />
            </div>
          ) : eventsLoading || !events ? (
            <SkeletonGrid count={6} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-fr" />
          ) : events.length > 0 ? (
            <div>
              <p className="text-sm text-gray-500 mb-6">
                Found {events.length} event{events.length !== 1 ? 's' : ''}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-fr stagger-children">
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
