import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import {
  addDays,
  eachDayOfInterval,
  format,
  max as maxDate,
  startOfDay,
  subDays,
} from 'date-fns'
import { Button } from '../../components/ui/Button'
import { EventCard } from '../../components/events/EventCard'
import { EventCalendar } from '../../components/events/EventCalendar'
import { eventToCalendarItem } from '../../components/events/event-calendar-item'
import { CalendarDayPanel } from '../../components/calendar/CalendarDayPanel'
import { useCalendarRange, type CalendarView } from '../../components/calendar/useCalendarRange'
import { useEvents } from '../../hooks/useEvents'
import { useTagVocabulary } from '../../hooks/useTagVocabulary'
import { TagFilterSelect } from '../../components/ui/TagFilterSelect'
import { SortSelect } from '../../components/ui/SortSelect'
import { Select } from '../../components/ui/Select'
import { ColumnToggle } from '../../components/ui/ColumnToggle'
import { Plus, CalendarX, CalendarDays, LayoutGrid } from 'lucide-react'
import { PageHero } from '../../components/layout/PageHero'
import { SkeletonGrid } from '../../components/ui/SkeletonCard'
import { CollapsibleSearch } from '../../components/ui/CollapsibleSearch'
import { CollapsibleSection } from '../../components/ui/CollapsibleSection'
import { usePageTitle } from '../../hooks/usePageTitle'
import { useGridColumns } from '../../hooks/useGridColumns'
import { usePersonalizationActive } from '../../hooks/usePersonalization'
import { useTutorialAutoStart } from '../../hooks/useTutorialAutoStart'
import { TUTORIAL_IDS } from '../../data/tutorials'
import { resolveSort, SORT_OPTIONS, type ContentSort } from '../../lib/personalization'
import { cn, debounce } from '../../lib/utils'
import { groupByDay } from '../../lib/calendar'
import { EVENT_TYPE_LABELS } from '../../lib/constants'
import type { Event } from '../../types'

type EventsView = 'calendar' | 'grid'

const VIEW_STORAGE_KEY = 'events:view'
const CALENDAR_VIEW_STORAGE_KEY = 'events:calendar-view'

const TYPE_OPTIONS = [
  { value: '', label: 'All Event Types' },
  ...Object.entries(EVENT_TYPE_LABELS).map(([value, label]) => ({ value, label })),
]

