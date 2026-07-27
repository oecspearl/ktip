import { createSignal, Show, Suspense, For } from 'solid-js'
import { useParams, useNavigate, A } from '@solidjs/router'
import { MainLayout } from '../../components/layout/MainLayout'
import { Badge } from '../../components/ui/Badge'
import { LikeButton } from '../../components/projects/LikeButton'
import { CommentSection } from '../../components/projects/CommentSection'
import { ProposalCard } from '../../components/proposals/ProposalCard'
import { useProject, useProjects } from '../../hooks/useProjects'
import { supabase } from '../../lib/supabase'
import { useProjectProposals } from '../../hooks/useProposals'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import {
  Share2,
  Edit,
  User,
  FileText,
  Plus,
  Search,
  ChevronRight,
  Star,
} from 'lucide-solid'
import { PHASE_LABELS, PHASE_COLORS, PROJECT_CATEGORIES } from '../../lib/constants'
import { formatDate, formatRelativeTime, copyToClipboard, truncate } from '../../lib/utils'
import { usePageTitle } from '../../hooks/usePageTitle'

export default function ProjectDetailPage() {
  const params = useParams()
  const navigate = useNavigate()
  const auth = useAuth()
  const toast = useToast()

  const { project } = useProject(() => params.id)
  const { proposals } = useProjectProposals(() => params.id!)
  const { projects: recentProjects } = useProjects()
  usePageTitle(() => project()?.title)

  const isOwner = () => project()?.owner_id === auth.user()?.id
  const isAdmin = () => auth.profile()?.roles?.includes('oecs')

  const [togglingFeatured, setTogglingFeatured] = createSignal(false)

  const toggleFeatured = async () => {
    const p = project()
    if (!p) return
    setTogglingFeatured(true)
    try {
      const { error } = await supabase
        .from('projects')
        .update({ is_featured: !p.is_featured } as any)
        .eq('id', p.id)
      if (error) throw error
      toast.success(p.is_featured ? 'Removed from featured' : 'Added to featured')
      window.location.reload()
    } catch (err: any) {
      toast.error(err.message || 'Failed to update')
    } finally {
      setTogglingFeatured(false)
    }
  }

  const getCategoryLabel = (category: string | null) => {
    const cat = PROJECT_CATEGORIES.find((c) => c.value === category)
    return cat ? `${cat.icon} ${cat.label}` : category
  }

  const getCategoryIcon = (category: string | null) => {
    const cat = PROJECT_CATEGORIES.find((c) => c.value === category)
    return cat?.icon || '✨'
  }

  // Sidebar search
  const [sidebarSearch, setSidebarSearch] = createSignal('')

  return (
    <MainLayout>
      <Suspense
        fallback={
          <div class="container mx-auto px-4 py-12 text-center">
            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-ktip-ocean-500 mx-auto"></div>
            <p class="mt-4 text-ktip-sand-600">Loading project...</p>
          </div>
        }
      >
        <Show
          when={!project.loading && project()}
          fallback={
            <div class="container mx-auto px-4 py-16 text-center">
              <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span class="text-3xl">📭</span>
              </div>
              <h2 class="text-2xl font-display font-bold uppercase text-ktip-sand-900 mb-2">
                Project Not Found
              </h2>
              <p class="text-gray-500 mb-6">
                This project doesn't exist or you don't have access to it.
              </p>
              <button
                onClick={() => navigate('/projects')}
                class="px-6 py-2.5 bg-ktip-ocean-600 text-white text-sm font-bold uppercase tracking-wider rounded-lg hover:bg-ktip-ocean-700 transition-colors"
              >
                Back to Projects
              </button>
            </div>
          }
        >
          {/* === Dark Hero Header Band === */}
          <div
            class="relative min-h-[180px] flex items-center bg-gray-800 bg-cover bg-center"
            style={project()!.image_url ? { "background-image": `url(${project()!.image_url})` } : {}}
          >
            {/* Dark overlay */}
            <div class="absolute inset-0 bg-gray-900/80" />

            <div class="relative container mx-auto px-4 py-10">
              <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                  <p class="text-gray-400 text-sm uppercase tracking-widest mb-2">Project Detail</p>
                  <h1 class="text-3xl md:text-4xl font-display font-bold text-white mb-3">
                    {project()!.title}
                  </h1>
                  <div class="flex flex-wrap items-center gap-2">
                    <Badge class={PHASE_COLORS[project()!.phase]}>
                      {PHASE_LABELS[project()!.phase]}
                    </Badge>
                    <Show when={project()!.category}>
                      <span class="text-sm text-gray-300">
                        {getCategoryLabel(project()!.category)}
                      </span>
                    </Show>
                  </div>
                </div>
                <div class="flex items-center gap-4">
                  <Show when={isAdmin()}>
                    <button
                      onClick={toggleFeatured}
                      disabled={togglingFeatured()}
                      class={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                        project()?.is_featured
                          ? 'bg-yellow-500 text-white hover:bg-yellow-600'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      } ${togglingFeatured() ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <Star size={14} class={project()?.is_featured ? 'fill-current' : ''} />
                      {project()?.is_featured ? 'Featured' : 'Feature'}
                    </button>
                  </Show>
                  <Show when={isOwner()}>
                    <A href={`/projects/${params.id}/edit`}>
                      <button class="px-4 py-2 bg-ktip-ocean-600 text-white text-sm font-semibold rounded-lg hover:bg-ktip-ocean-700 transition-colors flex items-center gap-1.5">
                        <Edit size={14} />
                        Edit
                      </button>
                    </A>
                  </Show>
                  <nav class="text-sm text-gray-400 hidden md:block" aria-label="Breadcrumb">
                    <A href="/" class="hover:text-white transition-colors">Home</A>
                    <span class="mx-1.5"><ChevronRight size={12} class="inline" /></span>
                    <A href="/projects" class="hover:text-white transition-colors">Projects</A>
                    <span class="mx-1.5"><ChevronRight size={12} class="inline" /></span>
                    <span class="text-gray-300">{truncate(project()!.title, 30)}</span>
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
                {/* Post title repeat */}
                <h2 class="text-xl font-bold uppercase text-center text-ktip-sand-900 mb-2">
                  {project()!.title}
                </h2>

                {/* Date line */}
                <p class="text-sm text-gray-400 text-center mb-6">
                  Date: {formatDate(project()!.created_at, 'MMMM dd, yyyy')}
                </p>

                {/* Project image */}
                <Show
                  when={project()!.image_url}
                  fallback={
                    <div class="w-full max-h-96 h-64 bg-gradient-to-br from-ktip-ocean-100 to-ktip-tropical-100 rounded flex items-center justify-center text-7xl mb-6">
                      {getCategoryIcon(project()!.category)}
                    </div>
                  }
                >
                  <img
                    src={project()!.image_url!}
                    alt={project()!.title}
                    class="w-full max-h-96 object-cover rounded mb-6"
                    loading="lazy"
                    width={800}
                    height={384}
                  />
                </Show>

                {/* Hashtags */}
                <Show when={project()!.hashtags?.length > 0}>
                  <div class="flex flex-wrap gap-2 mb-6">
                    <For each={project()!.hashtags}>
                      {(tag) => (
                        <span class="border border-gray-300 rounded-full px-3 py-1 text-sm text-gray-600">
                          #{tag}
                        </span>
                      )}
                    </For>
                  </div>
                </Show>

                {/* Description body */}
                <Show when={project()!.description}>
                  <div class="text-gray-700 leading-relaxed text-base whitespace-pre-wrap mb-6">
                    {project()!.description}
                  </div>
                </Show>

                {/* Engagement row */}
                <div class="border-t border-gray-200 pt-4 mt-6 flex items-center gap-4">
                  <LikeButton projectId={params.id!} />
                  <button
                    class="flex items-center gap-1.5 text-sm text-ktip-ocean-600 hover:text-ktip-ocean-700 transition-colors"
                    onClick={async () => {
                      const ok = await copyToClipboard(window.location.href)
                      toast[ok ? 'success' : 'error'](ok ? 'Link copied to clipboard!' : 'Failed to copy link')
                    }}
                  >
                    <Share2 size={16} />
                    Share
                  </button>
                </div>

                {/* Proposals Section — Owner Only */}
                <Show when={isOwner()}>
                  <div class="mt-10">
                    <div class="flex items-center justify-between mb-4">
                      <div>
                        <h3 class="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider">
                          Linked Proposals
                        </h3>
                        <p class="text-ktip-ocean-600 text-xs italic">Proposals connected to this project</p>
                      </div>
                      <A href={`/proposals/new?project=${params.id}`}>
                        <button class="px-4 py-2 bg-ktip-ocean-600 text-white text-sm font-bold rounded-lg hover:bg-ktip-ocean-700 transition-colors flex items-center gap-1.5">
                          <Plus size={14} />
                          Create Proposal
                        </button>
                      </A>
                    </div>

                    <Show
                      when={proposals() && proposals()!.length > 0}
                      fallback={
                        <div class="text-center py-8">
                          <div class="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                            <FileText size={22} class="text-gray-400" />
                          </div>
                          <p class="text-sm text-gray-500 mb-1">No proposals yet</p>
                          <p class="text-xs text-gray-400">
                            Create a funding, project, research, or business proposal for this project.
                          </p>
                        </div>
                      }
                    >
                      <div class="space-y-4">
                        <For each={proposals()}>
                          {(proposal) => <ProposalCard proposal={proposal} />}
                        </For>
                      </div>
                    </Show>
                  </div>
                </Show>

                {/* Comments Section */}
                <div class="mt-10">
                  <h3 class="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">
                    Discussion
                  </h3>
                  <p class="text-ktip-ocean-600 text-xs italic mb-4">Join the conversation</p>
                  <CommentSection projectId={params.id!} />
                </div>
              </div>

              {/* === Sidebar === */}
              <div class="lg:col-span-1">
                {/* Widget 1: Search */}
                <div class="mb-10">
                  <h3 class="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">Search</h3>
                  <p class="text-ktip-ocean-600 text-xs italic mb-4">Find projects across the platform</p>
                  <div class="flex gap-2">
                    <div class="relative flex-1">
                      <Search size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search projects..."
                        value={sidebarSearch()}
                        onInput={(e) => setSidebarSearch(e.currentTarget.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && sidebarSearch().trim()) {
                            navigate(`/projects?search=${encodeURIComponent(sidebarSearch().trim())}`)
                          }
                        }}
                        class="w-full pl-9 pr-3 py-2 border border-gray-300 bg-white rounded-lg text-sm focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors"
                      />
                    </div>
                    <button
                      onClick={() => {
                        if (sidebarSearch().trim()) {
                          navigate(`/projects?search=${encodeURIComponent(sidebarSearch().trim())}`)
                        }
                      }}
                      class="px-4 py-2 bg-ktip-ocean-600 text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-ktip-ocean-700 transition-colors shrink-0"
                    >
                      Search
                    </button>
                  </div>
                </div>

                {/* Widget 2: Recent Projects */}
                <Suspense>
                  <Show when={recentProjects() && recentProjects()!.length > 0}>
                    <div class="mb-10">
                      <h3 class="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">Recent Projects</h3>
                      <p class="text-ktip-ocean-600 text-xs italic mb-4">Explore the latest work</p>
                      <div class="space-y-4">
                        <For each={recentProjects()!.slice(0, 3)}>
                          {(p) => (
                            <A href={`/projects/${p.id}`} class="flex gap-3 group">
                              <Show
                                when={p.image_url}
                                fallback={
                                  <div class="w-14 h-14 bg-gradient-to-br from-ktip-ocean-100 to-ktip-tropical-100 rounded flex items-center justify-center text-xl shrink-0">
                                    {getCategoryIcon(p.category)}
                                  </div>
                                }
                              >
                                <img
                                  src={p.image_url!}
                                  alt={p.title}
                                  class="w-14 h-14 object-cover rounded shrink-0"
                                  loading="lazy"
                                />
                              </Show>
                              <div class="min-w-0">
                                <p class="text-xs text-gray-400 mb-0.5">
                                  {formatDate(p.created_at, 'MMM dd, yyyy')}
                                </p>
                                <p class="text-sm font-semibold text-ktip-sand-900 line-clamp-2 group-hover:text-ktip-ocean-600 transition-colors">
                                  {p.title}
                                </p>
                              </div>
                            </A>
                          )}
                        </For>
                      </div>
                    </div>
                  </Show>
                </Suspense>

                {/* Widget 3: Project Owner */}
                <div class="mb-10">
                  <h3 class="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">Project Owner</h3>
                  <p class="text-ktip-ocean-600 text-xs italic mb-4">Created by</p>
                  <div class="flex items-center gap-3 mb-4">
                    <div class="w-12 h-12 bg-ktip-ocean-100 rounded-full flex items-center justify-center text-lg font-medium text-ktip-ocean-700">
                      {project()!.owner?.display_name?.charAt(0).toUpperCase() || 'U'}
                    </div>
                    <div>
                      <A
                        href={`/profile/${project()!.owner_id}`}
                        class="font-medium text-ktip-sand-900 hover:text-ktip-ocean-600 transition-colors"
                      >
                        {project()!.owner?.display_name || 'Unknown User'}
                      </A>
                      <Show when={project()!.owner?.country}>
                        <p class="text-sm text-gray-500">
                          {project()!.owner!.country}
                        </p>
                      </Show>
                    </div>
                  </div>
                  <A href={`/profile/${project()!.owner_id}`}>
                    <button class="w-full px-4 py-2.5 bg-ktip-ocean-600 text-white text-sm font-bold rounded-lg hover:bg-ktip-ocean-700 transition-colors flex items-center justify-center gap-1.5">
                      <User size={16} />
                      View Profile
                    </button>
                  </A>
                </div>

                {/* Widget 4: Project Details */}
                <div class="mb-10">
                  <h3 class="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">Project Details</h3>
                  <p class="text-ktip-ocean-600 text-xs italic mb-4">Key information</p>
                  <div class="text-sm divide-y divide-gray-100">
                    <div class="flex items-center justify-between py-2.5">
                      <span class="text-gray-500">Created</span>
                      <span class="font-medium text-ktip-sand-900">
                        {formatDate(project()!.created_at, 'MMM dd, yyyy')}
                      </span>
                    </div>
                    <div class="flex items-center justify-between py-2.5">
                      <span class="text-gray-500">Last Updated</span>
                      <span class="font-medium text-ktip-sand-900">
                        {formatRelativeTime(project()!.updated_at)}
                      </span>
                    </div>
                    <div class="flex items-center justify-between py-2.5">
                      <span class="text-gray-500">Visibility</span>
                      <span class="font-medium text-ktip-sand-900">
                        {project()!.is_public ? 'Public' : 'Private'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Show>
      </Suspense>
    </MainLayout>
  )
}
