import { createSignal, Show, For, Suspense } from 'solid-js'
import { A } from '@solidjs/router'
import { MainLayout } from '../../components/layout/MainLayout'
import { useDirectoryMembers } from '../../hooks/useDirectory'
import { Search, UserX, User, ChevronRight } from 'lucide-solid'
import { SkeletonGrid } from '../../components/ui/SkeletonCard'
import { CARIBBEAN_COUNTRIES, ROLE_LABELS, SKILL_SUGGESTIONS } from '../../lib/constants'
import { usePageTitle } from '../../hooks/usePageTitle'
import { debounce } from '../../lib/utils'

export default function DirectoryPage() {
  usePageTitle(() => 'Member Directory')
  const [selectedRole, setSelectedRole] = createSignal<string>('')
  const [selectedCountry, setSelectedCountry] = createSignal<string>('')
  const [selectedSkill, setSelectedSkill] = createSignal<string>('')
  const [searchQuery, setSearchQuery] = createSignal('')
  const [debouncedSearch, setDebouncedSearch] = createSignal('')
  const debouncedSetSearch = debounce((val: string) => setDebouncedSearch(val), 300)

  const { members } = useDirectoryMembers({
    get search() {
      return debouncedSearch()
    },
    get role() {
      return selectedRole()
    },
    get country() {
      return selectedCountry()
    },
    get skill() {
      return selectedSkill()
    },
  })

  const clearFilters = () => {
    setSelectedRole('')
    setSelectedCountry('')
    setSelectedSkill('')
    setSearchQuery('')
    setDebouncedSearch('')
  }

  const hasActiveFilters = () =>
    selectedRole() || selectedCountry() || selectedSkill() || searchQuery()

  return (
    <MainLayout>
      {/* === Dark Hero Header Band === */}
      <div class="bg-gray-800 min-h-[180px] flex items-center">
        <div class="container mx-auto px-4 py-10">
          <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <h1 class="text-3xl md:text-4xl font-display font-bold text-white">
              Member Directory
            </h1>
            <nav class="text-sm text-gray-400" aria-label="Breadcrumb">
              <A href="/" class="hover:text-white transition-colors">Home</A>
              <span class="mx-2">
                <ChevronRight size={12} class="inline" />
              </span>
              <span class="text-gray-300">Member Directory</span>
            </nav>
          </div>
        </div>
      </div>

      {/* === Search and Filter Section === */}
      <div class="bg-white py-12">
        <div class="container mx-auto px-4 max-w-5xl">
          <div class="mb-8">
            <h2 class="text-2xl font-display font-bold text-ktip-sand-900 mb-1">
              Search for a member to connect with
            </h2>
            <p class="text-ktip-ocean-600 italic">
              The most powerful way to grow your Caribbean network.
            </p>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-3">
            {/* Search */}
            <div class="relative">
              <Search
                size={18}
                class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                placeholder="Search members..."
                aria-label="Search members"
                value={searchQuery()}
                onInput={(e) => { setSearchQuery(e.currentTarget.value); debouncedSetSearch(e.currentTarget.value) }}
                class="w-full pl-10 pr-4 py-2.5 border border-gray-300 bg-white rounded-lg focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors text-sm"
              />
            </div>

            {/* Role Filter */}
            <select
              value={selectedRole()}
              onChange={(e) => setSelectedRole(e.currentTarget.value)}
              class="px-4 py-2.5 border border-gray-300 bg-white rounded-lg focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors text-sm"
            >
              <option value="">All Roles</option>
              <For each={Object.entries(ROLE_LABELS)}>
                {([value, label]) => (
                  <option value={value}>{label}</option>
                )}
              </For>
            </select>

            {/* Country Filter */}
            <select
              value={selectedCountry()}
              onChange={(e) => setSelectedCountry(e.currentTarget.value)}
              class="px-4 py-2.5 border border-gray-300 bg-white rounded-lg focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors text-sm"
            >
              <option value="">All Countries</option>
              <For each={CARIBBEAN_COUNTRIES}>
                {(country) => <option value={country}>{country}</option>}
              </For>
            </select>

            {/* Skill Filter */}
            <select
              value={selectedSkill()}
              onChange={(e) => setSelectedSkill(e.currentTarget.value)}
              class="px-4 py-2.5 border border-gray-300 bg-white rounded-lg focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors text-sm"
            >
              <option value="">All Skills</option>
              <For each={SKILL_SUGGESTIONS}>
                {(skill) => <option value={skill}>{skill}</option>}
              </For>
            </select>
          </div>

          <Show when={hasActiveFilters()}>
            <button
              onClick={clearFilters}
              class="text-sm text-ktip-ocean-600 hover:text-ktip-ocean-700 hover:underline transition-colors"
            >
              Clear all filters
            </button>
          </Show>
        </div>
      </div>

      {/* === Members Grid Section === */}
      <div class="bg-white pb-16">
        <div class="container mx-auto px-4 max-w-5xl">
          <Suspense fallback={<SkeletonGrid count={6} />}>
            <Show
              when={!members.loading && members()}
              fallback={<SkeletonGrid count={6} />}
            >
              <Show
                when={members()!.length > 0}
                fallback={
                  <div class="text-center py-16">
                    <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <UserX size={32} class="text-gray-400" />
                    </div>
                    <h3 class="text-2xl font-display font-bold text-ktip-sand-900 mb-2">
                      No members found
                    </h3>
                    <p class="text-gray-500">
                      {hasActiveFilters()
                        ? 'Try adjusting your filters or search query'
                        : 'No members have joined yet'}
                    </p>
                  </div>
                }
              >
                <div>
                  <p class="text-sm text-gray-500 mb-6">
                    Found {members()!.length} member{members()!.length !== 1 ? 's' : ''}
                  </p>

                  <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <For each={members()}>
                      {(member) => (
                        <div class="flex bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                          {/* Avatar */}
                          <div class="flex items-center justify-center px-5 py-5 shrink-0">
                            <Show
                              when={member.avatar_url}
                              fallback={
                                <div class="w-20 h-20 bg-ktip-ocean-100 rounded-full border-2 border-gray-200 flex items-center justify-center text-2xl font-bold text-ktip-ocean-700">
                                  {member.display_name?.charAt(0).toUpperCase() || <User size={28} />}
                                </div>
                              }
                            >
                              <img
                                src={member.avatar_url!}
                                alt={member.display_name || 'Member'}
                                class="w-20 h-20 rounded-full object-cover border-2 border-gray-200"
                              />
                            </Show>
                          </div>

                          {/* Metadata */}
                          <div class="flex-1 py-4 pr-3 min-w-0">
                            <h3 class="text-lg font-display font-bold text-ktip-ocean-600 truncate mb-2">
                              {member.display_name || 'Anonymous'}
                            </h3>
                            <div class="space-y-1 text-sm">
                              <Show when={member.roles?.length > 0}>
                                <div class="flex gap-1">
                                  <span class="text-gray-400 shrink-0">Role:</span>
                                  <span class="text-ktip-sand-700 truncate">
                                    {member.roles.slice(0, 2).map((r: string) => ROLE_LABELS[r] || r).join(', ')}
                                  </span>
                                </div>
                              </Show>
                              <Show when={member.country}>
                                <div class="flex gap-1">
                                  <span class="text-gray-400 shrink-0">Country:</span>
                                  <span class="text-ktip-sand-700">{member.country}</span>
                                </div>
                              </Show>
                              <Show when={member.skills?.length > 0}>
                                <div class="flex gap-1">
                                  <span class="text-gray-400 shrink-0">Skill:</span>
                                  <span class="text-ktip-sand-700 truncate">{member.skills[0]}</span>
                                </div>
                              </Show>
                            </div>
                          </div>

                          {/* Vertical "CONNECT NOW" tab */}
                          <A
                            href={`/profile/${member.id}`}
                            class="w-12 bg-ktip-ocean-600 hover:bg-ktip-ocean-700 transition-colors flex items-center justify-center shrink-0"
                            aria-label={`Connect with ${member.display_name || 'member'}`}
                          >
                            <span
                              class="text-[11px] font-bold text-white uppercase tracking-widest whitespace-nowrap"
                              style={{ "writing-mode": "vertical-rl", transform: "rotate(180deg)" }}
                            >
                              Connect Now
                            </span>
                          </A>
                        </div>
                      )}
                    </For>
                  </div>
                </div>
              </Show>
            </Show>
          </Suspense>
        </div>
      </div>
    </MainLayout>
  )
}
