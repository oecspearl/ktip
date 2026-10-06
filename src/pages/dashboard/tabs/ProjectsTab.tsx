import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { CheckSquare, Eye, EyeOff, FolderKanban, Plus, Trash2 } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { Segmented } from '../../../components/ui/Segmented'
import { ProjectCard } from '../../../components/projects/ProjectCard'
import { SelectableTile } from '../../../components/shared/SelectableTile'
import { BulkActionBar } from '../../../components/shared/BulkActionBar'
import { BulkDeleteDialog } from '../../../components/shared/BulkDeleteDialog'
import { useOwnedProjects } from '../../../hooks/useProfile'
import { useBulkDeleteProjects, useBulkSetProjectVisibility } from '../../../hooks/useProjects'
import { useSelection } from '../../../hooks/useSelection'
import { useAuth } from '../../../contexts/AuthContext'
import { useToast } from '../../../contexts/ToastContext'
import { usePageTitle } from '../../../hooks/usePageTitle'
import { describeProjectDeletion, type BulkDeleteItem } from '../../../lib/delete-guard'
import { errorMessage } from '../../../lib/bulk'
import type { Project } from '../../../types'
import { Trans, useLingui } from '@lingui/react/macro'
import { plural } from '@lingui/core/macro'

type ProjectFilter = 'all' | 'public' | 'private'

function matchesFilter(project: Project, filter: ProjectFilter): boolean {
  if (filter === 'public') return project.is_public
  if (filter === 'private') return !project.is_public
  return true
}

export default function ProjectsTab() {
  const { t } = useLingui()
  usePageTitle(t`My Projects`)
  const auth = useAuth()
  const toast = useToast()
  // Private ones too: this is the owner's list, not the public profile's.
  const { projects } = useOwnedProjects(auth.user?.id)

  const [filter, setFilter] = useState<ProjectFilter>('all')
  const [selecting, setSelecting] = useState(false)
  const shown = useMemo(
    () => (projects ?? []).filter((project) => matchesFilter(project, filter)),
    [projects, filter]
  )
  const shownIds = useMemo(() => shown.map((project) => project.id), [shown])
  const selection = useSelection(shownIds)

  const { deleteProjects } = useBulkDeleteProjects()
  const [deleteItems, setDeleteItems] = useState<BulkDeleteItem[] | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const { setVisibility, loading: visibilityLoading } = useBulkSetProjectVisibility()

  const stopSelecting = () => {
    setSelecting(false)
    selection.clear()
  }

  // member_count is kept on the row by a trigger (079), so unlike events there
  // is nothing to fetch before the dialog can say who is affected.
  const openDelete = () => {
    const chosen = shown.filter((project) => selection.isSelected(project.id))
    if (chosen.length === 0) return
    setDeleteItems(
      chosen.map((project) => ({
        id: project.id,
        title: project.title,
        impact: describeProjectDeletion({ isPublic: project.is_public, memberCount: project.member_count ?? 0 }),
      }))
    )
    setDeleteOpen(true)
  }

  const changeVisibility = async (isPublic: boolean) => {
    const ids = selection.selectedIds
    try {
      const result = await setVisibility(ids, isPublic)
      if (result.failed.length === 0) {
        const n = result.done.length
        toast.success(
          isPublic
            ? plural(n, { one: '# project is now public', other: '# projects are now public' })
            : plural(n, { one: '# project is now private', other: '# projects are now private' })
        )
      } else {
        toast.warning(t`${result.done.length} of ${ids.length} changed. The rest may no longer be yours to edit.`)
      }
      selection.clear()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  if (!projects?.length) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 bg-ktip-sand-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <FolderKanban size={32} className="text-ktip-sand-400" />
        </div>
        <p className="text-ktip-sand-600 mb-4"><Trans>No projects yet.</Trans></p>
        {auth.can('project:create') && (
          <Link to="/projects/new">
            <Button icon={<Plus size={18} />}><Trans>Create a project</Trans></Button>
          </Link>
        )}
      </div>
    )
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={filter}
          onChange={setFilter}
          label={t`Show projects`}
          options={[
            { value: 'all', label: t`All` },
            { value: 'public', label: t`Public` },
            { value: 'private', label: t`Private` },
          ]}
        />
        {!selecting && (
          <Button variant="secondary" size="sm" icon={<CheckSquare size={16} />} onClick={() => setSelecting(true)}>
            <Trans>Select</Trans>
          </Button>
        )}
      </div>

      {selecting && (
        <BulkActionBar
          count={selection.count}
          total={shown.length}
          allSelected={selection.allSelected}
          onSelectAll={selection.selectAll}
          onClear={selection.clear}
          onDone={stopSelecting}
        >
          <Button
            variant="secondary"
            size="sm"
            icon={<Eye size={16} />}
            disabled={!selection.count || visibilityLoading}
            onClick={() => changeVisibility(true)}
          >
            <Trans>Make public</Trans>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={<EyeOff size={16} />}
            disabled={!selection.count || visibilityLoading}
            onClick={() => changeVisibility(false)}
          >
            <Trans>Make private</Trans>
          </Button>
          <Button variant="danger" size="sm" icon={<Trash2 size={16} />} disabled={!selection.count} onClick={openDelete}>
            <Trans>Delete</Trans>
          </Button>
        </BulkActionBar>
      )}

      {shown.length === 0 ? (
        <p className="py-12 text-center text-ktip-sand-600"><Trans>No projects match this filter.</Trans></p>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4 auto-rows-fr stagger-children">
          {shown.map((project) => (
            <SelectableTile
              key={project.id}
              selecting={selecting}
              selected={selection.isSelected(project.id)}
              onToggle={() => selection.toggle(project.id)}
              label={t`Select ${project.title}`}
            >
              <ProjectCard project={project} />
            </SelectableTile>
          ))}
        </div>
      )}

      <BulkDeleteDialog
        open={deleteOpen}
        kind="project"
        items={deleteItems}
        onClose={() => setDeleteOpen(false)}
        onDelete={deleteProjects}
        onDeleted={() => selection.clear()}
      />
    </>
  )
}
