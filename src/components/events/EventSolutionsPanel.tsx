import { useState, type FormEvent } from 'react'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Textarea } from '../ui/Textarea'
import { ConfirmModal } from '../admin/ConfirmModal'
import { DocumentUploadModal } from '../documents/DocumentUploadModal'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import {
  useEventSolutions,
  useCreateSolution,
  useDeleteSolution,
} from '../../hooks/useEventSolutions'
import {
  useEntityDocuments,
  useUploadDocument,
  openDocument,
} from '../../hooks/useEntityDocuments'
import { formatFileSize, validateFile } from '../../lib/document-extract'
import type { EventSolution } from '../../types'
import {
  Lightbulb,
  Plus,
  X,
  Upload,
  FileText,
  Trash2,
  Download,
  ExternalLink,
  Lock,
} from 'lucide-react'
import { format } from 'date-fns'

interface EventSolutionsPanelProps {
  eventId: string
  /** Draft events accept nothing; RLS refuses the insert either way. */
  eventStatus: string
  submissionDeadline: string | null
  isOrganizer: boolean
}

/**
 * What participants submit against a challenge, and the files they attach.
 *
 * Who sees what is decided by RLS (migration 085), not here: before entries
 * close a participant's query returns only their own entry, while the
 * organizer's returns all of them. The panel renders whatever comes back and
 * says which of the two situations the reader is in.
 */
