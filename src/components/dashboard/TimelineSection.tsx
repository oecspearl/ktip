import { useState } from 'react'
import { Link } from 'react-router'
import { Route, RefreshCw } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useMyTimeline } from '../../hooks/useMyTimeline'
import { TimelineGantt } from './TimelineGantt'
import { TimelineItemDetail } from './TimelineItemDetail'
import { Button } from '../ui/Button'
import { Trans, useLingui } from '@lingui/react/macro'

interface TimelineSectionProps {
  userId: string
}

export default function TimelineSection({ userId }: TimelineSectionProps) {
    const { t } = useLingui()
  const auth = useAuth()
  const { items, loading, error, refetch } = useMyTimeline(userId)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const selected = items?.find((i) => i.id === selectedId) ?? null

  return (
    <section className="mb-8" aria-label={t`Your progress`}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-2xl font-display font-bold text-ktip-sand-900"><Trans>Your Progress</Trans></h2>
        <div className="flex items-center gap-4 text-xs text-ktip-sand-500">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-ktip-ocean-500" />
            Grant Applications
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-ktip-tropical-500" />
            Projects
          </span>
        </div>
      </div>

      {loading ? (
        <div className="bg-ktip-cream rounded-2xl shadow-card border border-ktip-sand-100 p-6 animate-pulse-soft">
          <div className="h-5 bg-ktip-sand-100 rounded w-1/3 mb-4" />
          <div className="space-y-3">
            <div className="h-10 bg-ktip-sand-100 rounded-lg" />
            <div className="h-10 bg-ktip-sand-100 rounded-lg w-5/6" />
            <div className="h-10 bg-ktip-sand-100 rounded-lg w-2/3" />
          </div>
        </div>
      ) : error ? (
        <div className="bg-ktip-cream rounded-2xl shadow-card border border-ktip-sand-100 p-6 flex items-center justify-between gap-3">
          <p className="text-sm text-ktip-sand-500"><Trans>Couldn't load your progress timeline.</Trans></p>
          <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={() => refetch()}>
            <Trans>Retry</Trans>
          </Button>
        </div>
      ) : !items || items.length === 0 ? (
        <div className="bg-ktip-cream rounded-2xl shadow-card border border-ktip-sand-100 py-16 text-center">
          <div className="w-16 h-16 bg-ktip-sand-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Route className="text-ktip-sand-400" size={28} />
          </div>
          <h3 className="text-2xl font-display font-bold text-ktip-sand-900 mb-2">
            <Trans>Nothing in motion yet</Trans>
          </h3>
          <p className="text-ktip-sand-500 mb-6">
            <Trans>Apply for a grant or start a project to track its journey here.</Trans>
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link to="/grants">
              <Button variant="primary"><Trans>Browse Grants</Trans></Button>
            </Link>
            {auth.can('project:create') && (
              <Link to="/projects/new">
                <Button variant="outline"><Trans>Start a Project</Trans></Button>
              </Link>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <TimelineGantt items={items} selectedId={selectedId} onSelect={setSelectedId} />
          {selected && <TimelineItemDetail item={selected} />}
        </div>
      )}
    </section>
  )
}
