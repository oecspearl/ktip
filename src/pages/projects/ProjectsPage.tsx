import { createSignal, Show, For, Suspense } from 'solid-js'
import { A, useSearchParams } from '@solidjs/router'
import { MainLayout } from '../../components/layout/MainLayout'
import { Button } from '../../components/ui/Button'
import { ProjectCard } from '../../components/projects/ProjectCard'
import { useProjects } from '../../hooks/useProjects'
import { Plus, Search, Inbox, ChevronRight, Leaf } from 'lucide-solid'
import { SkeletonGrid } from '../../components/ui/SkeletonCard'
import { PROJECT_CATEGORIES } from '../../lib/constants'
import { usePageTitle } from '../../hooks/usePageTitle'
import { debounce, formatDate } from '../../lib/utils'

export default function ProjectsPage() {
  usePageTitle(() => 'Projects')
  const [searchParams] = useSearchParams()
  const [selectedCategory, setSelectedCategory] = createSignal<string>('')
  const [selectedPhase, setSelectedPhase] = createSignal<string>('')
  const [climateFilter, setClimateFilter] = createSignal(false)
  const initialSearch = typeof searchParams.search === 'string' ? searchParams.search : ''
  const [searchQuery, setSearchQuery] = createSignal(initialSearch)
  const [debouncedSearch, setDebouncedSearch] = createSignal(initialSearch)
  const debouncedSetSearch = debounce((val: string) => setDebouncedSearch(val), 300)

  const { projects } = useProjects({
    get category() {
      return selectedCategory()
    },
    get phase() {
      return selectedPhase()
    },
    get search() {
      return debouncedSearch()
    },
    get climateAction() {
      return climateFilter()
    },
  })

  const clearFilters = () => {
    setSelectedCategory('')
    setSelectedPhase('')
    setSearchQuery('')
    setDebouncedSearch('')
    setClimateFilter(false)
  }

  const hasActiveFilters = () =>
    selectedCategory() || selectedPhase() || searchQuery() || climateFilter()

  // Derive category counts from current projects data
  const categoryCounts = () => {
    const data = projects()
    if (!data) return {} as Record<string, number>
    const counts: Record<string, number> = {}
    for (const p of data) {
      const cat = p.category || 'other'
      counts[cat] = (counts[cat] || 0) + 1
    }
    return counts
  }

  return (
    <MainLayout>
      {/* === Dark Hero Header Band === */}
      <div class="bg-gray-800 min-h-[180px] flex items-center">
        <div class="container mx-auto px-4 py-10">
          <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <p class="text-gray-400 text-sm uppercase tracking-widest mb-2">Project Archives</p>
              <h1 class="text-3xl md:text-4xl font-display font-bold text-white">Projects</h1>
            </div>
            <div class="flex items-center gap-4">
              <A href="/projects/new">
                <Button icon={<Plus size={16} />} size="sm" class="bg-ktip-ocean-600 text-white hover:bg-ktip-ocean-700 text-sm">
                  Create Project
                </Button>
              </A>
              <nav class="text-sm text-gray-400 hidden md:block" aria-label="Breadcrumb">
                <A href="/" class="hover:text-white transition-colors">Home</A>
                <span class="mx-2"><ChevronRight size={12} class="inline" /></span>
                <span class="text-gray-300">Projects</span>
              </nav>
            </div>
          </div>
        </div>
      </div>

      {/* === Two-Column Content Area === */}
      <div class="bg-white py-12">
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-6xl mx-auto px-4">

          {/* === Main Column === */}
          <div class="lg:col-span-2">
            {/* Filter Bar */}
            <div class="mb-8">
              {/* Search row */}
              <div class="flex gap-2 mb-3">
                <div class="relative flex-1">
                  <Search
                    size={18}
                    class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <input
                    type="text"
                    placeholder="Search projects..."
                    aria-label="Search projects"
                    value={searchQuery()}
                    onInput={(e) => { setSearchQuery(e.currentTarget.value); debouncedSetSearch(e.currentTarget.value) }}
                    class="w-full pl-10 pr-4 py-2.5 border border-gray-300 bg-white rounded-lg focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors text-sm"
                  />
                </div>
                <button
                  class="px-5 py-2.5 bg-ktip-ocean-600 text-white text-sm font-bold uppercase tracking-wider rounded-lg hover:bg-ktip-ocean-700 transition-colors shrink-0"
                >
                  Search
                </button>
              </div>

              {/* Filter row */}
              <div class="flex flex-wrap items-center gap-3">
                <select
                  value={selectedCategory()}
                  onChange={(e) => setSelectedCategory(e.currentTarget.value)}
                  class="px-3 py-2 border border-gray-300 bg-white rounded-lg text-sm focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors"
                >
                  <option value="">All Categories</option>
                  <For each={PROJECT_CATEGORIES}>
                    {(category) => (
                      <option value={category.value}>
                        {category.icon} {category.label}
                      </option>
                    )}
                  </For>
                </select>

                <select
                  value={selectedPhase()}
                  onChange={(e) => setSelectedPhase(e.currentTarget.value)}
                  class="px-3 py-2 border border-gray-300 bg-white rounded-lg text-sm focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors"
                >
                  <option value="">All Phases</option>
                  <option value="concept">Concept</option>
                  <option value="prototype">Prototype</option>
                  <option value="funding">Funding</option>
                  <option value="launch">Launch</option>
                </select>

                <label class="flex items-center gap-2 cursor-pointer text-sm text-ktip-sand-700">
                  <input
                    type="checkbox"
                    checked={climateFilter()}
                    onChange={(e) => setClimateFilter(e.currentTarget.checked)}
                    class="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
                  />
                  Climate Action
                </label>
              </div>

              <Show when={hasActiveFilters()}>
                <button
                  onClick={clearFilters}
                  class="mt-2 text-sm text-ktip-ocean-600 hover:text-ktip-ocean-700 hover:underline transition-colors"
                >
                  Clear all filters
                </button>
              </Show>
            </div>

            {/* Project List */}
            <Suspense fallback={<SkeletonGrid count={6} />}>
              <Show
                when={!projects.loading && projects()}
                fallback={<SkeletonGrid count={6} />}
              >
                <Show
                  when={projects()!.length > 0}
                  fallback={
                    <div class="text-center py-16">
                      <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Inbox size={32} class="text-gray-400" />
                      </div>
                      <h3 class="text-2xl font-display font-bold text-ktip-sand-900 mb-2">
                        No projects found
                      </h3>
                      <p class="text-gray-500 mb-6">
                        {hasActiveFilters()
                          ? 'Try adjusting your filters or search query'
                          : 'Be the first to create a project!'}
                      </p>
                      <Show when={!hasActiveFilters()}>
                        <A href="/projects/new">
                          <Button icon={<Plus size={20} />}>Create First Project</Button>
                        </A>
                      </Show>
                    </div>
                  }
                >
                  <div>
                    <p class="text-sm text-gray-500 mb-6">
                      Found {projects()!.length} project{projects()!.length !== 1 ? 's' : ''}
                    </p>
                    <div class="divide-y divide-gray-200">
                      <For each={projects()}>
                        {(project) => <ProjectCard project={project} />}
                      </For>
                    </div>
                  </div>
                </Show>
              </Show>
            </Suspense>
          </div>

          {/* === Sidebar === */}
          <div class="lg:col-span-1">
            {/* Widget 1: Start a Project CTA */}
            <div class="mb-10">
              <h3 class="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">Start a Project</h3>
              <p class="text-ktip-ocean-600 text-xs italic mb-4">Have an idea? Bring it to life.</p>
              <A href="/projects/new">
                <button class="w-full px-4 py-2.5 bg-ktip-ocean-600 text-white text-sm font-bold uppercase tracking-wider rounded-lg hover:bg-ktip-ocean-700 transition-colors">
                  Create Project
                </button>
              </A>
            </div>

            {/* Widget 2: Recent Projects */}
            <Suspense>
              <Show when={projects() && projects()!.length > 0}>
                <div class="mb-10">
                  <h3 class="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">Recent Projects</h3>
                  <p class="text-ktip-ocean-600 text-xs italic mb-4">Explore the latest work</p>
                  <div class="space-y-4">
                    <For each={projects()!.slice(0, 3)}>
                      {(project) => (
                        <A href={`/projects/${project.id}`} class="flex gap-3 group">
                          <Show
                            when={project.image_url}
                            fallback={
                              <div class="w-16 h-16 bg-gradient-to-br from-ktip-ocean-100 to-ktip-tropical-100 rounded flex items-center justify-center text-2xl shrink-0">
                                {PROJECT_CATEGORIES.find((c) => c.value === project.category)?.icon || '✨'}
                              </div>
                            }
                          >
                            <img
                              src={project.image_url!}
                              alt={project.title}
                              class="w-16 h-16 object-cover rounded shrink-0"
                              loading="lazy"
                            />
                          </Show>
                          <div class="min-w-0">
                            <p class="text-xs text-gray-400 mb-0.5">
                              {formatDate(project.created_at, 'MMM dd, yyyy')}
                            </p>
                            <p class="text-sm font-semibold text-ktip-sand-900 line-clamp-2 group-hover:text-ktip-ocean-600 transition-colors">
                              {project.title}
                            </p>
                          </div>
                        </A>
                      )}
                    </For>
                  </div>
                </div>
              </Show>
            </Suspense>

            {/* Widget 3: Categories */}
            <div class="mb-10">
              <h3 class="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">Categories</h3>
              <p class="text-ktip-ocean-600 text-xs italic mb-4">Browse by category</p>
              <div class="space-y-0">
                <For each={PROJECT_CATEGORIES}>
                  {(category) => {
                    const count = () => categoryCounts()[category.value] || 0
                    return (
                      <button
                        onClick={() => setSelectedCategory(
                          selectedCategory() === category.value ? '' : category.value
                        )}
                        class={`w-full flex items-center justify-between py-2.5 border-b border-gray-100 text-sm transition-colors ${
                          selectedCategory() === category.value
                            ? 'text-ktip-ocean-600 font-semibold'
                            : 'text-ktip-sand-700 hover:text-ktip-ocean-600'
                        }`}
                      >
                        <span>{category.icon} {category.label}</span>
                        <span class="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                          {count()}
                        </span>
                      </button>
                    )
                  }}
                </For>
              </div>
            </div>

            {/* Widget 4: Tags */}
            <div class="mb-10">
              <h3 class="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-4">Tags</h3>
              <div class="flex flex-wrap gap-2">
                <For each={PROJECT_CATEGORIES}>
                  {(category) => (
                    <button
                      onClick={() => setSelectedCategory(
                        selectedCategory() === category.value ? '' : category.value
                      )}
                      class={`px-3 py-1 text-sm rounded-full border transition-colors ${
                        selectedCategory() === category.value
                          ? 'border-ktip-ocean-500 bg-ktip-ocean-50 text-ktip-ocean-600'
                          : 'border-gray-300 text-gray-600 hover:border-ktip-ocean-400 hover:text-ktip-ocean-600'
                      }`}
                    >
                      {category.label}
                    </button>
                  )}
                </For>
                <button
                  onClick={() => setClimateFilter(!climateFilter())}
                  class={`px-3 py-1 text-sm rounded-full border transition-colors flex items-center gap-1 ${
                    climateFilter()
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-600'
                      : 'border-gray-300 text-gray-600 hover:border-emerald-400 hover:text-emerald-600'
                  }`}
                >
                  <Leaf size={12} />
                  Climate Action
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  )
}
