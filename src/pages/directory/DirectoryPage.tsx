import { useMemo, useState } from 'react'
import { useDirectoryMembers } from '../../hooks/useDirectory'
import { useAllBadges } from '../../hooks/useBadges'
import { useConnectionCounts } from '../../hooks/useConnections'
import { Search, UserX, User, Users } from 'lucide-react'
import { PageHero } from '../../components/layout/PageHero'
import { SkeletonGrid } from '../../components/ui/SkeletonCard'
import { ConnectButton } from '../../components/directory/ConnectButton'
import { BentoCard } from '../../components/ui/BentoCard'
import { AchievementBadge } from '../../components/ui/AchievementBadge'
import { CARIBBEAN_COUNTRIES, ROLE_LABELS, SKILL_SUGGESTIONS } from '../../lib/constants'
import { usePageTitle } from '../../hooks/usePageTitle'
import { debounce } from '../../lib/utils'

export default function DirectoryPage() {
  usePageTitle('Member Directory')
  const [selectedRole, setSelectedRole] = useState<string>('')
  const [selectedCountry, setSelectedCountry] = useState<string>('')
  const [selectedSkill, setSelectedSkill] = useState<string>('')
  const [selectedBadge, setSelectedBadge] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const debouncedSetSearch = useMemo(() => debounce((val: string) => setDebouncedSearch(val), 300), [])

  const { members, loading } = useDirectoryMembers({
    search: debouncedSearch,
    role: selectedRole,
    country: selectedCountry,
    skill: selectedSkill,
    badge: selectedBadge,
  })
  const { badges: allBadges } = useAllBadges()

  // Members who hide their count are simply absent from this map
  const memberIds = useMemo(() => (members || []).map((m) => m.id), [members])
  const { counts: connectionCounts } = useConnectionCounts(memberIds)

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
        eyebrow="Network"
        title="Member Directory"
        imageSeed="directory"
        breadcrumb={[{ label: 'Home', href: '/' }, { label: 'Member Directory' }]}
      />

      {/* === Search and Filter Section === */}
      <div className="bg-ktip-sand-50 py-12">
        <div className="w-full max-w-[calc(50vw+48rem)] mx-auto px-4 max-w-5xl">
          <div className="mb-8">
            <h2 className="text-2xl font-display font-bold text-ktip-sand-900 mb-1">
              Search for a member to connect with
            </h2>
            <p className="text-ktip-ocean-600 italic">
              The most powerful way to grow your Caribbean network.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-3">
            {/* Search */}
            <div className="relative">
              <Search
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                placeholder="Search members..."
                aria-label="Search members"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.currentTarget.value); debouncedSetSearch(e.currentTarget.value) }}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 bg-ktip-cream rounded-lg focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors text-sm"
              />
            </div>

            {/* Role Filter */}
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.currentTarget.value)}
              className="px-4 py-2.5 border border-gray-300 bg-ktip-cream rounded-lg focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors text-sm"
            >
              <option value="">All Roles</option>
              {Object.entries(ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>

            {/* Country Filter */}
            <select
              value={selectedCountry}
              onChange={(e) => setSelectedCountry(e.currentTarget.value)}
              className="px-4 py-2.5 border border-gray-300 bg-ktip-cream rounded-lg focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors text-sm"
            >
              <option value="">All Countries</option>
              {CARIBBEAN_COUNTRIES.map((country) => (
                <option key={country} value={country}>{country}</option>
              ))}
            </select>

            {/* Skill Filter */}
            <select
              value={selectedSkill}
              onChange={(e) => setSelectedSkill(e.currentTarget.value)}
              className="px-4 py-2.5 border border-gray-300 bg-ktip-cream rounded-lg focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors text-sm"
            >
              <option value="">All Skills</option>
              {SKILL_SUGGESTIONS.map((skill) => (
                <option key={skill} value={skill}>{skill}</option>
              ))}
            </select>

            {/* Badge Filter */}
            <select
              value={selectedBadge}
              onChange={(e) => setSelectedBadge(e.currentTarget.value)}
              aria-label="Filter by badge"
              className="px-4 py-2.5 border border-gray-300 bg-ktip-cream rounded-lg focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors text-sm"
            >
              <option value="">All Badges</option>
              {(allBadges || []).map((badge) => (
                <option key={badge.slug} value={badge.slug}>{badge.name}</option>
              ))}
            </select>
          </div>

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-sm text-ktip-ocean-600 hover:text-ktip-ocean-700 hover:underline transition-colors"
            >
              Clear all filters
            </button>
          )}
        </div>
      </div>

      {/* === Members Grid Section === */}
      <div className="bg-ktip-sand-50 pb-16">
        <div className="w-full max-w-[calc(50vw+48rem)] mx-auto px-4 max-w-5xl">
          {loading || !members ? (
            <SkeletonGrid count={6} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-fr" />
          ) : members.length > 0 ? (
            <div>
              <p className="text-sm text-gray-500 mb-6">
                Found {members.length} member{members.length !== 1 ? 's' : ''}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-fr stagger-children">
                {members.map((member) => (
                  <BentoCard
                    key={member.id}
                    to={`/profile/${member.id}`}
                    imageSeed={member.id}
                    eyebrow={
                      member.roles?.length > 0
                        ? member.roles.slice(0, 2).map((r: string) => ROLE_LABELS[r] || r).join(', ')
                        : 'Member'
                    }
                    title={
                      <span className="flex items-center gap-3">
                        {member.avatar_url ? (
                          <img
                            src={member.avatar_url!}
                            alt=""
                            className="w-10 h-10 rounded-full object-cover ring-2 ring-white/60 shrink-0"
                          />
                        ) : (
                          <span className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-full ring-2 ring-white/60 flex items-center justify-center text-base font-bold text-white shrink-0">
                            {member.display_name?.charAt(0).toUpperCase() || <User size={18} />}
                          </span>
                        )}
                        <span className="truncate">{member.display_name || 'Anonymous'}</span>
                      </span>
                    }
                    meta={
                      <>
                        {member.country && <>{member.country}</>}
                        {member.country && member.skills?.length > 0 && <> · </>}
                        {member.skills?.length > 0 && <>{member.skills[0]}</>}
                        {connectionCounts?.[member.id] !== undefined && (
                          <span className="flex items-center gap-1.5 mt-1">
                            <Users size={13} className="shrink-0" />
                            {connectionCounts[member.id]}{' '}
                            {connectionCounts[member.id] === 1 ? 'connection' : 'connections'}
                          </span>
                        )}
                        {(member.user_badges?.length ?? 0) > 0 && (
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
                    cta="View Profile"
                  >
                    <ConnectButton otherUserId={member.id} size="sm" />
                  </BentoCard>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-16">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <UserX size={32} className="text-gray-400" />
              </div>
              <h3 className="text-2xl font-display font-bold text-ktip-sand-900 mb-2">
                No members found
              </h3>
              <p className="text-gray-500">
                {hasActiveFilters
                  ? 'Try adjusting your filters or search query'
                  : 'No members have joined yet'}
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
