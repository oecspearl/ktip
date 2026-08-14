import { useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Building2, Search, Trash2, UserPlus } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Toggle } from '../../components/ui/Toggle'
import { DiamondAvatar } from '../../components/ui/DiamondAvatar'
import { PageHero } from '../../components/layout/PageHero'
import { usePageTitle } from '../../hooks/usePageTitle'
import { useToast } from '../../contexts/ToastContext'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { keys } from '../../queries/keys'
import { useMyEmployer, useEmployerProfileMutations } from '../../hooks/useEmployerProfile'
import { useEmployerRoster, useEmployerMemberMutations } from '../../hooks/useEmployerMembers'
import type { EmployerMemberRole, Profile } from '../../types'
import { Trans, useLingui } from '@lingui/react/macro'

const ROLE_OPTIONS: EmployerMemberRole[] = ['owner', 'admin', 'recruiter']

/**
 * Who belongs to the organisation, and whether they may engage (migration 111).
 *
 * `employer_members` has existed since 058 and never had a screen: its SELECT
 * policy embedded a self-referencing EXISTS and raised 42P17, so nothing could
 * read it from a browser. 111 fixed that and backfilled the registrant as
 * 'owner', which is what makes this page show anything on day one.
 *
 * The master switch sits directly above the list it governs. "These people
 * cannot apply" only reads correctly next to "these people" — and putting it on
 * the Business profile tab would have buried it behind that page's single Save
 * button, which is the wrong shape for a control that takes effect at once.
 *
 * `embedded` renders the same page as a dashboard panel (see TeamTab).
 */
