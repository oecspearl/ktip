import { createSignal, createResource, Show, For, Suspense } from 'solid-js'
import { AdminLayout } from '../../../components/layout/AdminLayout'
import { supabase } from '../../../lib/supabase'
import { useToast } from '../../../contexts/ToastContext'
import { formatDate, cn } from '../../../lib/utils'
import {
  FolderKanban,
  Star,
  StarOff,
  Search,

} from 'lucide-solid'

interface ProjectRow {
  id: string
  title: string
  description: string | null
  category: string | null
  phase: string
  is_public: boolean
  is_featured: boolean
  owner_id: string
  created_at: string
  country?: string
  owner?: { full_name: string; avatar_url: string | null } | null
}

async function fetchAllProjects(): Promise<ProjectRow[]> {
  // Try with is_featured ordering first, fall back if column doesn't exist yet
  let result = await supabase
    .from('projects')
    .select(`
      *,
      owner:profiles(full_name, avatar_url)
    `)
    .order('is_featured', { ascending: false })
    .order('created_at', { ascending: false })

  if (result.error) {
    // Fallback: column may not exist yet
    result = await supabase
      .from('projects')
      .select(`
        *,
        owner:profiles(full_name, avatar_url)
      `)
      .order('created_at', { ascending: false })
  }

  if (result.error) throw result.error
  return ((result.data as any[]) || []).map((p) => ({
    ...p,
    is_featured: p.is_featured ?? false,
  }))
}

function AdminProjectsContent() {
  const toast = useToast()
  const [projects, { refetch }] = createResource(fetchAllProjects)
  const [search, setSearch] = createSignal('')
  const [toggling, setToggling] = createSignal<string | null>(null)

  const filtered = () => {
    const data = projects()
    if (!data) return []
    const q = search().toLowerCase()
    if (!q) return data
    return data.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q)
    )
  }

  const featuredCount = () => (projects() || []).filter((p) => p.is_featured).length

  const toggleFeatured = async (project: ProjectRow) => {
    setToggling(project.id)
    try {
      const { error } = await supabase
        .from('projects')
        .update({ is_featured: !project.is_featured } as any)
        .eq('id', project.id)

      if (error) throw error

      toast.success(
        project.is_featured
          ? `"${project.title}" removed from featured`
          : `"${project.title}" added to featured`
      )
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to update project')
    } finally {
      setToggling(null)
    }
  }

  const PHASE_COLORS: Record<string, string> = {
    concept: 'bg-purple-100 text-purple-700',
    prototype: 'bg-blue-100 text-blue-700',
    funding: 'bg-yellow-100 text-yellow-700',
    launch: 'bg-emerald-100 text-emerald-700',
  }

  return (
    <>
      {/* Header */}
      <div class="bg-gray-800 rounded-lg p-6 mb-8">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-gray-400 uppercase tracking-wider">Admin</p>
            <h1 class="text-2xl font-bold font-display text-white mt-1">
              Manage Projects
            </h1>
            <p class="mt-1 text-gray-400 text-sm">
              Toggle featured status to showcase projects on the homepage
            </p>
          </div>
          <div class="flex items-center gap-2 bg-yellow-900/30 border border-yellow-700/50 rounded-xl px-4 py-2">
            <Star size={18} class="text-yellow-400" />
            <span class="text-yellow-300 font-bold text-lg">{featuredCount()}</span>
            <span class="text-yellow-400/70 text-sm">featured</span>
          </div>
        </div>
      </div>

      {/* Search */}
      <div class="mb-6">
        <div class="relative max-w-md">
          <Search size={18} class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search projects..."
            value={search()}
            onInput={(e) => setSearch(e.currentTarget.value)}
            class="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:border-ktip-ocean-500 focus:outline-none text-sm"
          />
        </div>
      </div>

      <Suspense
        fallback={
          <div class="space-y-3">
            {[1, 2, 3, 4, 5].map(() => (
              <div class="border border-gray-200 rounded-lg p-4 animate-pulse">
                <div class="h-5 w-48 bg-gray-100 rounded" />
              </div>
            ))}
          </div>
        }
      >
        <Show when={filtered()}>
          {(data) => (
            <div class="border border-gray-200 rounded-lg overflow-hidden">
              <table class="w-full text-sm">
                <thead>
                  <tr class="bg-gray-50 border-b border-gray-200">
                    <th class="text-left px-4 py-3 font-semibold text-gray-700">Project</th>
                    <th class="text-left px-4 py-3 font-semibold text-gray-700 hidden md:table-cell">Owner</th>
                    <th class="text-left px-4 py-3 font-semibold text-gray-700 hidden sm:table-cell">Phase</th>
                    <th class="text-left px-4 py-3 font-semibold text-gray-700 hidden lg:table-cell">Created</th>
                    <th class="text-center px-4 py-3 font-semibold text-gray-700">Featured</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={data()}>
                    {(project) => (
                      <tr class={cn(
                        'border-b border-gray-100 hover:bg-gray-50/50 transition-colors',
                        project.is_featured && 'bg-yellow-50/50'
                      )}>
                        <td class="px-4 py-3">
                          <div class="flex items-center gap-3">
                            <div class={cn(
                              'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
                              project.is_featured ? 'bg-yellow-100' : 'bg-gray-100'
                            )}>
                              <FolderKanban size={18} class={project.is_featured ? 'text-yellow-600' : 'text-gray-500'} />
                            </div>
                            <div class="min-w-0">
                              <p class="font-medium text-gray-900 truncate">{project.title}</p>
                              <p class="text-xs text-gray-500 truncate max-w-[250px]">{project.description}</p>
                            </div>
                          </div>
                        </td>
                        <td class="px-4 py-3 hidden md:table-cell">
                          <span class="text-gray-600">{project.owner?.full_name || 'Unknown'}</span>
                        </td>
                        <td class="px-4 py-3 hidden sm:table-cell">
                          <span class={cn(
                            'px-2 py-0.5 rounded-full text-xs font-medium capitalize',
                            PHASE_COLORS[project.phase] || 'bg-gray-100 text-gray-600'
                          )}>
                            {project.phase}
                          </span>
                        </td>
                        <td class="px-4 py-3 hidden lg:table-cell">
                          <span class="text-gray-500 text-xs">{formatDate(project.created_at, 'PP')}</span>
                        </td>
                        <td class="px-4 py-3 text-center">
                          <button
                            onClick={() => toggleFeatured(project)}
                            disabled={toggling() === project.id}
                            class={cn(
                              'p-2 rounded-lg transition-all',
                              project.is_featured
                                ? 'bg-yellow-100 text-yellow-600 hover:bg-yellow-200'
                                : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600',
                              toggling() === project.id && 'opacity-50 cursor-not-allowed'
                            )}
                            title={project.is_featured ? 'Remove from featured' : 'Add to featured'}
                          >
                            <Show when={project.is_featured} fallback={<StarOff size={18} />}>
                              <Star size={18} class="fill-current" />
                            </Show>
                          </button>
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>

              <Show when={data().length === 0}>
                <div class="text-center py-12">
                  <FolderKanban size={40} class="mx-auto text-gray-300 mb-3" />
                  <p class="text-gray-500 font-medium">No projects found</p>
                  <p class="text-gray-400 text-sm mt-1">Try a different search term</p>
                </div>
              </Show>
            </div>
          )}
        </Show>
      </Suspense>
    </>
  )
}

export default function AdminProjectsPage() {
  return (
    <AdminLayout>
      <AdminProjectsContent />
    </AdminLayout>
  )
}
