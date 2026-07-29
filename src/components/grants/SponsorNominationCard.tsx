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
import { getInitials, generateAvatarColor } from '../../lib/utils'
import type { Profile } from '../../types'

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
      toast.error('Save a draft before nominating a sponsor')
      return
    }
    try {
      await nominateSponsor({ id: applicationId, user_id: applicantId, sponsor_id: candidate.id })
      toast.success(`${candidate.display_name || 'Sponsor'} has been asked to sponsor this application`)
      setSearch('')
      onChanged?.()
    } catch (err: any) {
      toast.error(err.message || 'Could not nominate sponsor')
    }
  }

  const handleClear = async () => {
    if (!applicationId) return
    try {
      await nominateSponsor({ id: applicationId, user_id: applicantId, sponsor_id: null })
      toast.success('Sponsor removed')
      onChanged?.()
    } catch (err: any) {
      toast.error(err.message || 'Could not remove sponsor')
    }
  }

  return (
    <Card className="mb-6">
      <div className="flex items-center gap-2 mb-1">
        <GraduationCap size={18} className="text-ktip-ocean-600" />
        <h2 className="text-lg font-display font-bold text-ktip-sand-900">Faculty sponsor</h2>
      </div>
      <p className="text-sm text-ktip-sand-600 mb-4">
        Student applications are submitted under a faculty or school sponsor. Nominate someone from
        your institution — they will be asked to accept before this can be submitted.
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
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0"
              style={{ backgroundColor: generateAvatarColor(sponsor.display_name || sponsor.id) }}
            >
              {getInitials(sponsor.display_name || 'User')}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-ktip-sand-900 truncate">
                {sponsor.display_name || 'Unnamed'}
              </p>
              <p className="text-xs flex items-center gap-1 text-ktip-sand-600">
                {sponsorApprovedAt ? (
                  <>
                    <BadgeCheck size={12} className="text-ktip-tropical-600" /> Accepted
                  </>
                ) : (
                  <>
                    <Clock size={12} className="text-ktip-sun-600" /> Awaiting their acceptance
                  </>
                )}
              </p>
            </div>
          </div>

          {!sponsorApprovedAt && (
            <Button variant="ghost" size="sm" icon={<X size={14} />} loading={loading} onClick={handleClear}>
              Change
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search faculty by name"
            icon={<Search size={15} />}
            fullWidth
          />

          {search.length > 1 && (candidates?.length ?? 0) === 0 && (
            <p className="text-sm text-ktip-sand-500">No matching faculty found.</p>
          )}

          <ul className="divide-y divide-ktip-sand-100">
            {candidates?.map((candidate) => (
              <li key={candidate.id} className="py-2 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0"
                    style={{ backgroundColor: generateAvatarColor(candidate.display_name || candidate.id) }}
                  >
                    {getInitials(candidate.display_name || 'User')}
                  </div>
                  <p className="text-sm text-ktip-sand-900 truncate">
                    {candidate.display_name || 'Unnamed'}
                  </p>
                </div>
                <Button size="sm" variant="outline" loading={loading} onClick={() => handleNominate(candidate)}>
                  Nominate
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
