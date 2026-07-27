import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ChevronRight, Search, ExternalLink, Puzzle } from 'lucide-react'
import { useIntegrations } from '../../hooks/useIntegrations'
import { SkeletonGrid } from '../../components/ui/SkeletonCard'
import { usePageTitle } from '../../hooks/usePageTitle'
import { debounce } from '../../lib/utils'

export const INTEGRATION_CATEGORY_LABELS: Record<string, string> = {
  funding: 'Funding',
  productivity: 'Productivity',
  government: 'Government',
  education: 'Education',
  developer: 'Developer Tools',
  other: 'Other',
}

export default function IntegrationsPage() {
  usePageTitle('Integration Directory')

  const [category, setCategory] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const debouncedSetSearch = useMemo(() => debounce((val: string) => setDebouncedSearch(val), 300), [])

  const { integrations, loading } = useIntegrations({ category, search: debouncedSearch })

  return (
    <>
      {/* Dark Hero */}
      <div className="bg-gray-800 py-10">
        <div className="container mx-auto px-4">
          <nav className="flex items-center gap-1.5 text-sm text-gray-400 mb-4">
            <Link to="/" className="hover:text-white transition-colors">Home</Link>
            <ChevronRight size={14} className="text-gray-500" />
            <span className="text-gray-200">Integrations</span>
          </nav>
          <h1 className="text-3xl font-display font-bold text-white mb-2">Integration Directory</h1>
          <p className="text-gray-400 max-w-2xl">
            External tools, services, and partner platforms for OECS innovators — curated by the KTIP team.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-10">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-8">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search integrations..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                debouncedSetSearch(e.target.value)
              }}
              className="w-full pl-9 pr-3 py-2.5 border border-gray-300 bg-white rounded-lg text-sm focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors"
            />
          </div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500"
          >
            <option value="">All Categories</option>
            {Object.entries(INTEGRATION_CATEGORY_LABELS).map(([value, label]) => (
              <option value={value} key={value}>{label}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <SkeletonGrid count={6} />
        ) : integrations && integrations.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {integrations.map((integration) => (
              <div
                key={integration.id}
                className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col hover:shadow-md transition-shadow"
              >
                <div className="flex items-center gap-3 mb-3">
                  {integration.logo_url ? (
                    <img
                      src={integration.logo_url}
                      alt={integration.name}
                      className="w-12 h-12 rounded-xl object-contain bg-ktip-sand-50 border border-ktip-sand-100 p-1 shrink-0"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-12 h-12 bg-ktip-ocean-100 rounded-xl flex items-center justify-center shrink-0">
                      <Puzzle size={22} className="text-ktip-ocean-600" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <h3 className="font-display font-bold text-ktip-sand-900 truncate">
                      {integration.name}
                    </h3>
                    <span className="text-xs text-ktip-ocean-600 font-medium">
                      {INTEGRATION_CATEGORY_LABELS[integration.category] || integration.category}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-ktip-sand-600 line-clamp-3 flex-1 mb-4">
                  {integration.description}
                </p>
                <a
                  href={integration.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-ktip-ocean-600 text-white text-sm font-bold rounded-lg hover:bg-ktip-ocean-700 transition-colors"
                >
                  Visit
                  <ExternalLink size={14} />
                </a>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Puzzle size={32} className="text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-ktip-sand-900 mb-1">No integrations found</h3>
            <p className="text-gray-500 text-sm">
              {searchQuery || category
                ? 'Try adjusting your search or category filter.'
                : 'The directory is being curated — check back soon.'}
            </p>
          </div>
        )}
      </div>
    </>
  )
}
