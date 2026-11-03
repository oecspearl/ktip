import { useMemo, useState } from 'react'
import { useAdminProjects, useBulkDeleteProjects, useUpdateProject } from '../../../hooks/useProjects'
import { useSetContentStatus, type ContentModerationStatus } from '../../../hooks/useAdminContentStatus'
import { useSelection } from '../../../hooks/useSelection'
import { useToast } from '../../../contexts/ToastContext'
import { formatDate, cn } from '../../../lib/utils'
import { settleEach } from '../../../lib/bulk'
import { describeProjectDeletion, type BulkDeleteItem } from '../../../lib/delete-guard'
import {
  Ban,
  CheckSquare,
  FolderKanban,
  RotateCcw,
  Star,
  StarOff,
  Search,
  Trash2,
} from 'lucide-react'
import type { Project } from '../../../types'
import { PageHero } from '../../../components/layout/PageHero'
import { VideoLinkButton } from '../../../components/shared/VideoViewer'
import { Button } from '../../../components/ui/Button'
import { BulkActionBar } from '../../../components/shared/BulkActionBar'
import { BulkDeleteDialog } from '../../../components/shared/BulkDeleteDialog'
import { ModerationReasonModal, type ModerationTarget } from '../../../components/admin/ModerationReasonModal'
import { ModerationStatusBadge } from '../../../components/admin/ModerationStatusBadge'
import { Trans, useLingui } from '@lingui/react/macro'
import { plural } from '@lingui/core/macro'

const PHASE_COLORS: Record<string, string> = {
  concept: 'bg-ktip-ocean-100 text-ktip-ocean-700',
  prototype: 'bg-ktip-ocean-100 text-ktip-ocean-700',
  funding: 'bg-ktip-sun-100 text-ktip-sun-700',
  launch: 'bg-ktip-tropical-100 text-ktip-tropical-800',
}

type StatusFilter = 'all' | ContentModerationStatus

/** A row written before 122 reads as active, the column's default. */
const statusOf = (project: Project): ContentModerationStatus => project.status ?? 'active'

