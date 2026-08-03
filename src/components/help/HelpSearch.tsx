import { Search, X } from 'lucide-react'
import { Plural, useLingui } from '@lingui/react/macro'

interface HelpSearchProps {
  searchQuery: string
  setSearchQuery: (val: string) => void
  resultCount?: number
}

// Category filtering moved out of here into HelpCategoryNav — the chip row did
// not belong on the hero image, and 20 categories will not fit in one.
export function HelpSearch({ searchQuery, setSearchQuery, resultCount }: HelpSearchProps) {
    const { t } = useLingui()
  return (
    <div>
      <div className="relative">
        <Search
          size={20}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-ktip-sand-400"
        />
        <input
          type="text"
          placeholder={t`Search help articles...`}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-12 pr-4 py-3 bg-ktip-cream border border-ktip-sand-200 rounded-xl text-ktip-sand-900 placeholder:text-ktip-sand-400 focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-ktip-sand-400 hover:text-ktip-sand-600 transition-colors"
            aria-label={t`Clear search`}
          >
            <X size={16} />
          </button>
        )}
      </div>

      {resultCount !== undefined && (
        <p className="mt-2 text-sm text-white/80 md:text-right">
          <Plural value={resultCount} one="Found # article" other="Found # articles" />
        </p>
      )}
    </div>
  )
}
