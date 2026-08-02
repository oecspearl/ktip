import {
  ArrowUpRight,
  Brain,
  ChevronRight,
  Clock,
  CornerDownLeft,
  Loader2,
  Search,
  Sparkles,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { DropdownPanel } from '../ui/DropdownPanel'
import { resolveIcon } from '../../lib/icon-map'
import type { SearchGroup, SearchRow } from '../../lib/site-search'

/**
 * The results panel that drops below the navbar search box.
 *
 * Purely presentational — the query, the results and the highlighted index all
 * live in Navbar, so the desktop and mobile instances stay in lockstep.
 *
 * Two affordances per row: clicking the row navigates, clicking the chevron
 * expands it in place to explain how to get there or do the thing yourself.
 */

export interface NavbarSearchPanelProps {
  query: string
  groups: SearchGroup[]
  /** Flattened rows in render order — index matches `activeIndex`. */
  rows: SearchRow[]
  /** `rows.length` highlights the trailing "see all results" row. */
  activeIndex: number
  onHover: (index: number) => void
  expandedId: string | null
  onToggleExpand: (id: string) => void
  onSelect: (row: SearchRow) => void
  onSeeAll: () => void
  aiMode: boolean
  onToggleAiMode: () => void
  aiAnswer: string | null
  aiSteps: string[]
  aiLoading: boolean
  aiError: boolean
  contentLoading: boolean
  suggestions: SearchRow[]
  recent: string[]
  onPickRecent: (term: string) => void
  onClearRecent: () => void
  variant?: 'desktop' | 'mobile'
  /** Drives the open/close animation; the panel owns its own mounting. */
  open: boolean
}

export function NavbarSearchPanel({
  query,
  groups,
  rows,
  activeIndex,
  onHover,
  expandedId,
  onToggleExpand,
  onSelect,
  onSeeAll,
  aiMode,
  onToggleAiMode,
  aiAnswer,
  aiSteps,
  aiLoading,
  aiError,
  contentLoading,
  suggestions,
  recent,
  onPickRecent,
  onClearRecent,
  variant = 'desktop',
  open,
}: NavbarSearchPanelProps) {
  const hasQuery = query.trim().length > 0
  const showEmptyState = !hasQuery

  return (
    <DropdownPanel
      open={open}
      role="listbox"
      aria-label="Search results"
      className={cn(
        'bg-ktip-cream rounded-xl shadow-hard border border-ktip-sand-100 overflow-hidden',
        variant === 'desktop'
          ? 'absolute right-0 top-full mt-2 w-[min(34rem,calc(100vw-2rem))] origin-top-right z-dropdown'
          : 'mt-2 w-full origin-top'
      )}
    >
      {/* Mode row */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-ktip-sand-100">
        {aiLoading ? (
          <Loader2 size={16} className="animate-spin text-ktip-ocean-600 shrink-0" />
        ) : (
          <Search size={16} className="text-ktip-sand-400 shrink-0" />
        )}
        <p className="text-xs text-ktip-sand-500 truncate flex-1">
          {aiMode
            ? aiLoading
              ? 'Thinking about where to send you…'
              : 'AI navigation is on — ask in your own words'
            : hasQuery
              ? `Results for “${query.trim()}”`
              : 'Search pages, features and content'}
        </p>
        {contentLoading && !aiLoading && (
          <Loader2 size={14} className="animate-spin text-ktip-sand-400 shrink-0" />
        )}
        <button
          type="button"
          onClick={onToggleAiMode}
          aria-label="Toggle AI-guided navigation"
          aria-pressed={aiMode}
          title="AI-guided navigation"
          className={cn(
            'p-1.5 rounded-lg transition-colors shrink-0',
            aiMode
              ? 'bg-ktip-ocean-500/15 text-ktip-ocean-600'
              : 'text-ktip-sand-400 hover:bg-ktip-sand-100 hover:text-ktip-sand-600'
          )}
        >
          <Brain size={16} />
        </button>
      </div>

      {/* AI answer */}
      {aiMode && aiAnswer && (
        <div className="px-4 py-3 border-b border-ktip-sand-100 bg-ktip-ocean-50/40">
          <div className="flex items-start gap-2">
            <Sparkles size={14} className="mt-0.5 shrink-0 text-ktip-ocean-600" />
            <div className="min-w-0">
              <p className="text-sm leading-relaxed text-ktip-sand-800">{aiAnswer}</p>
              {aiSteps.length > 0 && (
                <ol className="mt-2 space-y-1 list-decimal list-inside">
                  {aiSteps.map((step, i) => (
                    <li key={i} className="text-xs text-ktip-sand-600 leading-relaxed">
                      {step}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </div>
      )}

      {aiMode && aiError && (
        <p className="px-4 py-2 text-xs text-ktip-sand-500 border-b border-ktip-sand-100">
          AI navigation is unavailable right now — showing local matches.
        </p>
      )}

      <div className="max-h-[60vh] overflow-y-auto">
        {/* Empty query: recent searches + curated starting points */}
        {showEmptyState && (
          <>
            {recent.length > 0 && (
              <section>
                <div className="flex items-center justify-between px-4 pt-3 pb-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-ktip-sand-400">
                    Recent
                  </p>
                  <button
                    type="button"
                    onClick={onClearRecent}
                    className="text-[11px] text-ktip-ocean-600 hover:text-ktip-ocean-700 font-medium"
                  >
                    Clear
                  </button>
                </div>
                {recent.map((term) => (
                  <button
                    key={term}
                    type="button"
                    onClick={() => onPickRecent(term)}
                    className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-ktip-sand-50 transition-colors"
                  >
                    <Clock size={16} className="text-ktip-sand-400 shrink-0" />
                    <span className="text-sm text-ktip-sand-700 truncate">{term}</span>
                  </button>
                ))}
              </section>
            )}
            <section>
              <p className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-ktip-sand-400">
                Jump to
              </p>
              {suggestions.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => onSelect(row)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-ktip-sand-50 transition-colors"
                >
                  <RowIcon name={row.icon} />
                  <span className="text-sm font-medium text-ktip-sand-800 truncate flex-1">
                    {row.title}
                  </span>
                  <ChevronRight size={14} className="text-ktip-sand-300 shrink-0" />
                </button>
              ))}
            </section>
            <p className="px-4 py-3 text-[11px] text-ktip-sand-400 border-t border-ktip-sand-50">
              Tip: press <kbd className="font-sans font-semibold">Ctrl</kbd>+
              <kbd className="font-sans font-semibold">K</kbd> from anywhere to search.
            </p>
          </>
        )}

        {/* Results */}
        {hasQuery && rows.length === 0 && !contentLoading && (
          <p className="px-4 py-8 text-sm text-center text-ktip-sand-500">
            Nothing matched “{query.trim()}”.
            {!aiMode && ' Try the brain icon to ask in your own words.'}
          </p>
        )}

        {hasQuery &&
          groups.map((group) => (
            <section key={group.kind}>
              <p className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-ktip-sand-400">
                {group.label}
              </p>
              {group.rows.map((row) => {
                const index = rows.indexOf(row)
                const isActive = index === activeIndex
                const isExpanded = expandedId === row.id
                return (
                  <div key={row.id} className={cn(isExpanded && 'bg-ktip-sand-50/60')}>
                    <div
                      className={cn(
                        'flex items-stretch transition-colors',
                        isActive && 'bg-ktip-ocean-50'
                      )}
                    >
                      <button
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        onMouseEnter={() => onHover(index)}
                        onClick={() => onSelect(row)}
                        className="flex items-center gap-3 flex-1 min-w-0 px-4 py-2.5 text-left"
                      >
                        <RowIcon name={row.icon} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-ktip-sand-800 truncate">
                            {row.title}
                          </span>
                          {row.description && (
                            <span className="block text-xs text-ktip-sand-500 truncate">
                              {row.description}
                            </span>
                          )}
                        </span>
                        <span className="hidden sm:block text-[10px] uppercase tracking-wider text-ktip-sand-400 shrink-0">
                          {row.category}
                        </span>
                        {isActive && (
                          <CornerDownLeft size={13} className="text-ktip-ocean-600 shrink-0" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => onToggleExpand(row.id)}
                        aria-label={isExpanded ? `Hide details for ${row.title}` : `Show details for ${row.title}`}
                        aria-expanded={isExpanded}
                        className="px-3 text-ktip-sand-400 hover:text-ktip-ocean-600 hover:bg-ktip-sand-100/60 transition-colors"
                      >
                        <ChevronRight
                          size={16}
                          className={cn('transition-transform', isExpanded && 'rotate-90')}
                        />
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="px-4 pb-3 pl-11">
                        {row.howTo && row.howTo.length > 0 ? (
                          <ol className="space-y-1 list-decimal list-inside">
                            {row.howTo.map((step, i) => (
                              <li key={i} className="text-xs text-ktip-sand-600 leading-relaxed">
                                {step}
                              </li>
                            ))}
                          </ol>
                        ) : (
                          <p className="text-xs text-ktip-sand-600 leading-relaxed">
                            {row.description || 'No extra details for this result.'}
                          </p>
                        )}
                        {row.href && (
                          <button
                            type="button"
                            onClick={() => onSelect(row)}
                            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-ktip-ocean-600 hover:text-ktip-ocean-700"
                          >
                            Open
                            <ArrowUpRight size={12} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </section>
          ))}

        {/* Full-text fallback, preserving the old Enter behaviour */}
        {hasQuery && (
          <button
            type="button"
            onMouseEnter={() => onHover(rows.length)}
            onClick={onSeeAll}
            className={cn(
              'w-full flex items-center gap-3 px-4 py-2.5 text-left border-t border-ktip-sand-100 transition-colors',
              activeIndex === rows.length ? 'bg-ktip-ocean-50' : 'hover:bg-ktip-sand-50'
            )}
          >
            <Search size={16} className="text-ktip-sand-400 shrink-0" />
            <span className="text-sm text-ktip-sand-700 truncate flex-1">
              See all results for “{query.trim()}” in Projects
            </span>
            {activeIndex === rows.length && (
              <CornerDownLeft size={13} className="text-ktip-ocean-600 shrink-0" />
            )}
          </button>
        )}
      </div>

      {/* Footer hints */}
      {hasQuery && (
        <div className="flex items-center gap-3 px-4 py-2 text-[11px] text-ktip-sand-400 border-t border-ktip-sand-100">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>→ details</span>
          <span className="ml-auto">esc close</span>
        </div>
      )}
    </DropdownPanel>
  )
}

function RowIcon({ name }: { name?: string }) {
  const Icon = resolveIcon(name)
  return <Icon size={16} className="text-ktip-sand-400 shrink-0" />
}