export default function AdminProjectsPage() {
  const { t } = useLingui()
  const toast = useToast()
  const { projects, loading, refetch } = useAdminProjects()
  const { updateProject } = useUpdateProject()
  const { deleteProjects } = useBulkDeleteProjects()
  const { setStatus } = useSetContentStatus('project')

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [toggling, setToggling] = useState<string | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [featuring, setFeaturing] = useState(false)
  const [deleteItems, setDeleteItems] = useState<BulkDeleteItem[] | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [moderation, setModeration] = useState<{ mode: 'suspend' | 'restore'; items: ModerationTarget[] } | null>(
    null
  )

  const filtered = useMemo(() => {
    const data = (projects || []).filter((p) => statusFilter === 'all' || statusOf(p) === statusFilter)
    const q = search.toLowerCase()
    if (!q) return data
    return data.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q)
    )
  }, [projects, search, statusFilter])

  const filteredIds = useMemo(() => filtered.map((p) => p.id), [filtered])
  const selection = useSelection(filteredIds)
  const chosen = () => filtered.filter((p) => selection.isSelected(p.id))

  const featuredCount = (projects || []).filter((p) => p.is_featured).length

  const stopSelecting = () => {
    setSelecting(false)
    selection.clear()
  }

  const toggleFeatured = async (project: Project) => {
    setToggling(project.id)
    try {
      await updateProject(project.id, { is_featured: !project.is_featured })

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

  const setFeaturedMany = async (featured: boolean) => {
    const ids = chosen()
      .filter((p) => p.is_featured !== featured)
      .map((p) => p.id)
    if (ids.length === 0) return
    setFeaturing(true)
    const result = await settleEach(ids, (id) => updateProject(id, { is_featured: featured }))
    setFeaturing(false)
    refetch()
    if (result.failed.length === 0) {
      const n = result.done.length
      toast.success(
        featured
          ? plural(n, { one: '# project featured', other: '# projects featured' })
          : plural(n, { one: '# project unfeatured', other: '# projects unfeatured' })
      )
    } else {
      toast.warning(t`${result.done.length} of ${ids.length} changed. ${result.failed[0].message}`)
    }
  }

  const openDelete = (rows: Project[]) => {
    if (rows.length === 0) return
    setDeleteItems(
      rows.map((p) => ({
        id: p.id,
        title: p.title,
        impact: describeProjectDeletion({ isPublic: p.is_public, memberCount: p.member_count ?? 0 }),
      }))
    )
    setDeleteOpen(true)
  }

  const openModeration = (mode: 'suspend' | 'restore', rows: Project[]) => {
    const items = rows
      .filter((p) => (mode === 'suspend' ? statusOf(p) === 'active' : statusOf(p) !== 'active'))
      .map((p) => ({ id: p.id, title: p.title }))
    if (items.length === 0) {
      toast.info(mode === 'suspend' ? t`Those projects are already suspended.` : t`Those projects are already active.`)
      return
    }
    setModeration({ mode, items })
  }

  return (
    <>
      <PageHero
        inset
        compact
        eyebrow="Admin"
        title="Manage Projects"
        subtitle={t`Feature, suspend or delete projects`}
        imageSeed="admin-projects"
        actions={
          // Sits on the hero photo, dark in both modes: translucent black plus
          // sun-500, the one yellow that means the same thing in light and dark.
          // (The sun-900/700/400/300 shades this used all invert.)
          <div className="flex items-center gap-2 bg-black/30 backdrop-blur-sm border border-ktip-sun-500/40 rounded-xl px-4 py-2">
            <Star size={18} className="text-ktip-sun-500" />
            <span className="text-ktip-sun-500 font-bold text-lg">{featuredCount}</span>
            <span className="text-white/70 text-sm">featured</span>
          </div>
        }
      />

      {/* Search, filter, select */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search projects..."
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-ktip-sand-200 rounded-xl focus:border-ktip-ocean-500 focus:outline-hidden text-sm"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.currentTarget.value as StatusFilter)}
          aria-label={t`Filter by moderation status`}
          className="px-3 py-2.5 border border-ktip-sand-200 rounded-xl bg-ktip-cream text-sm text-gray-700 focus:border-ktip-ocean-500 focus:outline-hidden"
        >
          <option value="all">{t`All statuses`}</option>
          <option value="active">{t`Active`}</option>
          <option value="quarantined">{t`Suspended`}</option>
          <option value="removed">{t`Removed`}</option>
        </select>
        {!selecting && (
          <Button
            variant="secondary"
            size="sm"
            icon={<CheckSquare size={16} />}
            onClick={() => setSelecting(true)}
            className="sm:ml-auto"
          >
            <Trans>Select</Trans>
          </Button>
        )}
      </div>

      {selecting && (
        <BulkActionBar
          count={selection.count}
          total={filtered.length}
          allSelected={selection.allSelected}
          onSelectAll={selection.selectAll}
          onClear={selection.clear}
          onDone={stopSelecting}
        >
          <Button
            variant="secondary"
            size="sm"
            icon={<Star size={16} />}
            disabled={!selection.count || featuring}
            onClick={() => setFeaturedMany(true)}
          >
            <Trans>Feature</Trans>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={<StarOff size={16} />}
            disabled={!selection.count || featuring}
            onClick={() => setFeaturedMany(false)}
          >
            <Trans>Unfeature</Trans>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={<Ban size={16} />}
            disabled={!selection.count}
            onClick={() => openModeration('suspend', chosen())}
          >
            <Trans>Suspend</Trans>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={<RotateCcw size={16} />}
            disabled={!selection.count}
            onClick={() => openModeration('restore', chosen())}
          >
            <Trans>Restore</Trans>
          </Button>
          <Button
            variant="danger"
            size="sm"
            icon={<Trash2 size={16} />}
            disabled={!selection.count}
            onClick={() => openDelete(chosen())}
          >
            <Trans>Delete</Trans>
          </Button>
        </BulkActionBar>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((n) => (
            <div key={n} className="border border-ktip-sand-200 rounded-lg p-4 animate-pulse">
              <div className="h-5 w-48 bg-ktip-sand-100 rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="border border-ktip-sand-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto scroll-cue-x">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-ktip-sand-50 border-b border-ktip-sand-200">
                {selecting && (
                  <th className="w-10 px-4 py-3">
                    <span className="sr-only">{t`Select`}</span>
                  </th>
                )}
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Project</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700 hidden md:table-cell">Owner</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700 hidden sm:table-cell">Phase</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">{t`Moderation`}</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700 hidden lg:table-cell">Created</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="stagger-rows">
              {filtered.map((project) => {
                const status = statusOf(project)
                return (
                <tr
                  key={project.id}
                  className={cn(
                    'border-b border-ktip-sand-100 hover:bg-ktip-sand-50/50 transition-colors',
                    project.is_featured && 'bg-ktip-sun-50/50'
                  )}
                >
                  {selecting && (
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selection.isSelected(project.id)}
                        onChange={() => selection.toggle(project.id)}
                        aria-label={t`Select ${project.title}`}
                        className="w-4 h-4 rounded border-ktip-sand-300 text-ktip-ocean-600 focus:ring-ktip-ocean-500"
                      />
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
                        project.is_featured ? 'bg-ktip-sun-100' : 'bg-ktip-sand-100'
                      )}>
                        <FolderKanban size={18} className={project.is_featured ? 'text-ktip-sun-600' : 'text-gray-500'} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">{project.title}</p>
                        <p className="text-xs text-gray-500 truncate max-w-[250px]">{project.description}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-gray-600">{project.owner?.display_name || 'Unknown'}</span>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className={cn(
                      'px-2 py-0.5 rounded-full text-xs font-medium capitalize',
                      PHASE_COLORS[project.phase] || 'bg-ktip-sand-100 text-gray-600'
                    )}>
                      {project.phase}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <ModerationStatusBadge status={status} />
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <span className="text-gray-500 text-xs">{formatDate(project.created_at, 'PP')}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      {project.video_url && (
                        <VideoLinkButton
                          url={project.video_url}
                          title={project.title}
                          iconSize={18}
                          className="h-auto w-auto p-2 rounded-lg border-0 bg-ktip-sand-100 text-gray-500 hover:bg-ktip-sand-200 hover:text-ktip-ocean-600"
                        />
                      )}
                      <button
                        onClick={() => toggleFeatured(project)}
                        disabled={toggling === project.id}
                        className={cn(
                          'p-2 rounded-lg transition-all',
                          project.is_featured
                            ? 'bg-ktip-sun-100 text-ktip-sun-600 hover:bg-ktip-sun-200'
                            : 'bg-ktip-sand-100 text-gray-400 hover:bg-ktip-sand-200 hover:text-gray-600',
                          toggling === project.id && 'opacity-50 cursor-not-allowed'
                        )}
                        title={project.is_featured ? 'Remove from featured' : 'Add to featured'}
                      >
                        {project.is_featured ? <Star size={18} className="fill-current" /> : <StarOff size={18} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => openModeration(status === 'active' ? 'suspend' : 'restore', [project])}
                        className="p-2 rounded-lg bg-ktip-sand-100 text-gray-500 hover:bg-ktip-sand-200 hover:text-ktip-sun-700 transition-colors"
                        title={status === 'active' ? t`Suspend project` : t`Restore project`}
                        aria-label={status === 'active' ? t`Suspend ${project.title}` : t`Restore ${project.title}`}
                      >
                        {status === 'active' ? <Ban size={18} /> : <RotateCcw size={18} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => openDelete([project])}
                        className="p-2 rounded-lg bg-ktip-sand-100 text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors"
                        title={t`Delete project`}
                        aria-label={t`Delete ${project.title}`}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
          </div>

          {filtered.length === 0 && (
            <div className="text-center py-12">
              <FolderKanban size={40} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500 font-medium">No projects found</p>
              <p className="text-gray-400 text-sm mt-1">Try a different search term</p>
            </div>
          )}
        </div>
      )}

      <ModerationReasonModal
        open={!!moderation}
        mode={moderation?.mode ?? 'suspend'}
        label={plural(moderation?.items.length ?? 0, { one: '# project', other: '# projects' })}
        items={moderation?.items ?? []}
        onClose={() => setModeration(null)}
        onRun={(ids, reason, onProgress) =>
          setStatus(ids, moderation?.mode === 'restore' ? 'active' : 'quarantined', reason, onProgress)
        }
        onDone={() => {
          selection.clear()
          refetch()
        }}
      />

      <BulkDeleteDialog
        open={deleteOpen}
        kind="project"
        items={deleteItems}
        onClose={() => setDeleteOpen(false)}
        onDelete={deleteProjects}
        onDeleted={() => {
          selection.clear()
          refetch()
        }}
      />
    </>
  )
}
