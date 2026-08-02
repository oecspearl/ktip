import { useState } from 'react'
import type { EventCriterion, EventCriterionKind } from '../../../types'
import {
  useEventCriteria,
  useCreateCriterion,
  useUpdateCriterion,
  useDeleteCriterion,
  useReorderCriteria,
  groupCriteria,
} from '../../../hooks/useEventCriteria'
import { useUpdateEvent } from '../../../hooks/useEvents'
import { useToast } from '../../../contexts/ToastContext'
import { Button } from '../../../components/ui/Button'
import { Badge } from '../../../components/ui/Badge'
import { ConfirmModal } from '../../../components/admin/ConfirmModal'
import {
  EVENT_CRITERION_KINDS,
  EVENT_CRITERION_LABELS,
  EVENT_CRITERION_GROUP_LABELS,
  EVENT_CRITERION_GROUP_HINTS,
  EVENT_CRITERION_COLORS,
} from '../../../lib/constants'
import { Plus, Trash2, Edit, Save, X, Target, ArrowUp, ArrowDown } from 'lucide-react'

interface AdminEventChallengeTabProps {
  eventId: string
  hasChallenge: boolean
  submissionDeadline: string | null
  /** Re-reads the event so the toggle and deadline reflect what was saved. */
  onEventChange: () => void
  /**
   * `judging` narrows this to scoring criteria only, for a demo day — which is
   * nothing but judging and has no objectives or deliverables to write. It also
   * drops the has_challenge toggle, because on those types the flag is set by
   * the event type rather than chosen here.
   */
  mode?: 'full' | 'judging'
}

