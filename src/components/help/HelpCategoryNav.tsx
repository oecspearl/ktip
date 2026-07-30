import { LayoutGrid } from 'lucide-react'
import type { HelpCategory } from '../../lib/help-content'
import { helpIcon } from './help-icons'

interface HelpCategoryNavProps {
  categories: HelpCategory[]
  selectedCategory: string
  onSelect: (id: string) => void
  /**
   * Per-category match counts while a search is active. Null means no search,
   * so the nav shows the full catalogue counts and nothing is disabled.
   */
  matchCounts?: Record<string, number> | null
}

export function HelpCategoryNav({
  categories,
  selectedCategory,
  onSelect,
  matchCounts,
}: HelpCategoryNavProps) {
  const countFor = (cat: HelpCategory) =>
    matchCounts ? matchCounts[cat.id] ?? 0 : cat.articles.length

  const total = categories.reduce((sum, cat) => sum + countFor(cat), 0)

  const rowClass = (active: boolean, disabled: boolean) =>
    `shrink-0 lg:shrink w-auto lg:w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-colors ${
      active
        ? 'bg-ktip-ocean-50 text-ktip-ocean-700'
        : disabled
          ? 'text-ktip-sand-400 cursor-not-allowed'
          : 'text-ktip-sand-600 hover:bg-ktip-sand-50 hover:text-ktip-sand-900'
    }`

  return (
    <div className="w-full lg:w-64 shrink-0">
      <div className="bg-ktip-cream border border-ktip-sand-200 rounded-2xl p-2 lg:sticky lg:top-[calc(var(--nav-h)+1.5rem)] lg:max-h-[calc(100vh-var(--nav-h)-3.5rem)] lg:overflow-y-auto">
        <p className="hidden lg:block px-3 pt-2 pb-1 font-display font-bold text-ktip-sand-900 uppercase text-xs tracking-wider">
          Categories
        </p>

        <nav
          className="flex flex-row lg:flex-col gap-1 overflow-x-auto lg:overflow-x-visible"
          aria-label="Help categories"
        >
          <button
            type="button"
            onClick={() => onSelect('')}
            aria-current={selectedCategory === '' ? 'true' : undefined}
            className={rowClass(selectedCategory === '', false)}
          >
            <LayoutGrid size={18} className="shrink-0" />
            <span className="font-medium text-sm whitespace-nowrap flex-1">All topics</span>
            <span className="text-xs opacity-70 tabular-nums">{total}</span>
          </button>

          {categories.map((cat) => {
            const Icon = helpIcon(cat.icon)
            const count = countFor(cat)
            const active = selectedCategory === cat.id
            const disabled = !!matchCounts && count === 0

            return (
              <button
                key={cat.id}
                type="button"
                disabled={disabled}
                onClick={() => onSelect(active ? '' : cat.id)}
                aria-current={active ? 'true' : undefined}
                className={rowClass(active, disabled)}
              >
                <Icon size={18} className="shrink-0" />
                <span className="font-medium text-sm whitespace-nowrap flex-1 lg:truncate">
                  {cat.title}
                </span>
                <span className="text-xs opacity-70 tabular-nums">{count}</span>
              </button>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