export function EventSolutionsPanel({
  eventId,
  eventStatus,
  submissionDeadline,
  isOrganizer,
}: EventSolutionsPanelProps) {
  const auth = useAuth()
  const toast = useToast()

  const { solutions, loading, refetch } = useEventSolutions(eventId)
  const { createSolution, loading: creating } = useCreateSolution()
  const { deleteSolution, loading: deleting } = useDeleteSolution()
  const { uploadDocument } = useUploadDocument()

  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [fileError, setFileError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<EventSolution | null>(null)

  const entriesClosed = submissionDeadline
    ? new Date(submissionDeadline).getTime() < Date.now()
    : false
  const canSubmit = !!auth.user && eventStatus !== 'draft' && !entriesClosed

  const resetForm = () => {
    setTitle('')
    setDescription('')
    setLinkUrl('')
    setFiles([])
    setFileError(null)
    setShowForm(false)
  }

  const addFiles = (list: FileList | null) => {
    if (!list?.length) return
    const accepted: File[] = []
    for (const file of Array.from(list)) {
      const problem = validateFile(file)
      if (problem) {
        setFileError(problem)
        continue
      }
      accepted.push(file)
    }
    if (accepted.length > 0) setFileError(null)
    setFiles((prev) => {
      const next = [...prev]
      for (const file of accepted) {
        if (!next.some((f) => f.name === file.name && f.size === file.size)) next.push(file)
      }
      return next
    })
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!auth.user || !title.trim()) return

    try {
      const solution = await createSolution({
        event_id: eventId,
        author_id: auth.user.id,
        title: title.trim(),
        description: description.trim() || null,
        link_url: linkUrl.trim() || null,
      })

      // The entry is saved from here on. A failed file downgrades to a warning
      // rather than losing the submission — the author can retry from the card.
      setUploading(true)
      const failed: string[] = []
      for (const file of files) {
        try {
          await uploadDocument({
            entityType: 'event_solution',
            entityId: solution.id,
            ownerId: auth.user.id,
            file,
            title: file.name.replace(/\.[^.]+$/, ''),
            visibility: 'restricted',
            // No AI field extraction: there is no parent record to propose
            // column values for, so the pass would only ever error.
            skipExtraction: true,
          })
        } catch {
          failed.push(file.name)
        }
      }

      if (failed.length > 0) {
        toast.error(
          `Solution submitted, but these files failed: ${failed.join(', ')}. Add them again from your entry.`
        )
      } else {
        toast.success('Solution submitted')
      }
      resetForm()
      refetch()
    } catch (err: any) {
      toast.error(err?.message || 'Failed to submit the solution')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteSolution(deleteTarget.id)
      toast.success('Solution withdrawn')
      setDeleteTarget(null)
      refetch()
    } catch (err: any) {
      toast.error(err?.message || 'Failed to withdraw the solution')
    }
  }

  const busy = creating || uploading

  return (
    <Card className="mt-10">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 bg-ktip-sun-100 rounded-xl flex items-center justify-center shrink-0">
            <Lightbulb size={20} className="text-ktip-sun-700" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-display font-bold text-ktip-sand-900">Solutions</h2>
            <p className="text-sm text-ktip-sand-600">
              {isOrganizer
                ? 'What participants have submitted to your challenge'
                : 'Answer the challenge and attach your supporting files'}
            </p>
          </div>
        </div>

        {canSubmit && !showForm && (
          <Button size="sm" icon={<Plus size={14} />} onClick={() => setShowForm(true)}>
            Submit a solution
          </Button>
        )}
      </div>

      {/* Why the list may look empty or short */}
      {!isOrganizer && !entriesClosed && (
        <p className="mt-3 flex items-start gap-2 text-xs text-ktip-sand-500">
          <Lock size={14} className="mt-0.5 shrink-0" />
          While entries are open you only see your own. Everyone's solutions become visible once
          submissions close
          {submissionDeadline ? ` on ${format(new Date(submissionDeadline), 'MMM d, yyyy')}` : ''}.
        </p>
      )}

      {!auth.user && !entriesClosed && (
        <p className="mt-3 text-sm text-ktip-sand-500">Sign in to submit a solution.</p>
      )}

      {entriesClosed && (
        <p className="mt-3 text-sm text-ktip-sand-500">
          Submissions closed {format(new Date(submissionDeadline as string), 'MMM d, yyyy · h:mm a')}.
        </p>
      )}

      {/* Submission form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="mt-5 border border-ktip-sand-200 rounded-xl p-4 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-ktip-sand-900">Your solution</h3>
            <button
              type="button"
              onClick={resetForm}
              disabled={busy}
              className="p-1 text-ktip-sand-400 hover:text-ktip-sand-600 transition-colors"
              aria-label="Cancel"
            >
              <X size={18} />
            </button>
          </div>

          <Input
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Flood early-warning alerts over SMS"
            fullWidth
            required
            disabled={busy}
          />

          <Textarea
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What you built, how it answers the challenge, and what is left to do..."
            rows={5}
            fullWidth
            disabled={busy}
          />

          <Input
            label="Link (Optional)"
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://… a demo, repo or write-up"
            fullWidth
            disabled={busy}
          />

          {/* Files */}
          <div>
            <p className="text-sm font-medium text-ktip-sand-700">Supporting files (Optional)</p>
            <p className="text-xs text-ktip-sand-500 mt-0.5 mb-2">
              Slides, a report, a dataset — PDF, Word, Excel, CSV, Markdown, text or image, up to
              25MB each. The organizer can always open what you attach here.
            </p>

            {files.length > 0 && (
              <div className="space-y-2 mb-2">
                {files.map((file, index) => (
                  <div
                    key={`${file.name}-${file.size}`}
                    className="flex items-center gap-3 border border-ktip-sand-200 rounded-xl px-3 py-2"
                  >
                    <FileText size={18} className="shrink-0 text-ktip-sand-500" />
                    <span className="flex-1 min-w-0 truncate text-sm text-ktip-sand-800">
                      {file.name}
                    </span>
                    <span className="shrink-0 text-xs text-ktip-sand-500">
                      {formatFileSize(file.size)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
                      disabled={busy}
                      className="p-1 text-ktip-sand-400 hover:text-red-600 transition-colors"
                      aria-label={`Remove ${file.name}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <label className="inline-flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-ktip-sand-300 rounded-xl text-sm text-ktip-sand-600 hover:border-ktip-ocean-400 hover:text-ktip-ocean-600 transition-colors cursor-pointer">
              <Upload size={16} />
              Add files
              <input
                type="file"
                multiple
                className="hidden"
                disabled={busy}
                onChange={(e) => {
                  addFiles(e.target.files)
                  e.target.value = ''
                }}
              />
            </label>
            {fileError && <p className="mt-2 text-xs text-red-600">{fileError}</p>}
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={resetForm} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={busy} disabled={!title.trim()}>
              {uploading ? 'Uploading files…' : 'Submit solution'}
            </Button>
          </div>
        </form>
      )}

      {/* Entries */}
      {loading ? (
        <p className="py-8 text-center text-sm text-ktip-sand-500">Loading solutions…</p>
      ) : !solutions || solutions.length === 0 ? (
        !showForm && (
          <p className="py-8 text-center text-sm text-ktip-sand-500">
            {isOrganizer
              ? 'No solutions submitted yet.'
              : entriesClosed
                ? 'No solutions were submitted.'
                : 'No solution from you yet.'}
          </p>
        )
      ) : (
        <div className="mt-5 space-y-4">
          {solutions.map((solution) => (
            <SolutionCard
              key={solution.id}
              solution={solution}
              isAuthor={solution.author_id === auth.user?.id}
              canAttach={solution.author_id === auth.user?.id && !entriesClosed}
              onWithdraw={() => setDeleteTarget(solution)}
              canWithdraw={solution.author_id === auth.user?.id || isOrganizer}
            />
          ))}
        </div>
      )}

      <ConfirmModal
        open={!!deleteTarget}
        title="Withdraw solution"
        message="This removes the entry and every file attached to it. This cannot be undone."
        confirmLabel="Withdraw"
        confirmVariant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </Card>
  )
}

interface SolutionCardProps {
  solution: EventSolution
  isAuthor: boolean
  canAttach: boolean
  canWithdraw: boolean
  onWithdraw: () => void
}

function SolutionCard({ solution, isAuthor, canAttach, canWithdraw, onWithdraw }: SolutionCardProps) {
  const toast = useToast()
  const [showUpload, setShowUpload] = useState(false)
  const { documents } = useEntityDocuments('event_solution', solution.id)

  const handleDownload = async (path: string | null, fileName: string) => {
    if (!path) {
      toast.error('You do not have access to this file')
      return
    }
    const ok = await openDocument(path, fileName)
    if (!ok) toast.error('Could not open the file')
  }

  return (
    <div className="border border-ktip-sand-200 rounded-xl p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-medium text-ktip-sand-900">
            {solution.title}
            {isAuthor && (
              <span className="ml-2 text-xs font-normal text-ktip-ocean-600">Your entry</span>
            )}
          </h3>
          <p className="text-xs text-ktip-sand-500 mt-0.5">
            {solution.author?.display_name || 'A participant'} ·{' '}
            {format(new Date(solution.created_at), 'MMM d, yyyy')}
          </p>
        </div>

        {canWithdraw && (
          <button
            type="button"
            onClick={onWithdraw}
            className="p-1.5 text-ktip-sand-400 hover:text-red-600 transition-colors"
            title="Withdraw solution"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>

      {solution.description && (
        <p className="mt-2 text-sm text-ktip-sand-700 whitespace-pre-wrap">{solution.description}</p>
      )}

      {solution.link_url && (
        <a
          href={solution.link_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1.5 text-sm text-ktip-ocean-600 hover:text-ktip-ocean-700 transition-colors break-all"
        >
          <ExternalLink size={14} className="shrink-0" />
          {solution.link_url}
        </a>
      )}

      {documents && documents.length > 0 && (
        <div className="mt-3 space-y-2">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center gap-3 rounded-lg bg-ktip-sand-50 px-3 py-2"
            >
              <FileText size={16} className="shrink-0 text-ktip-sand-500" />
              <span className="flex-1 min-w-0 truncate text-sm text-ktip-sand-800">
                {doc.title}
              </span>
              <span className="shrink-0 text-xs text-ktip-sand-500">
                {formatFileSize(doc.file_size)}
              </span>
              <button
                type="button"
                onClick={() => handleDownload(doc.storage_path, doc.file_name)}
                className="p-1 text-ktip-sand-400 hover:text-ktip-ocean-600 transition-colors"
                title="Open file"
              >
                <Download size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {canAttach && (
        <>
          <button
            type="button"
            onClick={() => setShowUpload(true)}
            className="mt-3 inline-flex items-center gap-1.5 text-sm text-ktip-ocean-600 hover:text-ktip-ocean-700 transition-colors"
          >
            <Upload size={14} />
            Add a file
          </button>

          {/* canEditEntity={false}: the AI pass proposes column values for a
              parent record, and a solution has none — it would only ever error. */}
          <DocumentUploadModal
            open={showUpload}
            onClose={() => setShowUpload(false)}
            entityType="event_solution"
            entityId={solution.id}
            canEditEntity={false}
            descriptionCopy="Attach a file to your solution. The organizer can always open what you attach."
          />
        </>
      )}
    </div>
  )
}
