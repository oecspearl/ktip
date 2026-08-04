import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useDirectoryMembers } from '../../hooks/useDirectory'
import { useMemberPanel } from '../../contexts/MemberPanelContext'
import { useAllBadges } from '../../hooks/useBadges'
import { useConnectionCounts, useConnectionStatuses } from '../../hooks/useConnections'
import { useAuth } from '../../contexts/AuthContext'
import { useProfileStatsBatch } from '../../hooks/useProfileStats'
import { usePublicEmployers } from '../../hooks/useEmployerProfile'
import { Briefcase, Building2, Lock, Search, UserX, Users, Trophy } from 'lucide-react'
import { PageHero } from '../../components/layout/PageHero'
import { SkeletonGrid } from '../../components/ui/SkeletonCard'
import { ConnectButton } from '../../components/directory/ConnectButton'
import { BentoCard } from '../../components/ui/BentoCard'
import { AchievementBadge } from '../../components/ui/AchievementBadge'
import {
  CARIBBEAN_COUNTRIES,
  DIRECTORY_ROLE_LABELS,
  ROLE_LABELS,
  SKILL_SUGGESTIONS,
} from '../../lib/constants'
import { usePageTitle } from '../../hooks/usePageTitle'
import { useTutorialAutoStart } from '../../hooks/useTutorialAutoStart'
import { TUTORIAL_IDS } from '../../data/tutorials'
import { debounce } from '../../lib/utils'
import { DiamondAvatar } from '../../components/ui/DiamondAvatar'
import { Plural, Trans, useLingui } from '@lingui/react/macro'
import { resolveCopy } from '../../i18n/copy'

