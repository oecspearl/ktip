import { useState } from 'react'
import { Link } from 'react-router'
import { ResourceCard } from '../../components/resources/ResourceCard'
import { useResources } from '../../hooks/useResources'
import { usePageTitle } from '../../hooks/usePageTitle'
import { Search, BookOpen, ChevronRight } from 'lucide-react'
import { SkeletonGrid } from '../../components/ui/SkeletonCard'
import {
  RESOURCE_TYPE_LABELS,
  RESOURCE_CATEGORY_LABELS,
} from '../../lib/constants'

export default function ResourcesPage() {
  usePageTitle('Resources')

  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [climateFilter, setClimateFilter] = useState(false)

  const { resources, loading } = useResources({
    search: searchQuery,
    type: typeFilter,
    category: categoryFilter,
    climateAction: climateFilter,
  })

  const hasActiveFilters = !!(searchQuery || typeFilter || categoryFilter || climateFilter)

  const clearFilters = () => {
    setSearchQuery('')
    setTypeFilter('')
    setCategoryFilter('')
    setClimateFilter(false)
  }

  return (
    <>
      {/* === Dark Hero Header Band === */}
      <div className="bg-gray-800 min-h-[180px] flex items-center">
        <div className="container mx-auto px-4 py-10">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <p className="text-gray-400 text-sm uppercase tracking-widest mb-2">Knowledge Base</p>
              <h1 className="text-3xl md:text-4xl font-display font-bold text-white">Resources</h1>
            </div>
            <nav className="text-sm text-gray-400 hidden md:block" aria-label="Breadcrumb">
              <Link to="/" className="hover:text-white transition-colors">Home</Link>
              <span className="mx-2"><ChevronRight size={12} className="inline" /></span>
              <span className="text-gray-300">Resources</span>
            </nav>
          </div>
        </div>
      </div>

      {/* === Filter Section === */}
      <div className="bg-white py-8">
        <div className="max-w-5xl mx-auto px-4">
          {/* Row 1: Search */}
          <div className="flex gap-2 mb-3">
            <div className="relative flex-1">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search resources..."
                aria-label="Search resources"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.currentTarget.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 bg-white rounded-lg focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors text-sm"
              />
            </div>
            <button className="px-5 py-2.5 bg-ktip-ocean-600 text-white text-sm font-bold uppercase tracking-wider rounded-lg hover:bg-ktip-ocean-700 transition-colors shrink-0">
              Search
            </button>
          </div>

          {/* Row 2: Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.currentTarget.value)}
              className="px-3 py-2 border border-gray-300 bg-white rounded-lg text-sm focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors"
            >
              <option value="">All Types</option>
              {Object.entries(RESOURCE_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.currentTarget.value)}
              className="px-3 py-2 border border-gray-300 bg-white rounded-lg text-sm focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors"
            >
              <option value="">All Categories</option>
              {Object.entries(RESOURCE_CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>

            <label className="flex items-center gap-2 cursor-pointer text-sm text-ktip-sand-700">
              <input
                type="checkbox"
                checked={climateFilter}
                onChange={(e) => setClimateFilter(e.currentTarget.checked)}
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

      {/* === Resources List === */}
      <div className="bg-white pb-12">
        <div className="max-w-5xl mx-auto px-4">
          {loading || !resources ? (
            <SkeletonGrid count={6} />
          ) : resources.length ? (
            <div>
              {resources.map((resource) => (
                <ResourceCard key={resource.id} resource={resource} />
              ))}
            </div>
          ) : (
            <div className="text-center py-16">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <BookOpen size={32} className="text-gray-400" />
              </div>
              <h3 className="text-2xl font-display font-bold text-ktip-sand-900 mb-2">
                No resources found
              </h3>
              <p className="text-gray-500 mb-6">
                {hasActiveFilters
                  ? 'Try adjusting your filters to find more resources.'
                  : 'Resources will appear here once they are published.'}
              </p>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="px-5 py-2.5 bg-ktip-ocean-600 text-white text-sm rounded-lg hover:bg-ktip-ocean-700 transition-colors"
                >
                  Clear Filters
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
