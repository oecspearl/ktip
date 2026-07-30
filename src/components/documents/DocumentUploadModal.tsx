import { useEffect, useState, type ChangeEvent } from 'react'
import { Upload, FileText, X, Lock, Users, Globe, KeyRound } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Textarea } from '../ui/Textarea'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { useUploadDocument, type UploadStage } from '../../hooks/useEntityDocuments'
import { ACCEPT_ATTRIBUTE, formatFileSize, validateFile } from '../../lib/document-extract'
import type { DocumentEntityType, DocumentVisibility } from '../../types'

interface DocumentUploadModalProps {
  open: boolean
  onClose: () => void
  entityType: DocumentEntityType
  entityId: string
  /** Skips the AI pass for people who could not apply the results anyway. */
  canEditEntity: boolean
  /**
   * Forces the visibility and hides the picker. Grant applicants upload
   * privately, full stop — offering them a choice that includes "listed to
   * everyone" on a document they think of as confidential is the trap.
   */
  lockedVisibility?: DocumentVisibility
  /** Pre-fills the title, e.g. from a required-documents checklist row. */
  defaultTitle?: string
  /** Overrides the modal's subtitle when the audience is not a funder. */
  descriptionCopy?: string
}

export const VISIBILITY_OPTIONS: {
  value: DocumentVisibility
  label: string
  hint: string
  icon: typeof Lock
}[] = [
  { value: 'private', label: 'Private', hint: 'Only you. Nobody else sees it listed.', icon: Lock },
  {
    value: 'restricted',
    label: 'Restricted',
    hint: 'Listed to everyone; people ask you for access.',
    icon: KeyRound,
  },
  { value: 'members', label: 'All members', hint: 'Any signed-in KTIP member can open it.', icon: Users },
  { value: 'public', label: 'Public', hint: 'Anyone, including signed-out visitors.', icon: Globe },
]

const STAGE_COPY: Record<UploadStage, string> = {
  idle: '',
  uploading: 'Uploading the file…',
  scraping: 'Reading the document…',
  analyzing: 'Pulling out field values…',
  done: 'Done',
}

