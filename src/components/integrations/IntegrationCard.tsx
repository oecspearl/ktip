import { ExternalLink, Puzzle } from 'lucide-react'
import { INTEGRATION_CATEGORY_LABELS } from '../../lib/constants'
import type { Integration } from '../../types'

interface IntegrationCardProps {
  integration: Integration
}

export function IntegrationCard({ integration }: IntegrationCardProps) {
  return (
    <div className="bg-ktip-cream border border-gray-200 rounded-xl p-5 flex flex-col hover:shadow-md transition-shadow">
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
  )
}
