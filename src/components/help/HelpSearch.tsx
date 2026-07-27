import { For, Show } from 'solid-js'
import { Search, X } from 'lucide-solid'
import type { HelpCategory } from '../../lib/help-content'

interface HelpSearchProps {
  searchQuery: () => string
  setSearchQuery: (val: string) => void
  selectedCategory: () => string
  setSelectedCategory: (val: string) => void
  categories: HelpCategory[]
  resultCount?: number
}

export function HelpSearch(props: HelpSearchProps) {
  const hasFilters = () => props.searchQuery().trim() !== '' || props.selectedCategory() !== ''

  const clearAll = () => {
    props.setSearchQuery('')
    props.setSelectedCategory('')
  }

  return (
    <div class="space-y-4">
      {/* Search Input */}
      <div class="relative">
        <Search
          size={20}
          class="absolute left-4 top-1/2 -translate-y-1/2 text-ktip-sand-400"
        />
        <input
          type="text"
          placeholder="Search help articles..."
          value={props.searchQuery()}
          onInput={(e) => props.setSearchQuery(e.currentTarget.value)}
          class="w-full pl-12 pr-4 py-3 bg-white border border-ktip-sand-200 rounded-xl text-ktip-sand-900 placeholder:text-ktip-sand-400 focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors"
        />
        <Show when={props.searchQuery()}>
          <button
            type="button"
            onClick={() => props.setSearchQuery('')}
            class="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-ktip-sand-400 hover:text-ktip-sand-600 transition-colors"
            aria-label="Clear search"
          >
            <X size={16} />
          </button>
        </Show>
      </div>

      {/* Category Filters */}
      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => props.setSelectedCategory('')}
          class={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            props.selectedCategory() === ''
              ? 'bg-ktip-ocean-500 text-white'
              : 'bg-ktip-sand-100 text-ktip-sand-600 hover:bg-ktip-sand-200'
          }`}
        >
          All
        </button>
        <For each={props.categories}>
          {(cat) => (
            <button
              type="button"
              onClick={() =>
                props.setSelectedCategory(
                  props.selectedCategory() === cat.id ? '' : cat.id
                )
              }
              class={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                props.selectedCategory() === cat.id
                  ? 'bg-ktip-ocean-500 text-white'
                  : 'bg-ktip-sand-100 text-ktip-sand-600 hover:bg-ktip-sand-200'
              }`}
            >
              {cat.title}
            </button>
          )}
        </For>

        <Show when={hasFilters()}>
          <button
            type="button"
            onClick={clearAll}
            class="ml-auto text-sm text-ktip-ocean-600 hover:text-ktip-ocean-700 font-medium"
          >
            Clear all
          </button>
        </Show>
      </div>

      {/* Results count */}
      <Show when={hasFilters() && props.resultCount !== undefined}>
        <p class="text-sm text-ktip-sand-500">
          Found {props.resultCount} article{props.resultCount !== 1 ? 's' : ''}
        </p>
      </Show>
    </div>
  )
}