export default function EventsPage() {
  usePageTitle('Events')
  const [selectedType, setSelectedType] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const debouncedSetSearch = useMemo(() => debounce((val: string) => setDebouncedSearch(val), 300), [])
  const [tagFilter, setTagFilter] = useState<string[]>([])
  const [searchParams, setSearchParams] = useSearchParams()

  const { tags: tagOptions } = useTagVocabulary('events')

  // Sort lives in the URL so it is shareable and survives back/forward. It
  // only applies to the grid — the calendar has to stay in date order.
  const { active: personalizationActive } = usePersonalizationActive()
  const sort = resolveSort(searchParams.get('sort'), personalizationActive, 'upcoming')

  const setSort = (next: ContentSort) => {
    const params = new URLSearchParams(searchParams)
    params.set('sort', next)
    setSearchParams(params, { replace: true })
  }

  const [view, setView] = useState<EventsView>(() =>
    localStorage.getItem(VIEW_STORAGE_KEY) === 'grid' ? 'grid' : 'calendar'
  )
  const {
    view: calendarView,
    setView: setCalendarView,
    monthDate,
    selectedDate,
    direction: monthDir,
    gridStart,
    gridEnd,
    setSelectedDate,
    goPrev,
    goNext,
    goToday,
  } = useCalendarRange(
    localStorage.getItem(CALENDAR_VIEW_STORAGE_KEY) === 'week' ? 'week' : 'month'
  )

  const changeCalendarView = (next: CalendarView) => {
    setCalendarView(next)
    localStorage.setItem(CALENDAR_VIEW_STORAGE_KEY, next)
  }
  const autoSelectedRef = useRef(false)

  // Collapsible search — the page owns the open state so Clear all filters can
  // fold it back up
  const [searchOpen, setSearchOpen] = useState(false)

  const { columns, setColumns, gridClass } = useGridColumns('events:columns')

  const { events, loading: eventsLoading } = useEvents(
    view === 'calendar'
      ? {
          type: selectedType,
          search: debouncedSearch,
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
          upcoming: true,
          search: debouncedSearch,
          tags: tagFilter,
          sort,
        }
  )

  // Events that already happened. Kept as its own query rather than dropping
  // the upcoming filter: one combined fetch runs oldest-first and its row cap
  // would spend itself on the archive before reaching what is coming up.
  const { events: pastEvents, loading: pastLoading } = useEvents(
    {
      type: selectedType,
      past: true,
      search: debouncedSearch,
      tags: tagFilter,
    },
    { enabled: view === 'grid' }
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
    // Scan the visible window — a week view only shows seven days of it
    const scanStart = maxDate([gridStart, today])
    const scanEnd = gridEnd
    if (scanStart > scanEnd) return
    for (const day of eachDayOfInterval({ start: scanStart, end: scanEnd })) {
      if (eventsByDay.has(format(day, 'yyyy-MM-dd'))) {
        setSelectedDate(day)
        return
      }
    }
  }, [view, events, eventsByDay, gridStart, gridEnd])

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
    goNext()
  }

  const clearFilters = () => {
    setSelectedType('')
    setSearchQuery('')
    setDebouncedSearch('')
    setSearchOpen(false)
    setTagFilter([])
  }

  // The calendar earns a wider container than the card grid — seven day columns
  // need the horizontal room. Filters share it so both edges stay flush.
  const containerWidth =
    view === 'calendar' ? 'max-w-[calc(80vw+16rem)]' : 'max-w-[calc(50vw+32rem)]'

  const hasActiveFilters = Boolean(
    selectedType || searchQuery || tagFilter.length
  )

  // Type sections replace the flat grid whenever the upcoming list spans more
  // than one type. Picking a single type collapses back to one grid.
  const typeGroups = useMemo(() => {
    if (!events || view !== 'grid' || selectedType) return []
    const buckets = new Map<string, Event[]>()
    for (const event of events) {
      const type = event.event_type || 'other'
      const bucket = buckets.get(type)
      if (bucket) bucket.push(event)
      else buckets.set(type, [event])
    }
    // Under "For You" the sections follow the ranking; otherwise fixed
    // vocabulary order first, then anything the vocabulary does not know.
    const known = Object.keys(EVENT_TYPE_LABELS)
    const ordered =
      sort === 'for_you'
        ? [...buckets.keys()]
        : [...known, ...[...buckets.keys()].filter((t) => !known.includes(t))]
    return ordered.flatMap((type) => {
      const items = buckets.get(type)
      return items?.length
        ? [{ value: type, label: EVENT_TYPE_LABELS[type] ?? 'Other', items }]
        : []
    })
  }, [events, view, selectedType, sort])

  const selectedDayItems = useMemo(
    () => (eventsByDay.get(format(selectedDate, 'yyyy-MM-dd')) ?? []).map(eventToCalendarItem),
    [eventsByDay, selectedDate]
  )

  // First-time visitors get the guided tour once the list has actually rendered
  useTutorialAutoStart(TUTORIAL_IDS.EVENTS, !eventsLoading)

  return (
    <>
      <div data-tutorial="events-hero">
        <PageHero
          eyebrow="Event Archives"
          title="Events"
          imageSeed="events"
          breadcrumb={[{ label: 'Home', href: '/' }, { label: 'Events List' }]}
        />
      </div>

      {/* === Filter Section === */}
      <div id="filters" data-spy="Filters" className="scroll-mt-24 bg-ktip-sand-50 py-8">
        <div className={cn('mx-auto px-4', containerWidth)}>
          {/* Filters + collapsible search + view toggle */}
          <div data-tutorial="events-filters" className="flex flex-wrap items-center gap-3">
            <div data-tutorial="events-type-filter">
              <Select
                value={selectedType}
                onChange={setSelectedType}
                options={TYPE_OPTIONS}
                ariaLabel="Filter by event type"
              />
            </div>

            <TagFilterSelect
              options={tagOptions}
              selected={tagFilter}
              onChange={setTagFilter}
            />

            {view === 'grid' && !eventsLoading && events && (
              <p className="text-sm text-gray-500">
                Found {events.length} upcoming event{events.length !== 1 ? 's' : ''}
                {(pastEvents?.length ?? 0) > 0 && ` · ${pastEvents!.length} past`}
              </p>
            )}

            {view === 'grid' && (
              // Wrapper carries the tour anchor: SortSelect renders null when
              // there is nothing to choose, and a 0×0 span is auto-skipped
              <span data-tutorial="events-sort" className="inline-flex">
                <SortSelect
                  value={sort}
                  onChange={setSort}
                  options={SORT_OPTIONS.event.options}
                  personalizationActive={personalizationActive}
                />
              </span>
            )}

            <div className="ml-auto flex items-center gap-2">
              {/* Collapsible search — icon expands to input, like the navbar */}
              <div data-tutorial="events-search">
                <CollapsibleSearch
                  value={searchQuery}
                  onChange={(val) => { setSearchQuery(val); debouncedSetSearch(val) }}
                  open={searchOpen}
                  onOpenChange={setSearchOpen}
                  placeholder="Search events..."
                  ariaLabel="Search events"
                />
              </div>

              {view === 'grid' && <ColumnToggle value={columns} onChange={setColumns} />}

              <div
                data-tutorial="events-view-toggle"
                className="inline-flex rounded-lg border border-gray-300 bg-ktip-cream p-0.5"
              >
              <button
                type="button"
                data-tutorial="events-view-calendar"
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
                data-tutorial="events-view-grid"
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

              <Link to="/events/new">
                <Button
                  data-tutorial="events-create"
                  icon={<Plus size={16} />}
                  size="sm"
                  className="text-sm"
                >
                  Create Event
                </Button>
              </Link>
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

      {/* === Events === */}
      <div id="events" data-spy="Events" className="scroll-mt-24 bg-ktip-sand-50 pb-12">
        <div className={cn('mx-auto px-4', containerWidth)}>
          {view === 'calendar' ? (
            <div
              data-tutorial="events-calendar-view"
              className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 lg:gap-6 items-start"
            >
              {/* Wrapper, not the shared CalendarGrid — the dashboard reuses
                  that component and should not inherit this page's anchor */}
              <div data-tutorial="events-calendar">
                <EventCalendar
                  view={calendarView}
                  onViewChange={changeCalendarView}
                  monthDate={monthDate}
                  gridStart={gridStart}
                  gridEnd={gridEnd}
                  selectedDate={selectedDate}
                  eventsByDay={eventsByDay}
                  direction={monthDir}
                  onSelectDate={setSelectedDate}
                  onPrev={goPrev}
                  onNext={goNext}
                  onToday={goToday}
                />
              </div>
              <CalendarDayPanel
                date={selectedDate}
                items={selectedDayItems}
                loading={eventsLoading}
                itemNoun="event"
                emptyLabel="No events on this day"
                onJumpToNext={jumpToNextEvent}
                dataTutorial="events-day-panel"
              />
            </div>
          ) : eventsLoading || !events ? (
            <SkeletonGrid count={6} className={cn(gridClass, 'gap-4 auto-rows-fr')} />
          ) : events.length > 0 || (pastEvents?.length ?? 0) > 0 ? (
            <div data-tutorial="events-results">
              {events.length === 0 ? (
                <p className="text-sm text-gray-500 mb-8">
                  Nothing coming up under these filters — past events are below.
                </p>
              ) : typeGroups.length > 1 ? (
                <div data-tutorial="events-grid" className="space-y-2">
                  {typeGroups.map((group) => (
                    <CollapsibleSection
                      key={group.value}
                      title={group.label}
                      count={group.items.length}
                      className="first:border-t-0 first:pt-0"
                    >
                      <div className={cn(gridClass, 'gap-4 auto-rows-fr')}>
                        {group.items.map((event) => (
                          <EventCard key={event.id} event={event} />
                        ))}
                      </div>
                    </CollapsibleSection>
                  ))}
                </div>
              ) : (
                <div
                  data-tutorial="events-grid"
                  className={cn(gridClass, 'gap-4 auto-rows-fr stagger-children')}
                >
                  {events.map((event) => (
                    <EventCard key={event.id} event={event} />
                  ))}
                </div>
              )}

              {!pastLoading && pastEvents && pastEvents.length > 0 && (
                <CollapsibleSection
                  title="Past events"
                  count={pastEvents.length}
                  subtitle="Already happened, most recent first"
                  defaultOpen={false}
                  className="mt-10"
                >
                  <div className={cn(gridClass, 'gap-4 auto-rows-fr opacity-75')}>
                    {pastEvents.map((event) => (
                      <EventCard key={event.id} event={event} />
                    ))}
                  </div>
                </CollapsibleSection>
              )}
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
