import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router'
import { Badge } from '../../components/ui/Badge'
import { DetailsList } from '../../components/shared/DetailsList'
import { LikeButton } from '../../components/projects/LikeButton'
import { FollowButton } from '../../components/projects/FollowButton'
import { CommentSection } from '../../components/projects/CommentSection'
import { TeamWidget } from '../../components/projects/TeamWidget'
import { DocumentsPanel } from '../../components/documents/DocumentsPanel'
import { useProject, useProjects, useDeleteProject, trackProjectView } from '../../hooks/useProjects'
import { DeleteEntityControl } from '../../components/shared/DeleteEntityControl'
import { describeProjectDeletion } from '../../lib/delete-guard'
import { useProjectMembers } from '../../hooks/useProjectMembers'
import { useMyJoinRequest } from '../../hooks/useProjectJoinRequests'
import { RequestCollaborationModal } from '../../components/projects/RequestCollaborationModal'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useMemberPanel } from '../../contexts/MemberPanelContext'
import { useToast } from '../../contexts/ToastContext'
import {
  Share2,
  Edit,
  User,
  Search,
  Inbox,
  Star,
  Eye,
  Users,
  UserPlus,
  Clock,
} from 'lucide-react'
import { PHASE_LABELS, PHASE_COLORS, PROJECT_CATEGORIES } from '../../lib/constants'
import { formatDate, formatRelativeTime, copyToClipboard, truncate } from '../../lib/utils'
import { usePageTitle } from '../../hooks/usePageTitle'
import { useCanonicalSlug } from '../../hooks/useCanonicalSlug'
import { PageHero } from '../../components/layout/PageHero'
import { projectCategoryIcon } from '../../lib/category-icons'
import { entityPath, memberPath } from '../../lib/slug'
import { DiamondAvatar } from '../../components/ui/DiamondAvatar'
import { Plural, Trans, useLingui } from '@lingui/react/macro'