export function DocumentUploadModal({
  open,
  onClose,
  entityType,
  entityId,
  canEditEntity,
  lockedVisibility,
  defaultTitle,
  descriptionCopy,
}: DocumentUploadModalProps) {
  const auth = useAuth()
  const toast = useToast()
  const { uploadDocument, loading, stage, resetStage } = useUploadDocument()

  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState(defaultTitle || '')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState<DocumentVisibility>(
    lockedVisibility || 'restricted'
  )
  // A rejected file used to vanish into a toast; the reason now stays on the
  // dropzone until a valid file replaces it.
  const [fileError, setFileError] = useState<string | null>(null)

  // The checklist row the modal was opened from decides the title.
  useEffect(() => {
    if (open) setTitle(defaultTitle || '')
  }, [open, defaultTitle])

  const reset = () => {
    setFile(null)
    setTitle(defaultTitle || '')
    setDescription('')
    setVisibility(lockedVisibility || 'restricted')
    setFileError(null)
    resetStage()
  }

  const handleClose = () => {
    if (loading) return
    reset()
    onClose()
  }

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0]
    e.target.value = ''
    if (!picked) return

    const problem = validateFile(picked)
    if (problem) {
      setFileError(problem)
      toast.error(problem)
      return
    }

    setFileError(null)
    setFile(picked)
    // Default the title to the file name without its extension
    if (!title.trim()) {
      setTitle(picked.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim())
    }
  }

  const handleSubmit = async () => {
    if (!auth.user || !file || !title.trim()) return

    try {
      await uploadDocument({
        entityType,
        entityId,
        ownerId: auth.user.id,
        file,
        title: title.trim(),
        description: description.trim() || undefined,
        visibility,
        skipExtraction: !canEditEntity,
      })
      toast.success('Document uploaded')
      reset()
      onClose()
    } catch (err: any) {
      toast.error(err?.message || 'Failed to upload the document')
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Upload a document"
      description={
        descriptionCopy ??
        'Word, PDF, Excel, CSV, Markdown or an image. Text documents are read into an editable copy.'
      }
      size="xl"
      className="max-w-2xl"
    >
      <div className="space-y-5">
        {/* File picker */}
        {file ? (
          <div className="flex items-center gap-3 p-4 border border-ktip-sand-200 rounded-xl bg-ktip-sand-50">
            <FileText size={20} className="text-ktip-ocean-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ktip-sand-900 truncate">{file.name}</p>
              <p className="text-xs text-ktip-sand-500">{formatFileSize(file.size)}</p>
            </div>
            {!loading && (
              <button
                type="button"
                onClick={() => setFile(null)}
                className="p-1 rounded-lg hover:bg-ktip-sand-200 transition-colors"
                aria-label="Remove file"
              >
                <X size={16} className="text-ktip-sand-500" />
              </button>
            )}
          </div>
        ) : (
          <>
            <label
              className={`flex flex-col items-center justify-center gap-2 p-8 border-2 border-dashed rounded-xl cursor-pointer hover:border-ktip-ocean-500 hover:bg-ktip-sand-50 transition-colors ${
                fileError ? 'border-red-300 bg-red-50/40' : 'border-ktip-sand-300'
              }`}
            >
              <Upload size={24} className="text-ktip-sand-400" />
              <span className="text-sm font-medium text-ktip-sand-700">Choose a file</span>
              {/* Spreadsheets and .doc are accepted by both the bucket and
                  validateFile(); the old hint left them out, so people
                  reasonably assumed an .xlsx budget would be rejected. */}
              <span className="text-xs text-ktip-sand-500">
                PDF, Word, Excel, CSV, Markdown, text or image — up to 25MB
              </span>
              <input type="file" accept={ACCEPT_ATTRIBUTE} onChange={handleFile} className="hidden" />
            </label>
            {fileError && <p className="text-xs text-red-600">{fileError}</p>}
          </>
        )}

        <Input
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Call for Proposals 2026"
          fullWidth
          disabled={loading}
        />

        <Textarea
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What is this document and why does it matter?"
          rows={3}
          fullWidth
          disabled={loading}
        />

        {/* Visibility. Hidden entirely when the caller has fixed it — see
            lockedVisibility. */}
        {lockedVisibility ? (
          <div className="flex items-start gap-2 rounded-xl border border-ktip-sand-200 bg-ktip-sand-50 p-3">
            <Lock size={16} className="mt-0.5 shrink-0 text-ktip-sand-500" />
            <p className="text-xs text-ktip-sand-600">
              {VISIBILITY_OPTIONS.find((o) => o.value === lockedVisibility)?.hint}
            </p>
          </div>
        ) : (
        <div className="space-y-2">
          <p className="text-sm font-medium text-ktip-sand-700">Who can open it</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {VISIBILITY_OPTIONS.map((option) => {
              const Icon = option.icon
              const selected = visibility === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={loading}
                  onClick={() => setVisibility(option.value)}
                  className={`flex items-start gap-2 p-3 text-left border rounded-xl transition-colors ${
                    selected
                      ? 'border-ktip-ocean-500 bg-ktip-ocean-50'
                      : 'border-ktip-sand-200 hover:border-ktip-sand-300'
                  }`}
                >
                  <Icon size={16} className={selected ? 'text-ktip-ocean-600 mt-0.5' : 'text-ktip-sand-400 mt-0.5'} />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ktip-sand-900">{option.label}</span>
                    <span className="block text-xs text-ktip-sand-500">{option.hint}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
        )}

        {loading && stage !== 'idle' && (
          <div className="flex items-center gap-3 p-3 bg-ktip-ocean-50 border border-ktip-ocean-200 rounded-xl">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-ktip-ocean-600 border-t-transparent" />
            <p className="text-sm text-ktip-ocean-700">{STAGE_COPY[stage]}</p>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={loading} disabled={!file || !title.trim()}>
            Upload
          </Button>
        </div>
      </div>
    </Modal>
  )
}