export default function OrgMembersPage({ embedded = false }: { embedded?: boolean }) {
  const { t } = useLingui()
  const auth = useAuth()
  const toast = useToast()
  usePageTitle(t`Team`)

  const { employer, loading } = useMyEmployer(auth.user?.id)
  const { roster, loading: rosterLoading } = useEmployerRoster(employer?.id)
  const { setMemberEngagement, savingEngagement } = useEmployerProfileMutations()
  const { addMember, addingMember, setMemberRole, removeMember } = useEmployerMemberMutations()

  const [search, setSearch] = useState('')

  // Mirrors can_manage_employer(): registrant, owner/admin on the roster, or
  // OECS. A hint for what to render — the RPCs re-check all of it.
  const myRole = roster.find((m) => m.user_id === auth.user?.id)?.role
  const canManage =
    auth.isAdmin ||
    employer?.created_by === auth.user?.id ||
    myRole === 'owner' ||
    myRole === 'admin'
  const isOwner = auth.isAdmin || employer?.created_by === auth.user?.id || myRole === 'owner'

  const ownerCount = useMemo(() => roster.filter((m) => m.role === 'owner').length, [roster])

  const rosterIds = useMemo(() => new Set(roster.map((m) => m.user_id)), [roster])

  const { data: candidates } = useQuery({
    queryKey: keys.list('employer-member-search', { search }),
    queryFn: async (): Promise<Profile[]> => {
      const { data, error } = await (supabase as any)
        .from('profiles')
        .select('*')
        .ilike('display_name', `%${search}%`)
        .limit(10)
      if (error) throw error
      return (data as Profile[]) || []
    },
    enabled: canManage && search.trim().length > 1,
  })

  if (!auth.loading && !auth.user) return <Navigate to="/login" replace />

  const handleToggleEngagement = async (allow: boolean) => {
    if (!employer) return
    try {
      await setMemberEngagement({ employerId: employer.id, allow })
      toast.success(
        allow
          ? t`Your team can apply, join and register again`
          : t`Your team can no longer apply, join or register`
      )
    } catch (err: any) {
      toast.error(err.message || t`Could not change that setting`)
    }
  }

  const handleAdd = async (userId: string) => {
    if (!employer) return
    try {
      await addMember({ employerId: employer.id, userId })
      setSearch('')
      toast.success(t`Added to your team`)
    } catch (err: any) {
      toast.error(err.message || t`Could not add that person`)
    }
  }

  const handleRole = async (memberId: string, role: EmployerMemberRole) => {
    try {
      await setMemberRole({ memberId, role })
      toast.success(t`Role updated`)
    } catch (err: any) {
      toast.error(err.message || t`Could not change that role`)
    }
  }

  const handleRemove = async (memberId: string) => {
    try {
      await removeMember(memberId)
      toast.success(t`Removed from your team`)
    } catch (err: any) {
      toast.error(err.message || t`Could not remove that person`)
    }
  }

  return (
    <>
      {!embedded && (
        <PageHero
          compact
          eyebrow={t`Your organisation`}
          title={t`Team`}
          subtitle={t`Who belongs to your organisation, and what they may take part in.`}
          imageSeed="org-team"
          breadcrumb={[
            { label: t`Home`, href: '/' },
            { label: t`Dashboard`, href: '/dashboard' },
            { label: t`Team` },
          ]}
        />
      )}

      <div className={embedded ? 'max-w-3xl' : 'mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8'}>
        {embedded && (
          <div className="mb-6">
            <h2 className="font-display text-xl font-bold text-ktip-sand-900">
              <Trans>Team</Trans>
            </h2>
            <p className="text-sm text-ktip-sand-600">
              <Trans>Who belongs to your organisation, and what they may take part in.</Trans>
            </p>
          </div>
        )}

        {loading && <p className="text-ktip-sand-500"><Trans>Loading…</Trans></p>}

        {!loading && !employer && (
          <Card>
            <div className="mb-1 flex items-center gap-2">
              <Building2 size={18} className="text-ktip-ocean-600" />
              <h2 className="font-display text-lg font-bold text-ktip-sand-900">
                <Trans>Register your business first</Trans>
              </h2>
            </div>
            <p className="mb-5 text-sm text-ktip-sand-600">
              <Trans>A team hangs off a registered organisation. Registration takes a few minutes.</Trans>
            </p>
            <Link to="/sme/verification">
              <Button><Trans>Register with your Chamber</Trans></Button>
            </Link>
          </Card>
        )}

        {!loading && employer && (
          <div className="space-y-6">
            {/* Saved on change, not behind a Save button: this takes effect
                immediately for everyone below it, and a control that quietly
                waits for a form submit would misrepresent that. */}
            <Card>
              <Toggle
                checked={employer.allow_member_engagement}
                onChange={handleToggleEngagement}
                disabled={!canManage || savingEngagement}
                label={t`Let our team take part`}
                description={t`When this is off, everyone below can still browse KTIP but cannot apply for grants, ask to join projects or register for events. Owners and admins are not affected. You can still open one of your own projects, grants or events to the team when you publish it.`}
              />
              {!canManage && (
                <p className="mt-2 text-xs text-ktip-sand-500">
                  <Trans>Only an owner or admin of your organisation can change this.</Trans>
                </p>
              )}
            </Card>

            <Card>
              <h2 className="mb-1 font-display text-lg font-bold text-ktip-sand-900">
                {employer.trading_name || employer.legal_name}
              </h2>
              <p className="mb-5 text-sm text-ktip-sand-600">
                <Trans>
                  Owners and admins can manage this team. Recruiters are ordinary members.
                </Trans>
              </p>

              {rosterLoading && <p className="text-sm text-ktip-sand-500"><Trans>Loading…</Trans></p>}

              <ul className="divide-y divide-ktip-sand-100">
                {roster.map((member) => {
                  // The database refuses this too; disabling it here is so the
                  // reason arrives before the click rather than after.
                  const lastOwner = member.role === 'owner' && ownerCount <= 1
                  const isSelf = member.user_id === auth.user?.id
                  return (
                    <li key={member.id} className="flex items-center gap-3 py-3">
                      <DiamondAvatar
                        src={member.avatar_url || undefined}
                        name={member.display_name || ''}
                        size={40}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ktip-sand-800">
                          {member.display_name}
                        </p>
                        {member.country && (
                          <p className="truncate text-xs text-ktip-sand-500">{member.country}</p>
                        )}
                      </div>

                      {canManage ? (
                        <select
                          value={member.role}
                          onChange={(e) => handleRole(member.id, e.target.value as EmployerMemberRole)}
                          disabled={isSelf || lastOwner || (member.role === 'owner' && !isOwner)}
                          className="rounded-lg border border-ktip-sand-200 bg-ktip-sand-50 px-2 py-1 text-sm text-ktip-sand-700 disabled:opacity-50"
                        >
                          {ROLE_OPTIONS.map((role) => (
                            <option key={role} value={role} disabled={role === 'owner' && !isOwner}>
                              {role === 'owner' ? t`Owner` : role === 'admin' ? t`Admin` : t`Member`}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-sm text-ktip-sand-600">
                          {member.role === 'owner' ? t`Owner` : member.role === 'admin' ? t`Admin` : t`Member`}
                        </span>
                      )}

                      {canManage && (
                        <button
                          type="button"
                          onClick={() => handleRemove(member.id)}
                          disabled={lastOwner}
                          aria-label={t`Remove from team`}
                          title={lastOwner ? t`Appoint another owner first` : t`Remove from team`}
                          className="rounded-lg p-2 text-ktip-sand-500 hover:bg-ktip-sand-100 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>

              {!rosterLoading && roster.length === 0 && (
                <p className="text-sm text-ktip-sand-500">
                  <Trans>Nobody has been added yet.</Trans>
                </p>
              )}
            </Card>

            {canManage && (
              <Card>
                <h3 className="mb-1 font-display text-base font-bold text-ktip-sand-900">
                  <Trans>Add someone</Trans>
                </h3>
                <p className="mb-4 text-sm text-ktip-sand-600">
                  <Trans>Search KTIP members by name. They join as an ordinary member; change the role afterwards.</Trans>
                </p>

                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t`Search by name`}
                  icon={<Search size={16} />}
                />

                {search.trim().length > 1 && (
                  <ul className="mt-3 divide-y divide-ktip-sand-100">
                    {(candidates || [])
                      .filter((p) => !rosterIds.has(p.id))
                      .map((person) => (
                        <li key={person.id} className="flex items-center gap-3 py-2">
                          <DiamondAvatar
                            src={person.avatar_url || undefined}
                            name={person.display_name || ''}
                            size={32}
                          />
                          <span className="min-w-0 flex-1 truncate text-sm text-ktip-sand-800">
                            {person.display_name}
                          </span>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={addingMember}
                            onClick={() => handleAdd(person.id)}
                            icon={<UserPlus size={14} />}
                          >
                            <Trans>Add</Trans>
                          </Button>
                        </li>
                      ))}
                    {candidates && candidates.filter((p) => !rosterIds.has(p.id)).length === 0 && (
                      <li className="py-2 text-sm text-ktip-sand-500">
                        <Trans>Nobody new by that name.</Trans>
                      </li>
                    )}
                  </ul>
                )}
              </Card>
            )}
          </div>
        )}
      </div>
    </>
  )
}
