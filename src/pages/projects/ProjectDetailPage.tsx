import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router'
import { Badge } from '../../components/ui/Badge'
import { LikeButton } from '../../components/projects/LikeButton'
import { FollowButton } from '../../components/projects/FollowButton'
import { CommentSection } from '../../components/projects/CommentSection'
import { TeamWidget } from '../../components/projects/TeamWidget'
import { ProposalCard } from '../../components/proposals/ProposalCard'
import { useProject, useProjects, trackProjectView } from '../../hooks/useProjects'
import { useProjectMembers } from '../../hooks/useProjectMembers'
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
  Eye,
} from 'lucide-react'
import { PHASE_LABELS, PHASE_COLORS, PROJECT_CATEGORIES } from '../../lib/constants'
import { formatDate, formatRelativeTime, copyToClipboard, truncate } from '../../lib/utils'
import { usePageTitle } from '../../hooks/usePageTitle'

export default function ProjectDetailPage() {
  const params = useParams()
  const navigate = useNavigate()
  const auth = useAuth()
  const toast = useToast()

  const { project, loading: projectLoading } = useProject(params.id)
  const { proposals } = useProjectProposals(params.id)
  const { projects: recentProjects } = useProjects()
  usePageTitle(project?.title)

  const { members } = useProjectMembers(params.id)

  const isOwner = project?.owner_id === auth.user?.id
  const isAdmin = auth.profile?.roles?.includes('oecs')
  const myMembership = (members || []).find(
    (m) => m.user_id === auth.user?.id && m.status === 'accepted'
  )
  const canEdit = isOwner || myMembership?.role === 'editor'

  // Count a view once per browser session per project
  useEffect(() => {
    if (params.id) trackProjectView(params.id)
  }, [params.id])

  const [togglingFeatured, setTogglingFeatured] = useState(false)

  const toggleFeatured = async () => {
    const p = project
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
  const [sidebarSearch, setSidebarSearch] = useState('')

  if (projectLoading || !project) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">📭</span>
        </div>
        <h2 className="text-2xl font-display font-bold uppercase text-ktip-sand-900 mb-2">
          Project Not Found
        </h2>
        <p className="text-gray-500 mb-6">
          This project doesn't exist or you don't have access to it.
        </p>
        <button
          onClick={() => navigate('/projects')}
          className="px-6 py-2.5 bg-ktip-ocean-600 text-white text-sm font-bold uppercase tracking-wider rounded-lg hover:bg-ktip-ocean-700 transition-colors"
        >
          Back to Projects
        </button>
      </div>
    )
  }

  return (
    <>
      {/* === Dark Hero Header Band === */}
      <div
        className="relative min-h-[180px] flex items-center bg-gray-800 bg-cover bg-center"
        style={project.image_url ? { backgroundImage: `url(${project.image_url})` } : {}}
      >
        {/* Dark overlay */}
        <div className="absolute inset-0 bg-gray-900/80" />

        <div className="relative container mx-auto px-4 py-10">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <p className="text-gray-400 text-sm uppercase tracking-widest mb-2">Project Detail</p>
              <h1 className="text-3xl md:text-4xl font-display font-bold text-white mb-3">
                {project.title}
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={PHASE_COLORS[project.phase]}>
                  {PHASE_LABELS[project.phase]}
                </Badge>
                {project.category && (
                  <span className="text-sm text-gray-300">
                    {getCategoryLabel(project.category)}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-4">
              {isAdmin && (
                <button
                  onClick={toggleFeatured}
                  disabled={togglingFeatured}
                  className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                    project.is_featured
                      ? 'bg-yellow-500 text-white hover:bg-yellow-600'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  } ${togglingFeatured ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <Star size={14} className={project.is_featured ? 'fill-current' : ''} />
                  {project.is_featured ? 'Featured' : 'Feature'}
                </button>
              )}
              {canEdit && (
                <Link to={`/projects/${params.id}/edit`}>
                  <button className="px-4 py-2 bg-ktip-ocean-600 text-white text-sm font-semibold rounded-lg hover:bg-ktip-ocean-700 transition-colors flex items-center gap-1.5">
                    <Edit size={14} />
                    Edit
                  </button>
                </Link>
              )}
              <nav className="text-sm text-gray-400 hidden md:block" aria-label="Breadcrumb">
                <Link to="/" className="hover:text-white transition-colors">Home</Link>
                <span className="mx-1.5"><ChevronRight size={12} className="inline" /></span>
                <Link to="/projects" className="hover:text-white transition-colors">Projects</Link>
                <span className="mx-1.5"><ChevronRight size={12} className="inline" /></span>
                <span className="text-gray-300">{truncate(project.title, 30)}</span>
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
            {/* Post title repeat */}
            <h2 className="text-xl font-bold uppercase text-center text-ktip-sand-900 mb-2">
              {project.title}
            </h2>

            {/* Date line */}
            <p className="text-sm text-gray-400 text-center mb-6">
              Date: {formatDate(project.created_at, 'MMMM dd, yyyy')}
            </p>

            {/* Project image */}
            {project.image_url ? (
              <img
                src={project.image_url}
                alt={project.title}
                className="w-full max-h-96 object-cover rounded mb-6"
                loading="lazy"
                width={800}
                height={384}
              />
            ) : (
              <div className="w-full max-h-96 h-64 bg-gradient-to-br from-ktip-ocean-100 to-ktip-tropical-100 rounded flex items-center justify-center text-7xl mb-6">
                {getCategoryIcon(project.category)}
              </div>
            )}

            {/* Hashtags */}
            {project.hashtags?.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-6">
                {project.hashtags.map((tag) => (
                  <span key={tag} className="border border-gray-300 rounded-full px-3 py-1 text-sm text-gray-600">
                    #{tag}
                  </span>
                ))}
              </div>
            )}

            {/* Description body */}
            {project.description && (
              <div className="text-gray-700 leading-relaxed text-base whitespace-pre-wrap mb-6">
                {project.description}
              </div>
            )}

            {/* Engagement row */}
            <div className="border-t border-gray-200 pt-4 mt-6 flex items-center gap-4 flex-wrap">
              <LikeButton projectId={params.id!} />
              <FollowButton projectId={params.id!} />
              <span className="flex items-center gap-1.5 text-sm text-gray-500">
                <Eye size={16} />
                {project.view_count ?? 0} views
              </span>
              <button
                className="flex items-center gap-1.5 text-sm text-ktip-ocean-600 hover:text-ktip-ocean-700 transition-colors"
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
            {isOwner && (
              <div className="mt-10">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider">
                      Linked Proposals
                    </h3>
                    <p className="text-ktip-ocean-600 text-xs italic">Proposals connected to this project</p>
                  </div>
                  <Link to={`/proposals/new?project=${params.id}`}>
                    <button className="px-4 py-2 bg-ktip-ocean-600 text-white text-sm font-bold rounded-lg hover:bg-ktip-ocean-700 transition-colors flex items-center gap-1.5">
                      <Plus size={14} />
                      Create Proposal
                    </button>
                  </Link>
                </div>

                {proposals && proposals.length > 0 ? (
                  <div className="space-y-4">
                    {proposals.map((proposal) => (
                      <ProposalCard key={proposal.id} proposal={proposal} />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                      <FileText size={22} className="text-gray-400" />
                    </div>
                    <p className="text-sm text-gray-500 mb-1">No proposals yet</p>
                    <p className="text-xs text-gray-400">
                      Create a funding, project, research, or business proposal for this project.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Comments Section */}
            <div className="mt-10">
              <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">
                Discussion
              </h3>
              <p className="text-ktip-ocean-600 text-xs italic mb-4">Join the conversation</p>
              <CommentSection projectId={params.id!} />
            </div>
          </div>

          {/* === Sidebar === */}
          <div className="lg:col-span-1">
            {/* Widget 1: Search */}
            <div className="mb-10">
              <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">Search</h3>
              <p className="text-ktip-ocean-600 text-xs italic mb-4">Find projects across the platform</p>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search projects..."
                    value={sidebarSearch}
                    onChange={(e) => setSidebarSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && sidebarSearch.trim()) {
                        navigate(`/projects?search=${encodeURIComponent(sidebarSearch.trim())}`)
                      }
                    }}
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 bg-white rounded-lg text-sm focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors"
                  />
                </div>
                <button
                  onClick={() => {
                    if (sidebarSearch.trim()) {
                      navigate(`/projects?search=${encodeURIComponent(sidebarSearch.trim())}`)
                    }
                  }}
                  className="px-4 py-2 bg-ktip-ocean-600 text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-ktip-ocean-700 transition-colors shrink-0"
                >
                  Search
                </button>
              </div>
            </div>

            {/* Widget 2: Recent Projects */}
            {recentProjects && recentProjects.length > 0 && (
              <div className="mb-10">
                <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">Recent Projects</h3>
                <p className="text-ktip-ocean-600 text-xs italic mb-4">Explore the latest work</p>
                <div className="space-y-4">
                  {recentProjects.slice(0, 3).map((p) => (
                    <Link key={p.id} to={`/projects/${p.id}`} className="flex gap-3 group">
                      {p.image_url ? (
                        <img
                          src={p.image_url}
                          alt={p.title}
                          className="w-14 h-14 object-cover rounded shrink-0"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-14 h-14 bg-gradient-to-br from-ktip-ocean-100 to-ktip-tropical-100 rounded flex items-center justify-center text-xl shrink-0">
                          {getCategoryIcon(p.category)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-xs text-gray-400 mb-0.5">
                          {formatDate(p.created_at, 'MMM dd, yyyy')}
                        </p>
                        <p className="text-sm font-semibold text-ktip-sand-900 line-clamp-2 group-hover:text-ktip-ocean-600 transition-colors">
                          {p.title}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Widget 3: Project Owner */}
            <div className="mb-10">
              <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">Project Owner</h3>
              <p className="text-ktip-ocean-600 text-xs italic mb-4">Created by</p>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-ktip-ocean-100 rounded-full flex items-center justify-center text-lg font-medium text-ktip-ocean-700">
                  {project.owner?.display_name?.charAt(0).toUpperCase() || 'U'}
                </div>
                <div>
                  <Link
                    to={`/profile/${project.owner_id}`}
                    className="font-medium text-ktip-sand-900 hover:text-ktip-ocean-600 transition-colors"
                  >
                    {project.owner?.display_name || 'Unknown User'}
                  </Link>
                  {project.owner?.country && (
                    <p className="text-sm text-gray-500">
                      {project.owner.country}
                    </p>
                  )}
                </div>
              </div>
              <Link to={`/profile/${project.owner_id}`}>
                <button className="w-full px-4 py-2.5 bg-ktip-ocean-600 text-white text-sm font-bold rounded-lg hover:bg-ktip-ocean-700 transition-colors flex items-center justify-center gap-1.5">
                  <User size={16} />
                  View Profile
                </button>
              </Link>
            </div>

            {/* Widget: Team */}
            <TeamWidget projectId={project.id} projectTitle={project.title} isOwner={isOwner} />

            {/* Widget 4: Project Details */}
            <div className="mb-10">
              <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">Project Details</h3>
              <p className="text-ktip-ocean-600 text-xs italic mb-4">Key information</p>
              <div className="text-sm divide-y divide-gray-100">
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-gray-500">Created</span>
                  <span className="font-medium text-ktip-sand-900">
                    {formatDate(project.created_at, 'MMM dd, yyyy')}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-gray-500">Last Updated</span>
                  <span className="font-medium text-ktip-sand-900">
                    {formatRelativeTime(project.updated_at)}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-gray-500">Visibility</span>
                  <span className="font-medium text-ktip-sand-900">
                    {project.is_public ? 'Public' : 'Private'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-gray-500">Views</span>
                  <span className="font-medium text-ktip-sand-900">
                    {project.view_count ?? 0}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