/** ISO → the value format a datetime-local input accepts. */
function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function AdminEventChallengeTab(props: AdminEventChallengeTabProps) {
  const judgingOnly = props.mode === 'judging'
  /** The one kind a judging-only view can add, and the default everywhere else. */
  const defaultKind: EventCriterionKind = judgingOnly ? 'judging_criterion' : 'objective'
  const offeredKinds = judgingOnly
    ? (['judging_criterion'] as EventCriterionKind[])
    : EVENT_CRITERION_KINDS

  const toast = useToast()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<EventCriterion | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  // Form state
  const [kind, setKind] = useState<EventCriterionKind>(defaultKind)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [isRequired, setIsRequired] = useState(true)
  const [weight, setWeight] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Deadline is edited inline, so it needs its own dirty state
  const [deadline, setDeadline] = useState(toLocalInput(props.submissionDeadline))

  const { criteria, loading, refetch } = useEventCriteria(props.eventId)
  const { createCriterion, loading: creating } = useCreateCriterion()
  const { updateCriterion, loading: updating } = useUpdateCriterion()
  const { deleteCriterion, loading: deleting } = useDeleteCriterion()
  const { reorder, loading: reordering } = useReorderCriteria()
  const { updateEvent, loading: savingEvent } = useUpdateEvent()

  // A demo day that once had objectives written against it still should not
  // show them here — the filter is on display, not just on what can be added.
  const groups = groupCriteria(criteria).filter(
    (group) => !judgingOnly || group.kind === 'judging_criterion'
  )
  const isJudging = kind === 'judging_criterion'

  const resetForm = () => {
    setKind(defaultKind)
    setTitle('')
    setDescription('')
    setIsRequired(true)
    setWeight('')
    setErrors({})
    setShowForm(false)
    setEditing(null)
  }

  const startAdd = (presetKind: EventCriterionKind) => {
    resetForm()
    setKind(presetKind)
    setShowForm(true)
  }

  const startEdit = (criterion: EventCriterion) => {
    setEditing(criterion)
    setKind(criterion.kind)
    setTitle(criterion.title)
    setDescription(criterion.description || '')
    setIsRequired(criterion.is_required)
    setWeight(criterion.weight != null ? String(criterion.weight) : '')
    setErrors({})
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const fieldErrors: Record<string, string> = {}
    if (!title.trim()) fieldErrors.title = 'Title is required'
    if (isJudging && weight.trim() && Number.isNaN(Number(weight))) {
      fieldErrors.weight = 'Weight must be a number'
    }
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors)
      return
    }

    const parsedWeight = isJudging && weight.trim() ? Number(weight) : null

    try {
      if (editing) {
        await updateCriterion(editing.id, {
          kind,
          title: title.trim(),
          description: description.trim() || null,
          is_required: isRequired,
          weight: parsedWeight,
        })
        toast.success('Item updated')
      } else {
        // Appended to the end of its own kind, not the whole brief.
        const inKind = (criteria || []).filter((c) => c.kind === kind)
        const nextOrder = inKind.length
          ? Math.max(...inKind.map((c) => c.sort_order)) + 1
          : 0

        await createCriterion({
          event_id: props.eventId,
          kind,
          title: title.trim(),
          description: description.trim() || null,
          is_required: isRequired,
          weight: parsedWeight,
          sort_order: nextOrder,
        })
        toast.success(`${EVENT_CRITERION_LABELS[kind]} added`)
      }
      resetForm()
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to save item')
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteCriterion(deleteTarget)
      toast.success('Item deleted')
      setDeleteTarget(null)
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete item')
    }
  }

  const move = async (items: EventCriterion[], index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= items.length) return

    const next = [...items]
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)

    try {
      await reorder(props.eventId, next)
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to reorder')
    }
  }

  const toggleChallenge = async (enabled: boolean) => {
    try {
      await updateEvent(props.eventId, { has_challenge: enabled } as any)
      toast.success(enabled ? 'Challenge enabled' : 'Challenge disabled')
      props.onEventChange()
    } catch (err: any) {
      toast.error(err.message || 'Failed to update event')
    }
  }

  const saveDeadline = async () => {
    try {
      await updateEvent(props.eventId, {
        submission_deadline: deadline ? new Date(deadline).toISOString() : null,
      } as any)
      toast.success('Submission deadline saved')
      props.onEventChange()
    } catch (err: any) {
      toast.error(err.message || 'Failed to save deadline')
    }
  }

  const deadlineDirty = deadline !== toLocalInput(props.submissionDeadline)

  return (
    <div className="space-y-6">
      {/* Challenge settings */}
      <div className="bg-ktip-cream rounded-xl border border-ktip-sand-200 shadow-card p-6 space-y-4">
        {!judgingOnly && (
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={props.hasChallenge}
              disabled={savingEvent}
              onChange={(e) => toggleChallenge(e.currentTarget.checked)}
              className="mt-0.5 w-5 h-5 text-ktip-ocean-600 border-ktip-sand-300 rounded focus:ring-ktip-ocean-500"
            />
            <span>
              <span className="block text-sm font-medium text-ktip-sand-900">
                This event sets a challenge
              </span>
              <span className="block text-xs text-ktip-sand-500 mt-0.5">
                Attendees are given a goal to accomplish. The brief below is shown on the public
                event page only while this is on.
              </span>
            </span>
          </label>
        )}

        <div className={judgingOnly ? '' : 'pt-4 border-t border-ktip-sand-200'}>
          <label className="block text-sm font-medium text-ktip-sand-700 mb-1">
            Submission Deadline
          </label>
          <p className="text-xs text-ktip-sand-500 mb-2">
            When entries close. Can differ from the event end date if judging runs on afterwards.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.currentTarget.value)}
              className="px-3 py-2.5 border border-ktip-sand-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500 transition-colors"
            />
            {deadline && (
              <button
                type="button"
                onClick={() => setDeadline('')}
                className="text-xs text-ktip-sand-500 hover:text-ktip-sand-700"
              >
                Clear
              </button>
            )}
            <Button
              size="sm"
              variant="outline"
              icon={<Save size={14} />}
              disabled={!deadlineDirty}
              loading={savingEvent}
              onClick={saveDeadline}
            >
              Save
            </Button>
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-ktip-sand-900">
            {judgingOnly ? 'Judging Criteria' : 'Challenge Brief'}
          </h3>
          {!!groups.length && (
            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium bg-ktip-ocean-100 text-ktip-ocean-700">
              {groups.reduce((n, group) => n + group.items.length, 0)}
            </span>
          )}
        </div>
        {!showForm && (
          <Button size="sm" icon={<Plus size={14} />} onClick={() => startAdd(defaultKind)}>
            {judgingOnly ? 'Add Criterion' : 'Add Item'}
          </Button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-ktip-cream rounded-xl border border-ktip-sand-200 shadow-card p-6 space-y-4"
        >
          <fieldset disabled={creating || updating}>
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium text-ktip-sand-900">
                {editing ? 'Edit Item' : 'Add Item'}
              </h4>
              <button
                type="button"
                onClick={resetForm}
                className="p-1 text-ktip-sand-400 hover:text-ktip-sand-600"
              >
                <X size={18} />
              </button>
            </div>

            {/* Kind — a judging-only view has one choice, so it just says so */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-ktip-sand-700 mb-1">
                Type <span className="text-red-500">*</span>
              </label>
              {judgingOnly ? (
                <p className="text-sm text-ktip-sand-800">
                  {EVENT_CRITERION_LABELS.judging_criterion}
                </p>
              ) : (
                <select
                  value={kind}
                  onChange={(e) => setKind(e.currentTarget.value as EventCriterionKind)}
                  className="w-full px-3 py-2.5 border border-ktip-sand-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500 transition-colors"
                >
                  {offeredKinds.map((k) => (
                    <option key={k} value={k}>
                      {EVENT_CRITERION_LABELS[k]}
                    </option>
                  ))}
                </select>
              )}
              <p className="text-xs text-ktip-sand-500 mt-1">
                {EVENT_CRITERION_GROUP_HINTS[kind]}
              </p>
            </div>

            {/* Title */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-ktip-sand-700 mb-1">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.currentTarget.value)}
                className="w-full px-3 py-2.5 border border-ktip-sand-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500 transition-colors"
                placeholder={
                  isJudging
                    ? 'e.g. Technical execution'
                    : kind === 'constraint'
                    ? 'e.g. Must use open data only'
                    : kind === 'deliverable'
                    ? 'e.g. 3-minute demo video'
                    : 'e.g. Cut water loss in a distribution network'
                }
              />
              {errors.title && <p className="text-xs text-red-500 mt-1">{errors.title}</p>}
            </div>

            {/* Description */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-ktip-sand-700 mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.currentTarget.value)}
                rows={3}
                className="w-full px-3 py-2.5 border border-ktip-sand-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500 transition-colors resize-none"
                placeholder="Detail participants need in order to act on this..."
              />
            </div>

            {/* Weight (judging) or Required (everything else) */}
            {isJudging ? (
              <div className="mb-4">
                <label className="block text-sm font-medium text-ktip-sand-700 mb-1">
                  Weight
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={weight}
                  onChange={(e) => setWeight(e.currentTarget.value)}
                  className="w-full px-3 py-2.5 border border-ktip-sand-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500 transition-colors"
                  placeholder="e.g. 30"
                />
                <p className="text-xs text-ktip-sand-500 mt-1">
                  Relative share of the total score. Leave empty to weight all criteria equally.
                </p>
                {errors.weight && <p className="text-xs text-red-500 mt-1">{errors.weight}</p>}
              </div>
            ) : (
              <label className="flex items-center gap-3 cursor-pointer mb-4">
                <input
                  type="checkbox"
                  checked={isRequired}
                  onChange={(e) => setIsRequired(e.currentTarget.checked)}
                  className="w-5 h-5 text-ktip-ocean-600 border-ktip-sand-300 rounded focus:ring-ktip-ocean-500"
                />
                <span className="text-sm text-ktip-sand-700">
                  Required — entries that miss this do not qualify
                </span>
              </label>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={resetForm} type="button">
                Cancel
              </Button>
              <Button
                size="sm"
                type="submit"
                icon={<Save size={14} />}
                loading={creating || updating}
              >
                {editing ? 'Save Changes' : 'Add Item'}
              </Button>
            </div>
          </fieldset>
        </form>
      )}

      {/* Brief */}
      {loading ? (
        <div className="text-center text-ktip-sand-500 py-8">Loading brief...</div>
      ) : groups.length ? (
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.kind}>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h4 className="font-semibold text-ktip-sand-900">
                    {EVENT_CRITERION_GROUP_LABELS[group.kind]}
                  </h4>
                  <p className="text-xs text-ktip-sand-500">
                    {EVENT_CRITERION_GROUP_HINTS[group.kind]}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => startAdd(group.kind)}
                  className="inline-flex items-center gap-1 text-xs text-ktip-ocean-600 hover:text-ktip-ocean-700 transition-colors"
                >
                  <Plus size={12} />
                  Add
                </button>
              </div>

              <div className="space-y-2">
                {group.items.map((item, index) => (
                  <div
                    key={item.id}
                    className="group bg-ktip-cream rounded-xl border border-ktip-sand-200 p-4 hover:shadow-card-hover transition-shadow"
                  >
                    <div className="flex items-start gap-3">
                      {/* Reorder */}
                      <div className="flex flex-col flex-shrink-0 -my-1">
                        <button
                          type="button"
                          disabled={index === 0 || reordering}
                          onClick={() => move(group.items, index, -1)}
                          className="p-0.5 text-ktip-sand-400 hover:text-ktip-ocean-600 disabled:opacity-30 disabled:hover:text-ktip-sand-400 transition-colors"
                          title="Move up"
                        >
                          <ArrowUp size={14} />
                        </button>
                        <button
                          type="button"
                          disabled={index === group.items.length - 1 || reordering}
                          onClick={() => move(group.items, index, 1)}
                          className="p-0.5 text-ktip-sand-400 hover:text-ktip-ocean-600 disabled:opacity-30 disabled:hover:text-ktip-sand-400 transition-colors"
                          title="Move down"
                        >
                          <ArrowDown size={14} />
                        </button>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h5 className="font-medium text-ktip-sand-900">{item.title}</h5>
                          <Badge className={EVENT_CRITERION_COLORS[item.kind] || ''}>
                            {EVENT_CRITERION_LABELS[item.kind]}
                          </Badge>
                          {item.kind === 'judging_criterion'
                            ? item.weight != null && (
                                <span className="text-xs text-ktip-sand-500">
                                  weight {item.weight}
                                </span>
                              )
                            : !item.is_required && (
                                <span className="text-xs text-ktip-sand-500">optional</span>
                              )}
                        </div>
                        {item.description && (
                          <p className="text-sm text-ktip-sand-600 mt-1 whitespace-pre-wrap">
                            {item.description}
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => startEdit(item)}
                          className="p-1.5 text-ktip-sand-400 hover:text-ktip-ocean-600 transition-colors"
                          title="Edit item"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(item.id)}
                          className="p-1.5 text-ktip-sand-400 hover:text-red-600 transition-colors"
                          title="Delete item"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        !showForm && (
          <div className="bg-ktip-cream rounded-xl border border-ktip-sand-200 shadow-card p-12 text-center">
            <Target size={48} className="mx-auto text-ktip-sand-300 mb-4" />
            <h3 className="text-lg font-semibold text-ktip-sand-700 mb-1">
              {judgingOnly ? 'Nothing to score against yet' : 'No brief yet'}
            </h3>
            <p className="text-ktip-sand-500 text-sm mb-4">
              {judgingOnly
                ? 'Set what judges are scoring each pitch on, and how much each criterion is worth.'
                : 'Set the objectives participants must achieve, the constraints they work under, what they hand in, and how entries get judged.'}
            </p>
            <Button size="sm" icon={<Plus size={14} />} onClick={() => startAdd(defaultKind)}>
              {judgingOnly ? 'Add First Criterion' : 'Add First Objective'}
            </Button>
          </div>
        )
      )}

      {/* Delete Confirm */}
      <ConfirmModal
        open={!!deleteTarget}
        title="Delete Item"
        message="Are you sure you want to delete this item from the brief? This action cannot be undone."
        confirmLabel="Delete"
        confirmVariant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
