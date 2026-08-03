import { useState } from 'react'
import { Link } from 'react-router'
import { Sparkles, X, CalendarDays, Clock, ChevronRight } from 'lucide-react'
import { MatchReasonChip } from '../ui/MatchReasonChip'
import { SkeletonGrid } from '../ui/SkeletonCard'
import { useAuth } from '../../contexts/AuthContext'
import { usePersonalizationActive } from '../../hooks/usePersonalization'
import { usePersonalizedFeed, type FeedItem } from '../../hooks/usePersonalizedFeed'
import { hasSignals, personalizedHref } from '../../lib/personalization'
import { formatDate } from '../../lib/utils'
import { Trans, useLingui } from '@lingui/react/macro'

const ENTITY_LABELS: Record<FeedItem['entity'], string> = {
  project: 'Project',
  resource: 'Resource',
  event: 'Event',
  grant: 'Grant',
}

const PROMPT_DISMISSED_KEY = 'ktip_personalization_prompt_dismissed'

interface ForYouRailProps {
  title?: string
  limit?: number
}

function FeedCard({ item }: { item: FeedItem }) {
  const when = item.deadline_at
    ? { icon: <Clock size={12} />, text: `Closes ${formatDate(item.deadline_at)}` }
    : item.occurs_at
      ? { icon: <CalendarDays size={12} />, text: formatDate(item.occurs_at) }
      : null

  return (
    <Link
      to={personalizedHref(item.entity, item.id)}
      className="group flex flex-col gap-2 bg-ktip-cream border border-ktip-sand-200 rounded-2xl p-4 hover:border-ktip-ocean-300 transition-colors"
    >
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ktip-ocean-600">
        {ENTITY_LABELS[item.entity]}
      </div>

      <h3 className="font-display font-bold text-ktip-sand-900 leading-snug line-clamp-2 group-hover:text-ktip-ocean-700">
        {item.title}
      </h3>

      {item.summary && (
        <p className="text-sm text-ktip-sand-600 line-clamp-2">{item.summary}</p>
      )}

      <div className="mt-auto pt-2 space-y-2">
        {when && (
          <div className="flex items-center gap-1.5 text-xs text-ktip-sand-500">
            {when.icon}
            {when.text}
          </div>
        )}
        <MatchReasonChip reasons={item.reasons} />
      </div>
    </Link>
  )
}

/**
 * The cross-entity recommendation rail for Dashboard and Discover.
 *
 * Owns all three of its states so the host pages stay thin:
 *   * signed out, or personalization off  -> renders nothing at all
 *   * on, but no signals to work with     -> a dismissible prompt, because a
 *                                            recency list labelled "For You"
 *                                            is worse than an honest ask
 *   * otherwise                           -> the ranked rail
 */
export function ForYouRail({ title = 'For You', limit = 6 }: ForYouRailProps) {
    const { t } = useLingui()
  const auth = useAuth()
  const { active, personalization } = usePersonalizationActive()
  const { items, loading } = usePersonalizedFeed({ limit })
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(PROMPT_DISMISSED_KEY) === '1'
  )

  if (!auth.user || !active) return null

  if (!hasSignals(personalization, auth.profile)) {
    if (dismissed) return null
    return (
      <div className="mb-8 flex items-start gap-4 bg-ktip-ocean-50 border border-ktip-ocean-200 rounded-2xl p-5">
        <div className="w-10 h-10 bg-ktip-ocean-100 rounded-xl flex items-center justify-center shrink-0">
          <Sparkles size={20} className="text-ktip-ocean-600" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-display font-bold text-ktip-sand-900">
            <Trans>Tell us what you are interested in</Trans>
          </h3>
          <p className="text-sm text-ktip-sand-600 mt-0.5">
            <Trans>Pick a few topics and we will put the projects, resources, events and grants that suit you at the top of every list. Nothing gets hidden.</Trans>
          </p>
          <Link
            to="/settings?tab=personalization"
            className="inline-flex items-center gap-1 mt-2 text-sm font-medium text-ktip-ocean-600 hover:text-ktip-ocean-700"
          >
            Choose my topics
            <ChevronRight size={14} />
          </Link>
        </div>
        <button
          type="button"
          aria-label={t`Dismiss`}
          onClick={() => {
            localStorage.setItem(PROMPT_DISMISSED_KEY, '1')
            setDismissed(true)
          }}
          className="text-ktip-sand-400 hover:text-ktip-sand-600 shrink-0"
        >
          <X size={18} />
        </button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles size={18} className="text-ktip-ocean-600" />
          <h2 className="font-display font-bold text-xl text-ktip-sand-900">{title}</h2>
        </div>
        <SkeletonGrid
          count={3}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-fr"
        />
      </div>
    )
  }

  // No recommendations is a normal outcome on a small or freshly seeded
  // corpus; an empty rail with a heading would just look broken.
  if (!items.length) return null

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-ktip-ocean-600" />
          <h2 className="font-display font-bold text-xl text-ktip-sand-900">{title}</h2>
        </div>
        <Link
          to="/settings?tab=personalization"
          className="text-sm font-medium text-ktip-ocean-600 hover:text-ktip-ocean-700"
        >
          <Trans>Tune this</Trans>
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-fr">
        {items.map((item) => (
          <FeedCard key={`${item.entity}:${item.id}`} item={item} />
        ))}
      </div>
    </div>
  )
}
