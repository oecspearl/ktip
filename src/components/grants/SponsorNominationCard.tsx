import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BadgeCheck, Clock, GraduationCap, Search, X } from 'lucide-react'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { supabase } from '../../lib/supabase'
import { keys } from '../../queries/keys'
import { useToast } from '../../contexts/ToastContext'
import { useApplyForGrant } from '../../hooks/useGrants'
import type { Profile } from '../../types'
import { DiamondAvatar } from '../ui/DiamondAvatar'
import { Trans, useLingui } from '@lingui/react/macro'

interface SponsorNominationCardProps {
  applicationId: string | undefined
  applicantId: string
  sponsorId: string | null
  sponsorApprovedAt: string | null
  onChanged?: () => void
}

/**
 * Student side of the sponsorship handshake.
 *
 * A student holds grant:view but never grant:apply, so the only way an
 * application leaves draft is with a faculty sponsor who has accepted it. The
 * candidate list is filtered by role for convenience; the database re-checks
 * that the nominee actually holds grant:sponsor when the application is
 * submitted, so a stale or hand-crafted nomination cannot get through.
 */
export function SponsorNominationCard({
  applicationId,
  applicantId,
  sponsorId,
  sponsorApprovedAt,
  onChanged,
}: SponsorNominationCardProps) {
    const { t } = useLingui()
  const toast = useToast()
  const { nominateSponsor, loading } = useApplyForGrant()

  const [search, setSearch] = useState('')

  const { data: candidates } = useQuery({
    queryKey: keys.list('sponsors', { search }),
    queryFn: async (): Promise<Profile[]> => {
      let request = (supabase as any)
        .from('profiles')
        .select('*')
        .overlaps('roles', ['faculty', 'educational_partner'])
        .limit(10)

      if (search) request = request.ilike('display_name', `%${search}%`)

      const { data, error } = await request
      if (error) throw error
      return (data as Profile[]) || []
    },
    enabled: !sponsorId && search.length > 1,
  })

  const { data: sponsor } = useQuery({
    queryKey: keys.detail('sponsors', sponsorId ?? undefined),
    queryFn: async (): Promise<Profile | null> => {
      const { data, error } = await (supabase as any)
        .from('profiles')
        .select('*')
        .eq('id', sponsorId)
        .maybeSingle()

      if (error) throw error
      return (data as Profile) || null
    },
    enabled: !!sponsorId,
  })

  const handleNominate = async (candidate: Profile) => {
    if (!applicationId) {
      toast.error(t`Save a draft before nominating a sponsor`)
      return
    }
    try {
      await nominateSponsor({ id: applicationId, user_id: applicantId, sponsor_id: candidate.id })
      const name = candidate.display_name || t`Sponsor`
      toast.success(t`${name} has been asked to sponsor this application`)
      setSearch('')
      onChanged?.()
    } catch (err: any) {
      toast.error(err.message || t`Could not nominate sponsor`)
    }
  }

  const handleClear = async () => {
    if (!applicationId) return
    try {
      await nominateSponsor({ id: applicationId, user_id: applicantId, sponsor_id: null })
      toast.success(t`Sponsor removed`)
      onChanged?.()
    } catch (err: any) {
      toast.error(err.message || t`Could not remove sponsor`)
    }
  }

  return (
    <Card className="mb-6">
      <div className="flex items-center gap-2 mb-1">
        <GraduationCap size={18} className="text-ktip-ocean-600" />
        <h2 className="text-lg font-display font-bold text-ktip-sand-900"><Trans>Faculty sponsor</Trans></h2>
      </div>
      <p className="text-sm text-ktip-sand-600 mb-4">
        <Trans>Student applications are submitted under a faculty or school sponsor. Nominate someone from your institution — they will be asked to accept before this can be submitted.</Trans>
      </p>

      {sponsorId && sponsor ? (
        <div
          className={`flex items-center justify-between gap-3 p-3 rounded-xl border ${
            sponsorApprovedAt
              ? 'bg-ktip-tropical-50 border-ktip-tropical-200'
              : 'bg-ktip-sun-50 border-ktip-sun-200'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <DiamondAvatar name={sponsor.display_name || 'User'} size={36} />
            <div className="min-w-0">
              <p className="text-sm font-medium text-ktip-sand-900 truncate">
                {sponsor.display_name || t`Unnamed`}
              </p>
              <p className="text-xs flex items-center gap-1 text-ktip-sand-600">
                {sponsorApprovedAt ? (
                  <>
                    <BadgeCheck size={12} className="text-ktip-tropical-600" /> <Trans>Accepted</Trans>
                  </>
                ) : (
                  <>
                    <Clock size={12} className="text-ktip-sun-600" /> <Trans>Awaiting their acceptance</Trans>
                  </>
                )}
              </p>
            </div>
          </div>

          {!sponsorApprovedAt && (
            <Button variant="ghost" size="sm" icon={<X size={14} />} loading={loading} onClick={handleClear}>
              <Trans>Change</Trans>
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t`Search faculty by name`}
            icon={<Search size={15} />}
            fullWidth
          />

          {search.length > 1 && (candidates?.length ?? 0) === 0 && (
            <p className="text-sm text-ktip-sand-500"><Trans>No matching faculty found.</Trans></p>
          )}

          <ul className="divide-y divide-ktip-sand-100">
            {candidates?.map((candidate) => (
              <li key={candidate.id} className="py-2 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <DiamondAvatar name={candidate.display_name || 'User'} size={32} />
                  <p className="text-sm text-ktip-sand-900 truncate">
                    {candidate.display_name || t`Unnamed`}
                  </p>
                </div>
                <Button size="sm" variant="outline" loading={loading} onClick={() => handleNominate(candidate)}>
                  <Trans>Nominate</Trans>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}

export default SponsorNominationCard
