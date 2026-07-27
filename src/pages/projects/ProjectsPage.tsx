import { useState, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Button } from '../../components/ui/Button'
import { ProjectCard } from '../../components/projects/ProjectCard'
import { useProjects } from '../../hooks/useProjects'
import { Plus, Search, Inbox, ChevronRight, Leaf } from 'lucide-react'
import { SkeletonGrid } from '../../components/ui/SkeletonCard'
import { PROJECT_CATEGORIES } from '../../lib/constants'
import { usePageTitle } from '../../hooks/usePageTitle'
import { debounce, formatDate } from '../../lib/utils'

export default function ProjectsPage() {
  usePageTitle('Projects')
  const [searchParams] = useSearchParams()
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [selectedPhase, setSelectedPhase] = useState<string>('')
  const [climateFilter, setClimateFilter] = useState(false)
  const initialSearch = searchParams.get('search') || ''
  const [searchQuery, setSearchQuery] = useState(initialSearch)
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch)
  const debouncedSetSearch = useMemo(() => debounce((val: string) => setDebouncedSearch(val), 300), [])

  const { projects, loading: projectsLoading } = useProjects({
    category: selectedCategory,
    phase: selectedPhase,
    search: debouncedSearch,
    climateAction: climateFilter,
  })

  const clearFilters = () => {
    setSelectedCategory('')
    setSelectedPhase('')
    setSearchQuery('')
    setDebouncedSearch('')
    setClimateFilter(false)
  }

  const hasActiveFilters = Boolean(selectedCategory || selectedPhase || searchQuery || climateFilter)

  // Derive category counts from current projects data
  const categoryCounts = useMemo(() => {
    const data = projects
    if (!data) return {} as Record<string, number>
    const counts: Record<string, number> = {}
    for (const p of data) {
      const cat = p.category || 'other'
      counts[cat] = (counts[cat] || 0) + 1
    }
    return counts
  }, [projects])

  return (
    <>
      {/* === Dark Hero Header Band === */}
      <div className="bg-gray-800 min-h-[180px] flex items-center">
        <div className="container mx-auto px-4 py-10">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <p className="text-gray-400 text-sm uppercase tracking-widest mb-2">Project Archives</p>
              <h1 className="text-3xl md:text-4xl font-display font-bold text-white">Projects</h1>
            </div>
            <div className="flex items-center gap-4">
              <Link to="/projects/new">
                <Button icon={<Plus size={16} />} size="sm" className="bg-ktip-ocean-600 text-white hover:bg-ktip-ocean-700 text-sm">
                  Create Project
                </Button>
              </Link>
              <nav className="text-sm text-gray-400 hidden md:block" aria-label="Breadcrumb">
                <Link to="/" className="hover:text-white transition-colors">Home</Link>
                <span className="mx-2"><ChevronRight size={12} className="inline" /></span>
                <span className="text-gray-300">Projects</span>
              </nav>
            </div>
          </div>
        </div>
      </div>

      {/* === Two-Column Content Area === */}
      <div className="bg-white py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-6xl mx-auto px-4">

          {/* === Main Column === */}
          <div className="lg:col-span-2">
            {/* Filter Bar */}
            <div className="mb-8">
              {/* Search row */}
              <div className="flex gap-2 mb-3">
                <div className="relative flex-1">
                  <Search
                    size={18}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <input
                    type="text"
                    placeholder="Search projects..."
                    aria-label="Search projects"
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); debouncedSetSearch(e.target.value) }}
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 bg-white rounded-lg focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors text-sm"
                  />
                </div>
                <button
                  className="px-5 py-2.5 bg-ktip-ocean-600 text-white text-sm font-bold uppercase tracking-wider rounded-lg hover:bg-ktip-ocean-700 transition-colors shrink-0"
                >
                  Search
                </button>
              </div>

              {/* Filter row */}
              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="px-3 py-2 border border-gray-300 bg-white rounded-lg text-sm focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors"
                >
                  <option value="">All Categories</option>
                  {PROJECT_CATEGORIES.map((category) => (
                    <option key={category.value} value={category.value}>
                      {category.icon} {category.label}
                    </option>
                  ))}
                </select>

                <select
                  value={selectedPhase}
                  onChange={(e) => setSelectedPhase(e.target.value)}
                  className="px-3 py-2 border border-gray-300 bg-white rounded-lg text-sm focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors"
                >
                  <option value="">All Phases</option>
                  <option value="concept">Concept</option>
                  <option value="prototype">Prototype</option>
                  <option value="funding">Funding</option>
                  <option value="launch">Launch</option>
                </select>

                <label className="flex items-center gap-2 cursor-pointer text-sm text-ktip-sand-700">
                  <input
                    type="checkbox"
                    checked={climateFilter}
                    onChange={(e) => setClimateFilter(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
                  />
                  Climate Action
                </label>
              </div>

              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="mt-2 text-sm text-ktip-ocean-600 hover:text-ktip-ocean-700 hover:underline transition-colors"
                >
                  Clear all filters
                </button>
              )}
            </div>

            {/* Project List */}
            {projectsLoading || !projects ? (
              <SkeletonGrid count={6} />
            ) : projects.length > 0 ? (
              <div>
                <p className="text-sm text-gray-500 mb-6">
                  Found {projects.length} project{projects.length !== 1 ? 's' : ''}
                </p>
                <div className="divide-y divide-gray-200">
                  {projects.map((project) => (
                    <ProjectCard key={project.id} project={project} />
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-16">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Inbox size={32} className="text-gray-400" />
                </div>
                <h3 className="text-2xl font-display font-bold text-ktip-sand-900 mb-2">
                  No projects found
                </h3>
                <p className="text-gray-500 mb-6">
                  {hasActiveFilters
                    ? 'Try adjusting your filters or search query'
                    : 'Be the first to create a project!'}
                </p>
                {!hasActiveFilters && (
                  <Link to="/projects/new">
                    <Button icon={<Plus size={20} />}>Create First Project</Button>
                  </Link>
                )}
              </div>
            )}
          </div>

          {/* === Sidebar === */}
          <div className="lg:col-span-1">
            {/* Widget 1: Start a Project CTA */}
            <div className="mb-10">
              <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">Start a Project</h3>
              <p className="text-ktip-ocean-600 text-xs italic mb-4">Have an idea? Bring it to life.</p>
              <Link to="/projects/new">
                <button className="w-full px-4 py-2.5 bg-ktip-ocean-600 text-white text-sm font-bold uppercase tracking-wider rounded-lg hover:bg-ktip-ocean-700 transition-colors">
                  Create Project
                </button>
              </Link>
            </div>

            {/* Widget 2: Recent Projects */}
            {projects && projects.length > 0 && (
              <div className="mb-10">
                <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">Recent Projects</h3>
                <p className="text-ktip-ocean-600 text-xs italic mb-4">Explore the latest work</p>
                <div className="space-y-4">
                  {projects.slice(0, 3).map((project) => (
                    <Link key={project.id} to={`/projects/${project.id}`} className="flex gap-3 group">
                      {project.image_url ? (
                        <img
                          src={project.image_url}
                          alt={project.title}
                          className="w-16 h-16 object-cover rounded shrink-0"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-16 h-16 bg-gradient-to-br from-ktip-ocean-100 to-ktip-tropical-100 rounded flex items-center justify-center text-2xl shrink-0">
                          {PROJECT_CATEGORIES.find((c) => c.value === project.category)?.icon || '✨'}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-xs text-gray-400 mb-0.5">
                          {formatDate(project.created_at, 'MMM dd, yyyy')}
                        </p>
                        <p className="text-sm font-semibold text-ktip-sand-900 line-clamp-2 group-hover:text-ktip-ocean-600 transition-colors">
                          {project.title}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Widget 3: Categories */}
            <div className="mb-10">
              <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">Categories</h3>
              <p className="text-ktip-ocean-600 text-xs italic mb-4">Browse by category</p>
              <div className="space-y-0">
                {PROJECT_CATEGORIES.map((category) => {
                  const count = categoryCounts[category.value] || 0
                  return (
                    <button
                      key={category.value}
                      onClick={() => setSelectedCategory(
                        selectedCategory === category.value ? '' : category.value
                      )}
                      className={`w-full flex items-center justify-between py-2.5 border-b border-gray-100 text-sm transition-colors ${
                        selectedCategory === category.value
                          ? 'text-ktip-ocean-600 font-semibold'
                          : 'text-ktip-sand-700 hover:text-ktip-ocean-600'
                      }`}
                    >
                      <span>{category.icon} {category.label}</span>
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                        {count}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Widget 4: Tags */}
            <div className="mb-10">
              <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-4">Tags</h3>
              <div className="flex flex-wrap gap-2">
                {PROJECT_CATEGORIES.map((category) => (
                  <button
                    key={category.value}
                    onClick={() => setSelectedCategory(
                      selectedCategory === category.value ? '' : category.value
                    )}
                    className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                      selectedCategory === category.value
                        ? 'border-ktip-ocean-500 bg-ktip-ocean-50 text-ktip-ocean-600'
                        : 'border-gray-300 text-gray-600 hover:border-ktip-ocean-400 hover:text-ktip-ocean-600'
                    }`}
                  >
                    {category.label}
                  </button>
                ))}
                <button
                  onClick={() => setClimateFilter(!climateFilter)}
                  className={`px-3 py-1 text-sm rounded-full border transition-colors flex items-center gap-1 ${
                    climateFilter
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
    </>
  )
}