export default function ProjectDetailPage() {
    const { t } = useLingui()
  const params = useParams()
  const navigate = useNavigate()
  const auth = useAuth()
  const toast = useToast()
  const { openMember } = useMemberPanel()

  const { project, loading: projectLoading } = useProject(params.id)
  useCanonicalSlug(params.id, project)
  const { projects: recentProjects } = useProjects()
  usePageTitle(project?.title)

  const { members } = useProjectMembers(params.id)
  const { deleteProject } = useDeleteProject()

  const isOwner = project?.owner_id === auth.user?.id
  // Capability, not slug — an admin created after 063 holds super_admin
  // without the legacy oecs slug and was being shown the member view.
  const isAdmin = auth.can('org:manage')
  const myMembership = (members || []).find(
    (m) => m.user_id === auth.user?.id && m.status === 'accepted'
  )
  const canEdit = isOwner || myMembership?.role === 'editor'
  // Editors can edit but not delete — the RLS policy is owner-only, so
  // offering it to an editor would only produce a refusal.
  const collaboratorCount = (members || []).filter(
    (m) => m.status === 'accepted' && m.user_id !== project?.owner_id
  ).length

  // The roster above is invisible to anyone not already on the team
  // (project_members SELECT is members-only), so the headcount a visitor sees
  // is the denormalised column maintained by migration 079.
  const teamCount = project?.member_count ?? 0
  const { request: myJoinRequest } = useMyJoinRequest(params.id, auth.user?.id)
  const [requestOpen, setRequestOpen] = useState(false)

  const canRequestToCollaborate =
    !!auth.user && !!project && !isOwner && !myMembership && project.is_public

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
      toast.error(err.message || t`Failed to update`)
    } finally {
      setTogglingFeatured(false)
    }
  }

  const getCategoryLabel = (category: string | null) => {
    const cat = PROJECT_CATEGORIES.find((c) => c.value === category)
    return cat ? cat.label : category
  }

  const CategoryIcon = projectCategoryIcon(project?.category)

  // Sidebar search
  const [sidebarSearch, setSidebarSearch] = useState('')

  if (projectLoading || !project) {
    return (
      <div className="w-full max-w-page mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 bg-ktip-sand-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Inbox size={32} className="text-gray-400" />
        </div>
        <h2 className="text-2xl font-display font-bold uppercase text-ktip-sand-900 mb-2">
          <Trans>Project Not Found</Trans>
        </h2>
        <p className="text-gray-500 mb-6">
          <Trans>This project doesn't exist or you don't have access to it.</Trans>
        </p>
        <button
          onClick={() => navigate('/projects')}
          className="px-6 py-2.5 btn-brand text-sm font-bold uppercase tracking-wider rounded-lg"
        >
          <Trans>Back to Projects</Trans>
        </button>
      </div>
    )
  }

  // Named, so the catalog entry reads `Date: {createdAt}` rather than
  // `Date: {0}`, which a translator cannot place. Declared after the
  // `!project` guard above, so it is safe to read.
  //
  // The date itself is still formatted en-US; threading the active locale
  // through formatDate is a separate pass across the whole app.
  const createdAt = formatDate(project.created_at, 'MMMM dd, yyyy')

  return (
    <>
      <PageHero
        eyebrow={t`Project Detail`}
        title={project.title}
        image={project.image_url}
        imageSeed={project.id}
        breadcrumb={[
          { label: t`Home`, href: '/' },
          { label: t`Projects`, href: '/projects' },
          { label: truncate(project.title, 30) },
        ]}
        actions={
          <>
            {isAdmin && (
              <button
                onClick={toggleFeatured}
                disabled={togglingFeatured}
                className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                  project.is_featured
                    // Yellow takes ink, never white (1.6:1); the unfeatured
                    // state uses the sand scale so it inverts with the theme
                    ? 'bg-ktip-sun-500 text-ktip-ink hover:bg-ktip-sun-600'
                    : 'bg-ktip-sand-100 text-ktip-sand-700 hover:bg-ktip-sand-200'
                } ${togglingFeatured ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <Star size={14} className={project.is_featured ? 'fill-current' : ''} />
                {project.is_featured ? t`Featured` : t`Feature`}
              </button>
            )}
            {canEdit && (
              <Link to={`/projects/${params.id}/edit`}>
                <button className="px-4 py-2 btn-brand text-sm font-semibold rounded-lg flex items-center gap-1.5">
                  <Edit size={14} />
                  <Trans>Edit</Trans>
                </button>
              </Link>
            )}
            {isOwner && (
              <DeleteEntityControl
                noun="project"
                title={project.title}
                impact={describeProjectDeletion({
                  isPublic: project.is_public,
                  memberCount: collaboratorCount,
                })}
                onDelete={() => deleteProject(project.id)}
                redirectTo="/projects"
              />
            )}
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={PHASE_COLORS[project.phase]}>
            {PHASE_LABELS[project.phase]}
          </Badge>
          {project.category && (
            <span className="text-sm text-white/80">
              {getCategoryLabel(project.category)}
            </span>
          )}
        </div>
      </PageHero>

      {/* === Two-Column Content Area === */}
      <div className="bg-ktip-sand-50 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-page-mid mx-auto px-4">

          {/* === Main Column === */}
          <div className="lg:col-span-2">
            {/* Post title repeat */}
            <h2
              id="overview"
              data-spy="Overview"
              className="scroll-mt-24 text-xl font-bold uppercase text-center text-ktip-sand-900 mb-2"
            >
              {project.title}
            </h2>

            {/* Date line */}
            <p className="text-sm text-gray-400 text-center mb-6">
              <Trans>Date: {createdAt}</Trans>
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
              <div className="w-full max-h-96 h-64 bg-gradient-to-br from-ktip-ocean-100 to-ktip-tropical-100 rounded flex items-center justify-center mb-6">
                <CategoryIcon size={64} className="text-ktip-ocean-500" />
              </div>
            )}

            {/* Hashtags */}
            {project.hashtags?.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-6">
                {project.hashtags.map((tag) => (
                  <span key={tag} className="border border-ktip-sand-300 rounded-full px-3 py-1 text-sm text-gray-600">
                    #{tag}
                  </span>
                ))}
              </div>
            )}

            {/* Summary lede */}
            {project.summary && (
              <p className="text-lg text-ktip-sand-800 font-medium leading-relaxed mb-6">
                {project.summary}
              </p>
            )}

            {/* Description body */}
            {project.description && (
              <div className="text-gray-700 leading-relaxed text-base whitespace-pre-wrap mb-6">
                {project.description}
              </div>
            )}

            {/* Additional Details */}
            {project.details && project.details.length > 0 && (
              <div id="details" data-spy="Details" className="scroll-mt-24 mb-6">
                <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">
                  <Trans>Additional Details</Trans>
                </h3>
                <p className="text-ktip-ocean-600 text-xs italic mb-3"><Trans>Key facts at a glance</Trans></p>
                <DetailsList details={project.details} />
              </div>
            )}

            {/* Engagement row */}
            <div
              data-tutorial="project-engagement"
              className="border-t border-ktip-sand-200 pt-4 mt-6 flex items-center gap-4 flex-wrap"
            >
              <LikeButton projectId={params.id!} />
              <FollowButton projectId={params.id!} />
              <span className="flex items-center gap-1.5 text-sm text-gray-500">
                <Eye size={16} />
                <Plural value={project.view_count ?? 0} one="# view" other="# views" />
              </span>
              <span className="flex items-center gap-1.5 text-sm text-gray-500">
                <Users size={16} />
                <Plural value={teamCount} one="# team member" other="# team members" />
              </span>
              <button
                className="flex items-center gap-1.5 text-sm text-ktip-ocean-600 hover:text-ktip-ocean-700 transition-colors"
                onClick={async () => {
                  const ok = await copyToClipboard(window.location.href)
                  toast[ok ? 'success' : 'error'](
                    ok ? t`Link copied to clipboard!` : t`Failed to copy link`
                  )
                }}
              >
                <Share2 size={16} />
                <Trans>Share</Trans>
              </button>

              {/* Until 079 there was no way to ask — membership was owner-push
                  only, and the RLS policy refused a self-inserted row. */}
              {canRequestToCollaborate &&
                (myJoinRequest ? (
                  <span className="ml-auto flex items-center gap-1.5 rounded-lg border border-ktip-sand-200 px-3 py-1.5 text-sm text-ktip-sand-600">
                    <Clock size={16} />
                    <Trans>Request pending</Trans>
                  </span>
                ) : (
                  <button
                    onClick={() => setRequestOpen(true)}
                    className="ml-auto flex items-center gap-1.5 rounded-lg border border-ktip-ocean-600 px-3 py-1.5 text-sm font-bold text-ktip-ocean-600 transition-colors hover:bg-ktip-ocean-50"
                  >
                    <UserPlus size={16} />
                    <Trans>Request to collaborate</Trans>
                  </button>
                ))}
            </div>

            {project && (
              <RequestCollaborationModal
                open={requestOpen}
                onClose={() => setRequestOpen(false)}
                projectId={project.id}
                projectTitle={project.title}
                ownerId={project.owner_id}
                ownerName={project.owner?.display_name}
              />
            )}

            {/* Documents */}
            <div id="documents" data-spy="Documents" className="scroll-mt-24 mt-10">
              <DocumentsPanel
                entityType="project"
                entityId={project.id}
                canEditEntity={canEdit}
                entity={project}
              />
            </div>

            {/* Comments Section */}
            <div id="discussion" data-spy="Discussion" className="scroll-mt-24 mt-10">
              <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">
                <Trans>Discussion</Trans>
              </h3>
              <p className="text-ktip-ocean-600 text-xs italic mb-4"><Trans>Join the conversation</Trans></p>
              <CommentSection projectId={params.id!} />
            </div>
          </div>

          {/* === Sidebar === */}
          <div className="lg:col-span-1">
            {/* Widget 1: Search */}
            <div className="mb-10">
              <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1"><Trans>Search</Trans></h3>
              <p className="text-ktip-ocean-600 text-xs italic mb-4"><Trans>Find projects across the platform</Trans></p>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder={t`Search projects...`}
                    value={sidebarSearch}
                    onChange={(e) => setSidebarSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && sidebarSearch.trim()) {
                        navigate(`/projects?search=${encodeURIComponent(sidebarSearch.trim())}`)
                      }
                    }}
                    className="w-full pl-9 pr-3 py-2 border border-ktip-sand-300 bg-ktip-cream rounded-lg text-sm focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors"
                  />
                </div>
                <button
                  onClick={() => {
                    if (sidebarSearch.trim()) {
                      navigate(`/projects?search=${encodeURIComponent(sidebarSearch.trim())}`)
                    }
                  }}
                  className="px-4 py-2 btn-brand text-xs font-bold uppercase tracking-wider rounded-lg shrink-0"
                >
                  <Trans>Search</Trans>
                </button>
              </div>
            </div>

            {/* Widget 2: Recent Projects */}
            {recentProjects && recentProjects.length > 0 && (
              <div className="mb-10">
                <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1"><Trans>Recent Projects</Trans></h3>
                <p className="text-ktip-ocean-600 text-xs italic mb-4"><Trans>Explore the latest work</Trans></p>
                <div className="space-y-4">
                  {recentProjects.slice(0, 3).map((p) => (
                    <Link key={p.id} to={entityPath('project', p)} className="flex gap-3 group">
                      {p.image_url ? (
                        <img
                          src={p.image_url}
                          alt={p.title}
                          className="w-14 h-14 object-cover rounded shrink-0"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-14 h-14 bg-gradient-to-br from-ktip-ocean-100 to-ktip-tropical-100 rounded flex items-center justify-center shrink-0">
                          {(() => {
                            const Icon = projectCategoryIcon(p.category)
                            return <Icon size={20} className="text-ktip-ocean-600" />
                          })()}
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
              <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1"><Trans>Project Owner</Trans></h3>
              <p className="text-ktip-ocean-600 text-xs italic mb-4"><Trans>Created by</Trans></p>
              <div className="flex items-center gap-3 mb-4">
                <DiamondAvatar
                  src={project.owner?.avatar_url}
                  name={project.owner?.display_name || 'Owner'}
                  size={48}
                />
                <div>
                  {/* A real link to /user/:id, not just the drawer — the name has
                      to be shareable and open in a new tab like any profile. */}
                  <Link
                    to={memberPath(project.owner ?? { id: project.owner_id })}
                    className="font-medium text-ktip-sand-900 hover:text-ktip-ocean-600 transition-colors"
                  >
                    {project.owner?.display_name || t`Unknown User`}
                  </Link>
                  {project.owner?.country && (
                    <p className="text-sm text-gray-500">
                      {project.owner.country}
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={() => openMember(project.owner_id)}
                className="w-full px-4 py-2.5 btn-brand text-sm font-bold rounded-lg flex items-center justify-center gap-1.5"
              >
                <User size={16} />
                <Trans>View Profile</Trans>
              </button>
            </div>

            {/* Widget: Team */}
            <TeamWidget projectId={project.id} projectTitle={project.title} isOwner={isOwner} />

            {/* Widget 4: Project Details */}
            <div className="mb-10">
              <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1"><Trans>Project Details</Trans></h3>
              <p className="text-ktip-ocean-600 text-xs italic mb-4"><Trans>Key information</Trans></p>
              <div className="text-sm divide-y divide-ktip-sand-100">
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-gray-500"><Trans>Created</Trans></span>
                  <span className="font-medium text-ktip-sand-900">
                    {formatDate(project.created_at, 'MMM dd, yyyy')}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-gray-500"><Trans>Last Updated</Trans></span>
                  <span className="font-medium text-ktip-sand-900">
                    {formatRelativeTime(project.updated_at)}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-gray-500"><Trans>Visibility</Trans></span>
                  <span className="font-medium text-ktip-sand-900">
                    {project.is_public ? t`Public` : t`Private`}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-gray-500"><Trans>Views</Trans></span>
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