export default function DirectoryPage() {
  const { t , i18n } = useLingui()
  usePageTitle(t`Member Directory`)
  // `?member=<username>` is the shareable form of a member preview — it's what
  // old /profile/<id> links and notification rows redirect to. The segment is
  // a username where there is one and a uuid otherwise; the drawer resolves
  // either, so a stored uuid link keeps working.
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedMember = searchParams.get('member')
  const { memberId, openMember, closeMember } = useMemberPanel()

  // URL and drawer are two views of one value, so the sync lives in ONE effect:
  // as separate effects they raced on mount — the "drop the param when closed"
  // side read the pre-open memberId (still null) and stripped `?member=` before
  // the open landed, closing the drawer the instant a card was clicked.
  // Whichever side changed since the last run wins; refs start at null so a
  // deep-linked `?member=` on mount counts as a URL change.
  const prevRequested = useRef<string | null>(null)
  const prevMemberId = useRef<string | null>(null)

  useEffect(() => {
    const urlChanged = requestedMember !== prevRequested.current
    prevRequested.current = requestedMember
    const panelChanged = memberId !== prevMemberId.current
    prevMemberId.current = memberId

    if (requestedMember === memberId) return

    if (urlChanged) {
      if (requestedMember) openMember(requestedMember)
      else closeMember()
    } else if (panelChanged) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (memberId) next.set('member', memberId)
          else next.delete('member')
          return next
        },
        { replace: true }
      )
    }
  }, [requestedMember, memberId, openMember, closeMember, setSearchParams])

  const [selectedRole, setSelectedRole] = useState<string>('')
  const [selectedCountry, setSelectedCountry] = useState<string>('')
  const [selectedSkill, setSelectedSkill] = useState<string>('')
  const [selectedBadge, setSelectedBadge] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const debouncedSetSearch = useMemo(() => debounce((val: string) => setDebouncedSearch(val), 300), [])

  // The profiles query used to be unbounded; the grid now loads a page at a
  // time and "Load more" raises the cap.
  const PAGE_SIZE = 48
  const [pageLimit, setPageLimit] = useState(PAGE_SIZE)
  useEffect(() => {
    setPageLimit(PAGE_SIZE)
  }, [debouncedSearch, selectedRole, selectedCountry, selectedSkill, selectedBadge])

  const { members, loading } = useDirectoryMembers({
    search: debouncedSearch,
    role: selectedRole,
    country: selectedCountry,
    skill: selectedSkill,
    badge: selectedBadge,
    limit: pageLimit,
  })
  const { badges: allBadges } = useAllBadges()

  // People or organisations. The directory only ever listed people, so a
  // verified SME was findable by whoever happened to work there and not by
  // name — `?tab=businesses` is the other half of the network.
  const tab = searchParams.get('tab') === 'businesses' ? 'businesses' : 'people'
  const setTab = (next: 'people' | 'businesses') => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev)
        if (next === 'businesses') params.set('tab', 'businesses')
        else params.delete('tab')
        return params
      },
      { replace: true }
    )
  }
  const { employers, loading: employersLoading } = usePublicEmployers({ search: debouncedSearch })

  // Members who hide their count are simply absent from this map
  const memberIds = useMemo(() => (members || []).map((m) => m.id), [members])
  const { counts: connectionCounts } = useConnectionCounts(memberIds)
  // One batched RPC for the whole page rather than a request per card.
  const { statsById } = useProfileStatsBatch(memberIds)
  // Same batching for connect-button state — was one query per card.
  const auth = useAuth()
  const { statuses: connectionStatuses, loading: statusesLoading } = useConnectionStatuses(
    auth.user?.id,
    memberIds
  )

  useTutorialAutoStart(TUTORIAL_IDS.DIRECTORY, !loading)

  const clearFilters = () => {
    setSelectedRole('')
    setSelectedCountry('')
    setSelectedSkill('')
    setSelectedBadge('')
    setSearchQuery('')
    setDebouncedSearch('')
  }

  const hasActiveFilters = !!(selectedRole || selectedCountry || selectedSkill || selectedBadge || searchQuery)

  return (
    <>
      <PageHero
        eyebrow={t`Network`}
        title={t`Member Directory`}
        imageSeed="directory"
        breadcrumb={[{ label: t`Home`, href: '/' }, { label: t`Member Directory` }]}
      />

      {/* === Search and Filter Section === */}
      {/* data-spy-off: Businesses and Members are exclusive tabs, so only one
          grid is ever mounted — the rail would be the search bar and that
          grid. The markers stay for the tour. */}
      <div
        id="search"
        data-spy="Search"
        data-spy-off
        className="scroll-mt-24 bg-ktip-sand-50 py-12"
      >
        <div className="w-full max-w-page mx-auto px-4">
          <div className="mb-6">
            <h2 className="text-2xl font-display font-bold text-ktip-sand-900 mb-1">
              {tab === 'businesses'
                ? t`Find an organisation to work with`
                : t`Search for a member to connect with`}
            </h2>
            <p className="text-ktip-ocean-600 italic">
              <Trans>The most powerful way to grow your Caribbean network.</Trans>
            </p>
          </div>

          <div
            className="mb-6 inline-flex rounded-full border border-ktip-sand-200 bg-ktip-cream p-0.5"
            role="tablist"
            aria-label={t`Directory type`}
          >
            {(['people', 'businesses'] as const).map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium capitalize transition-colors ${
                  tab === key
                    ? 'bg-ktip-ocean-600 text-white'
                    : 'text-ktip-sand-600 hover:text-ktip-ocean-700'
                }`}
              >
                {key === 'businesses' ? t`Businesses` : t`People`}
              </button>
            ))}
          </div>

          <div
            className={`grid grid-cols-1 gap-4 mb-3 ${
              tab === 'businesses' ? '' : 'md:grid-cols-3 lg:grid-cols-5'
            }`}
          >
            {/* Search */}
            <div className="relative">
              <Search
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                placeholder={tab === 'businesses' ? t`Search businesses…` : t`Search members...`}
                aria-label={tab === 'businesses' ? t`Search businesses` : t`Search members`}
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.currentTarget.value); debouncedSetSearch(e.currentTarget.value) }}
                className="w-full pl-10 pr-4 py-2.5 border border-ktip-sand-300 bg-ktip-cream rounded-lg focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors text-sm"
              />
            </div>

            {/* Member-only filters. A business has no skills, badges or
                platform role — those are properties of a person. */}
            {tab === 'people' && (
              <>
            {/* Role Filter */}
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.currentTarget.value)}
              className="px-4 py-2.5 border border-ktip-sand-300 bg-ktip-cream rounded-lg focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors text-sm"
            >
              <option value=""><Trans>All Roles</Trans></option>
              {/* Non-admin roles only — see DIRECTORY_ROLE_LABELS. */}
              {Object.entries(DIRECTORY_ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{resolveCopy(i18n, label)}</option>
              ))}
            </select>

            {/* Country Filter */}
            <select
              value={selectedCountry}
              onChange={(e) => setSelectedCountry(e.currentTarget.value)}
              className="px-4 py-2.5 border border-ktip-sand-300 bg-ktip-cream rounded-lg focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors text-sm"
            >
              <option value=""><Trans>All Countries</Trans></option>
              {CARIBBEAN_COUNTRIES.map((country) => (
                <option key={country} value={country}>{country}</option>
              ))}
            </select>

            {/* Skill Filter */}
            <select
              value={selectedSkill}
              onChange={(e) => setSelectedSkill(e.currentTarget.value)}
              className="px-4 py-2.5 border border-ktip-sand-300 bg-ktip-cream rounded-lg focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors text-sm"
            >
              <option value=""><Trans>All Skills</Trans></option>
              {SKILL_SUGGESTIONS.map((skill) => (
                <option key={skill} value={skill}>{skill}</option>
              ))}
            </select>

            {/* Badge Filter */}
            <select
              value={selectedBadge}
              onChange={(e) => setSelectedBadge(e.currentTarget.value)}
              aria-label={t`Filter by badge`}
              className="px-4 py-2.5 border border-ktip-sand-300 bg-ktip-cream rounded-lg focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors text-sm"
            >
              <option value=""><Trans>All Badges</Trans></option>
              {(allBadges || []).map((badge) => (
                <option key={badge.slug} value={badge.slug}>{badge.name}</option>
              ))}
            </select>
              </>
            )}
          </div>

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-sm text-ktip-ocean-600 hover:text-ktip-ocean-700 hover:underline transition-colors"
            >
              <Trans>Clear all filters</Trans>
            </button>
          )}
        </div>
      </div>

      {/* === Businesses Grid Section === */}
      {tab === 'businesses' && (
        <div id="businesses" data-spy="Businesses" className="scroll-mt-24 bg-ktip-sand-50 pb-16">
          <div className="w-full max-w-page mx-auto px-4">
            {employersLoading || !employers ? (
              <SkeletonGrid
                count={6}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-fr"
              />
            ) : employers.length > 0 ? (
              <div>
                <p className="text-sm text-gray-500 mb-6">
                  <Plural value={employers.length} one="Found # business" other="Found # businesses" />
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-fr stagger-children">
                  {employers.map((employer) => (
                    <BentoCard
                      key={employer.id}
                      to={`/org/${employer.slug}`}
                      image={employer.logo_url}
                      imageSeed={employer.slug}
                      eyebrow={employer.industry || t`Organisation`}
                      title={employer.trading_name || employer.legal_name}
                      description={employer.description}
                      meta={
                        <>
                          {employer.country_code}
                          {employer.portfolio_count > 0 && (
                            <span className="flex items-center gap-1.5 mt-1">
                              <Briefcase size={13} className="shrink-0" />
                              <Trans>{employer.portfolio_count} in portfolio</Trans>
                            </span>
                          )}
                        </>
                      }
                      cta={t`View business`}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-16">
                <div className="w-16 h-16 bg-ktip-sand-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Building2 size={32} className="text-gray-400" />
                </div>
                <h3 className="text-2xl font-display font-bold text-ktip-sand-900 mb-2">
                  <Trans>No businesses found</Trans>
                </h3>
                <p className="text-gray-500">
                  <Trans>Only Chamber-verified organisations are listed here.</Trans>
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* === Members Grid Section === */}
      {tab === 'people' && (
      <div id="members" data-spy="Members" className="scroll-mt-24 bg-ktip-sand-50 pb-16">
        <div className="w-full max-w-page mx-auto px-4">
          {loading || !members ? (
            <SkeletonGrid count={6} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-fr" />
          ) : members.length > 0 ? (
            <div>
              <p className="text-sm text-gray-500 mb-6">
                <Plural value={members.length} one="Found # member" other="Found # members" />
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-fr stagger-children">
                {members.map((member) => {
                  // Locked profiles get the 083 teaser on the card too — name,
                  // photo, country — not just behind the click. The columns
                  // still arrive (the list reads the table), but showing
                  // skills and standing on a card whose profile is closed
                  // would make the lock look decorative.
                  const isLocked = member.profile_visibility === 'private'
                  return (
                  <BentoCard
                    key={member.id}
                    to={`/directory?member=${member.username || member.id}`}
                    imageSeed={member.id}
                    eyebrow={
                      member.roles?.length > 0
                        ? member.roles.slice(0, 2).map((r: string) => resolveCopy(i18n, ROLE_LABELS[r] || r)).join(', ')
                        : t`Member`
                    }
                    title={
                      <span className="flex items-center gap-3">
                        <DiamondAvatar
                          src={member.avatar_url}
                          name={member.display_name || t`Member`}
                          size={40}
                          colorClass="bg-white/20 backdrop-blur-sm"
                          frameClassName="ring-2 ring-white/60"
                        />
                        <span className="truncate">{member.display_name || t`Anonymous`}</span>
                      </span>
                    }
                    meta={
                      <>
                        {member.country && <>{member.country}</>}
                        {!isLocked && member.country && member.skills?.length > 0 && <> · </>}
                        {!isLocked && member.skills?.length > 0 && <>{member.skills[0]}</>}
                        {/* Said on the card, so the closed profile behind it
                            is not a surprise after the click. */}
                        {isLocked && (
                          <span className="flex items-center gap-1.5 mt-1">
                            <Lock size={13} className="shrink-0" />
                            <Trans>Private profile</Trans>
                          </span>
                        )}
                        {!isLocked && connectionCounts?.[member.id] !== undefined && (
                          <span className="flex items-center gap-1.5 mt-1">
                            <Users size={13} className="shrink-0" />
                            {connectionCounts[member.id]}{' '}
                            {connectionCounts[member.id] === 1 ? t`connection` : t`connections`}
                          </span>
                        )}
                        {/* Only once there is something to show — "Newcomer,
                            0 pts" on every new member turns the directory
                            into a scoreboard of who has not started. */}
                        {!isLocked && statsById[member.id]?.badge_count > 0 && (
                          <span className="flex items-center gap-1.5 mt-1">
                            <Trophy size={13} className="shrink-0" />
                            <Trans>{statsById[member.id].rank_name} · {statsById[member.id].points} pts</Trans>
                          </span>
                        )}
                        {!isLocked && (member.user_badges?.length ?? 0) > 0 && (
                          <span className="flex flex-wrap gap-1.5 mt-2">
                            {member.user_badges!.slice(0, 3).map((ub) => (
                              <AchievementBadge key={ub.id} userBadge={ub} />
                            ))}
                            {member.user_badges!.length > 3 && (
                              <span className="text-white/80 self-center">
                                +{member.user_badges!.length - 3}
                              </span>
                            )}
                          </span>
                        )}
                      </>
                    }
                    cta={t`View Profile`}
                  >
                    <ConnectButton
                      otherUserId={member.id}
                      size="sm"
                      status={connectionStatuses?.[member.id] ?? { state: 'none', connection: null }}
                      statusPending={statusesLoading}
                    />
                  </BentoCard>
                  )
                })}
              </div>

              {members.length >= pageLimit && (
                <div className="text-center mt-8">
                  <button
                    onClick={() => setPageLimit((l) => l + PAGE_SIZE)}
                    className="px-6 py-2.5 text-sm font-bold rounded-lg btn-brand"
                  >
                    <Trans>Load more members</Trans>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-16">
              <div className="w-16 h-16 bg-ktip-sand-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <UserX size={32} className="text-gray-400" />
              </div>
              <h3 className="text-2xl font-display font-bold text-ktip-sand-900 mb-2">
                <Trans>No members found</Trans>
              </h3>
              <p className="text-gray-500">
                {hasActiveFilters
                  ? t`Try adjusting your filters or search query`
                  : t`No members have joined yet`}
              </p>
            </div>
          )}
        </div>
      </div>
      )}
    </>
  )
}
