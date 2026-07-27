import { Search, X } from 'lucide-react'
import type { HelpCategory } from '../../lib/help-content'

interface HelpSearchProps {
  searchQuery: string
  setSearchQuery: (val: string) => void
  selectedCategory: string
  setSelectedCategory: (val: string) => void
  categories: HelpCategory[]
  resultCount?: number
}

export function HelpSearch({
  searchQuery,
  setSearchQuery,
  selectedCategory,
  setSelectedCategory,
  categories,
  resultCount,
}: HelpSearchProps) {
  const hasFilters = searchQuery.trim() !== '' || selectedCategory !== ''

  const clearAll = () => {
    setSearchQuery('')
    setSelectedCategory('')
  }

  return (
    <div className="space-y-4">
      {/* Search Input */}
      <div className="relative">
        <Search
          size={20}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-ktip-sand-400"
        />
        <input
          type="text"
          placeholder="Search help articles..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-12 pr-4 py-3 bg-white border border-ktip-sand-200 rounded-xl text-ktip-sand-900 placeholder:text-ktip-sand-400 focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-ktip-sand-400 hover:text-ktip-sand-600 transition-colors"
            aria-label="Clear search"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Category Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setSelectedCategory('')}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            selectedCategory === ''
              ? 'bg-ktip-ocean-500 text-white'
              : 'bg-ktip-sand-100 text-ktip-sand-600 hover:bg-ktip-sand-200'
          }`}
        >
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() =>
              setSelectedCategory(selectedCategory === cat.id ? '' : cat.id)
            }
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              selectedCategory === cat.id
                ? 'bg-ktip-ocean-500 text-white'
                : 'bg-ktip-sand-100 text-ktip-sand-600 hover:bg-ktip-sand-200'
            }`}
          >
            {cat.title}
          </button>
        ))}

        {hasFilters && (
          <button
            type="button"
            onClick={clearAll}
            className="ml-auto text-sm text-ktip-ocean-600 hover:text-ktip-ocean-700 font-medium"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Results count */}
      {hasFilters && resultCount !== undefined && (
        <p className="text-sm text-ktip-sand-500">
          Found {resultCount} article{resultCount !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  )
}
