import { ExternalLink, Puzzle } from 'lucide-react'
import { INTEGRATION_CATEGORY_LABELS } from '../../lib/constants'
import type { Integration } from '../../types'
import { useLingui } from '@lingui/react/macro'
import { resolveCopy } from '../../i18n/copy'

/** Kept short — the card sits in a 3-up grid with no detail page to spill into. */
const MAX_TAGS = 4

interface IntegrationCardProps {
  integration: Integration
}

export function IntegrationCard({ integration }: IntegrationCardProps) {
  const { i18n } = useLingui()
  const categoryLabel = INTEGRATION_CATEGORY_LABELS[integration.category]
  return (
    <div className="bg-ktip-cream border border-ktip-sand-200 rounded-xl p-5 flex flex-col hover:shadow-md transition-shadow">
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
            {categoryLabel ? resolveCopy(i18n, categoryLabel) : integration.category}
          </span>
        </div>
      </div>
      <p className="text-sm text-ktip-sand-600 line-clamp-3 flex-1 mb-3">
        {integration.summary || integration.description}
      </p>
      {integration.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {integration.tags.slice(0, MAX_TAGS).map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-ktip-sand-100 text-ktip-sand-700 border border-ktip-sand-200"
            >
              {tag}
            </span>
          ))}
          {integration.tags.length > MAX_TAGS && (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium text-ktip-sand-500">
              +{integration.tags.length - MAX_TAGS}
            </span>
          )}
        </div>
      )}
      <a
        href={integration.website_url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center justify-center gap-1.5 px-4 py-2 btn-brand text-sm font-bold rounded-lg"
      >
        Visit
        <ExternalLink size={14} />
      </a>
    </div>
  )
}
