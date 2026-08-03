import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { Award, Heart, MapPin, Sparkles, Tag, Briefcase } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useUserBadges } from '../../hooks/useBadges'
import { keys } from '../../queries/keys'
import { Trans, useLingui } from '@lingui/react/macro'

/**
 * Counts of the behaviour the ranker reads. Head-only counts, and a failing
 * table degrades to 0 rather than blanking the panel — this is a transparency
 * readout, not a data dependency.
 */
function useEngagementCounts(userId: string | undefined) {
  const fetchCounts = async (uid: string) => {
    const count = async (table: string, column: string) => {
      const { count: n, error } = await (supabase as any)
        .from(table)
        .select(column, { count: 'exact', head: true })
        .eq('user_id', uid)
      return error ? 0 : n || 0
    }

    const [likes, follows, rsvps, applications] = await Promise.all([
      count('project_likes', 'project_id'),
      count('project_follows', 'project_id'),
      count('event_rsvps', 'event_id'),
      count('grant_applications', 'grant_id'),
    ])

    return { likes, follows, rsvps, applications }
  }

  const query = useQuery({
    queryKey: keys.sub('personalization', 'engagement', userId),
    queryFn: () => fetchCounts(userId as string),
    enabled: !!userId,
    staleTime: 60_000,
  })

  return query.data
}

interface SignalRowProps {
  icon: React.ReactNode
  label: string
  value: string
  empty?: boolean
}

function SignalRow({ icon, label, value, empty }: SignalRowProps) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className="w-7 h-7 rounded-lg bg-ktip-sand-100 flex items-center justify-center shrink-0 text-ktip-sand-500">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-ktip-sand-500">{label}</div>
        <div
          className={`text-sm ${empty ? 'text-ktip-sand-400 italic' : 'text-ktip-sand-800'} break-words`}
        >
          {value}
        </div>
      </div>
    </div>
  )
}

/**
 * A read-only account of what the ranker actually knows about this member.
 *
 * Two jobs: it makes the ranking explainable rather than magic, and it is the
 * most effective nudge to fill in a sparse profile — the fields listed here
 * are exactly the ones that are worth nothing when empty.
 */
export function SignalSummary() {
    const { t } = useLingui()
  const auth = useAuth()
  const profile = auth.profile
  const { badges } = useUserBadges(auth.user?.id)
  const counts = useEngagementCounts(auth.user?.id)

  const list = (values: string[] | null | undefined) =>
    values && values.length > 0 ? values.join(', ') : null

  const interests = list(profile?.interests)
  const skills = list(profile?.skills)
  const badgeNames = badges?.length
    ? badges.map((b) => b.badge?.name).filter(Boolean).join(', ')
    : null

  const engagement = counts
    ? [
        counts.likes ? `${counts.likes} liked` : null,
        counts.follows ? `${counts.follows} followed` : null,
        counts.rsvps ? `${counts.rsvps} event RSVP${counts.rsvps === 1 ? '' : 's'}` : null,
        counts.applications
          ? `${counts.applications} grant application${counts.applications === 1 ? '' : 's'}`
          : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : ''

  return (
    <div className="rounded-xl border border-ktip-sand-200 bg-ktip-sand-50/50 p-4">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles size={15} className="text-ktip-ocean-600" />
        <h3 className="text-sm font-semibold text-ktip-sand-900"><Trans>What we know about you</Trans></h3>
      </div>
      <p className="text-xs text-ktip-sand-500 mb-2">
        <Trans>Only these signals feed the ranking, and only the groups you left switched on above.</Trans>
      </p>

      <div className="divide-y divide-ktip-sand-200/70">
        <SignalRow
          icon={<Tag size={14} />}
          label={t`Interests`}
          value={interests || 'Not set — add them on the Profile tab'}
          empty={!interests}
        />
        <SignalRow
          icon={<Briefcase size={14} />}
          label={t`Skills & industry`}
          value={
            [skills, profile?.industry].filter(Boolean).join(' · ') ||
            'Not set — add them on the Profile tab'
          }
          empty={!skills && !profile?.industry}
        />
        <SignalRow
          icon={<MapPin size={14} />}
          label={t`Country`}
          value={profile?.country || 'Not set'}
          empty={!profile?.country}
        />
        <SignalRow
          icon={<Award size={14} />}
          label={t`Badges earned`}
          value={badgeNames || 'None yet'}
          empty={!badgeNames}
        />
        <SignalRow
          icon={<Heart size={14} />}
          label={t`Activity`}
          value={engagement || 'Nothing yet — likes, follows, RSVPs and applications count here'}
          empty={!engagement}
        />
      </div>

      {(!interests || !skills) && (
        <Link
          to="/settings?tab=profile"
          className="inline-block mt-3 text-sm font-medium text-ktip-ocean-600 hover:text-ktip-ocean-700"
        >
          <Trans>Complete your profile →</Trans>
        </Link>
      )}
    </div>
  )
}
