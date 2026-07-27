import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useDirectoryMembers } from '../../hooks/useDirectory'
import { Search, UserX, User, ChevronRight } from 'lucide-react'
import { SkeletonGrid } from '../../components/ui/SkeletonCard'
import { CARIBBEAN_COUNTRIES, ROLE_LABELS, SKILL_SUGGESTIONS } from '../../lib/constants'
import { usePageTitle } from '../../hooks/usePageTitle'
import { debounce } from '../../lib/utils'

export default function DirectoryPage() {
  usePageTitle('Member Directory')
  const [selectedRole, setSelectedRole] = useState<string>('')
  const [selectedCountry, setSelectedCountry] = useState<string>('')
  const [selectedSkill, setSelectedSkill] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const debouncedSetSearch = useMemo(() => debounce((val: string) => setDebouncedSearch(val), 300), [])

  const { members, loading } = useDirectoryMembers({
    search: debouncedSearch,
    role: selectedRole,
    country: selectedCountry,
    skill: selectedSkill,
  })

  const clearFilters = () => {
    setSelectedRole('')
    setSelectedCountry('')
    setSelectedSkill('')
    setSearchQuery('')
    setDebouncedSearch('')
  }

  const hasActiveFilters = !!(selectedRole || selectedCountry || selectedSkill || searchQuery)

  return (
    <>
      {/* === Dark Hero Header Band === */}
      <div className="bg-gray-800 min-h-[180px] flex items-center">
        <div className="container mx-auto px-4 py-10">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <h1 className="text-3xl md:text-4xl font-display font-bold text-white">
              Member Directory
            </h1>
            <nav className="text-sm text-gray-400" aria-label="Breadcrumb">
              <Link to="/" className="hover:text-white transition-colors">Home</Link>
              <span className="mx-2">
                <ChevronRight size={12} className="inline" />
              </span>
              <span className="text-gray-300">Member Directory</span>
            </nav>
          </div>
        </div>
      </div>

      {/* === Search and Filter Section === */}
      <div className="bg-white py-12">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="mb-8">
            <h2 className="text-2xl font-display font-bold text-ktip-sand-900 mb-1">
              Search for a member to connect with
            </h2>
            <p className="text-ktip-ocean-600 italic">
              The most powerful way to grow your Caribbean network.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-3">
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
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 bg-white rounded-lg focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors text-sm"
              />
            </div>

            {/* Role Filter */}
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.currentTarget.value)}
              className="px-4 py-2.5 border border-gray-300 bg-white rounded-lg focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors text-sm"
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
              className="px-4 py-2.5 border border-gray-300 bg-white rounded-lg focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors text-sm"
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
              className="px-4 py-2.5 border border-gray-300 bg-white rounded-lg focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors text-sm"
            >
              <option value="">All Skills</option>
              {SKILL_SUGGESTIONS.map((skill) => (
                <option key={skill} value={skill}>{skill}</option>
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
      <div className="bg-white pb-16">
        <div className="container mx-auto px-4 max-w-5xl">
          {loading || !members ? (
            <SkeletonGrid count={6} />
          ) : members.length > 0 ? (
            <div>
              <p className="text-sm text-gray-500 mb-6">
                Found {members.length} member{members.length !== 1 ? 's' : ''}
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {members.map((member) => (
                  <div key={member.id} className="flex bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                    {/* Avatar */}
                    <div className="flex items-center justify-center px-5 py-5 shrink-0">
                      {member.avatar_url ? (
                        <img
                          src={member.avatar_url!}
                          alt={member.display_name || 'Member'}
                          className="w-20 h-20 rounded-full object-cover border-2 border-gray-200"
                        />
                      ) : (
                        <div className="w-20 h-20 bg-ktip-ocean-100 rounded-full border-2 border-gray-200 flex items-center justify-center text-2xl font-bold text-ktip-ocean-700">
                          {member.display_name?.charAt(0).toUpperCase() || <User size={28} />}
                        </div>
                      )}
                    </div>

                    {/* Metadata */}
                    <div className="flex-1 py-4 pr-3 min-w-0">
                      <h3 className="text-lg font-display font-bold text-ktip-ocean-600 truncate mb-2">
                        {member.display_name || 'Anonymous'}
                      </h3>
                      <div className="space-y-1 text-sm">
                        {member.roles?.length > 0 && (
                          <div className="flex gap-1">
                            <span className="text-gray-400 shrink-0">Role:</span>
                            <span className="text-ktip-sand-700 truncate">
                              {member.roles.slice(0, 2).map((r: string) => ROLE_LABELS[r] || r).join(', ')}
                            </span>
                          </div>
                        )}
                        {member.country && (
                          <div className="flex gap-1">
                            <span className="text-gray-400 shrink-0">Country:</span>
                            <span className="text-ktip-sand-700">{member.country}</span>
                          </div>
                        )}
                        {member.skills?.length > 0 && (
                          <div className="flex gap-1">
                            <span className="text-gray-400 shrink-0">Skill:</span>
                            <span className="text-ktip-sand-700 truncate">{member.skills[0]}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Vertical "CONNECT NOW" tab */}
                    <Link
                      to={`/profile/${member.id}`}
                      className="w-12 bg-ktip-ocean-600 hover:bg-ktip-ocean-700 transition-colors flex items-center justify-center shrink-0"
                      aria-label={`Connect with ${member.display_name || 'member'}`}
                    >
                      <span
                        className="text-[11px] font-bold text-white uppercase tracking-widest whitespace-nowrap"
                        style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                      >
                        Connect Now
                      </span>
                    </Link>
                  </div>
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
