import { useState } from 'react'
import { FileText, Upload, X } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { useFileDrop } from '../../hooks/useFileDrop'
import {
  ACCEPTED_MIME_TYPES,
  ACCEPT_ATTRIBUTE,
  formatFileSize,
  validateFile,
} from '../../lib/document-extract'

interface ResourceFileFieldProps {
  file: File | null
  onChange: (file: File | null) => void
  /** Validation message from the parent form, e.g. after a failed submit. */
  error?: string
  disabled?: boolean
}

/**
 * The file picker on the resource submission form.
 *
 * Same shape as DocumentUploadModal's picker — a dashed drop zone that becomes a
 * chip once something is chosen — but standalone rather than modal-bound, since
 * a resource submission is a whole page and the file is one field among nine.
 *
 * Validation runs here rather than at submit: the bucket enforces the same size
 * and MIME rules (migration 135), and finding out at upload time means the
 * member has already filled in eight other fields.
 */
export function ResourceFileField({ file, onChange, error, disabled }: ResourceFileFieldProps) {
  const { t } = useLingui()

  // A rejected file is never held in state, so its reason has to live
  // separately — otherwise "that .exe is not supported" vanishes on the same
  // render that clears the selection, and the zone just silently stays empty.
  const [rejection, setRejection] = useState<string | null>(null)

  const take = (next: File) => {
    const message = validateFile(next)
    setRejection(message)
    onChange(message ? null : next)
  }

  const { isDragging, dropProps } = useFileDrop({
    onFiles: (files) => {
      if (files[0]) take(files[0])
    },
    accept: ACCEPTED_MIME_TYPES,
    disabled,
  })

  const shown = error || rejection

  if (file) {
    return (
      <div>
        <label className="block text-label font-medium text-ktip-sand-700 mb-2">
          <Trans>File</Trans>
        </label>
        <div className="flex items-center gap-3 rounded-xl border border-ktip-sand-200 bg-ktip-sand-50 p-4">
          <FileText size={20} className="shrink-0 text-ktip-ocean-600" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-label font-medium text-ktip-sand-900">{file.name}</p>
            <p className="text-caption text-ktip-sand-500">{formatFileSize(file.size)}</p>
          </div>
          {!disabled && (
            <button
              type="button"
              onClick={() => { setRejection(null); onChange(null) }}
              className="rounded-lg p-1 transition-colors hover:bg-ktip-sand-200"
              aria-label={t`Remove file`}
            >
              <X size={16} className="text-ktip-sand-500" />
            </button>
          )}
        </div>
        {shown && <p className="mt-1 text-caption text-red-600">{shown}</p>}
      </div>
    )
  }

  return (
    <div>
      <label className="block text-label font-medium text-ktip-sand-700 mb-2">
        <Trans>File</Trans>
      </label>
      <label
        {...dropProps}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 transition-colors hover:border-ktip-ocean-500 hover:bg-ktip-sand-50 ${
          shown
            ? 'border-red-300 bg-red-50/40'
            : isDragging
              ? 'border-ktip-ocean-500 bg-ktip-sand-50'
              : 'border-ktip-sand-300'
        }`}
      >
        <Upload size={24} className="text-ktip-sand-400" />
        <span className="text-label font-medium text-ktip-sand-700">
          <Trans>Choose a file, or drag one here</Trans>
        </span>
        <span className="text-caption text-ktip-sand-500">
          <Trans>PDF, Word, Excel, CSV, Markdown, text or image — up to 25MB</Trans>
        </span>
        <span className="text-caption text-ktip-sand-500">
          <Trans>Optional if you are linking to a resource hosted elsewhere.</Trans>
        </span>
        <input
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          disabled={disabled}
          onChange={(e) => {
            const next = e.target.files?.[0]
            if (next) take(next)
            // Reset so choosing the same file twice still fires onChange.
            e.target.value = ''
          }}
          className="hidden"
        />
      </label>
      {shown && <p className="mt-1 text-caption text-red-600">{shown}</p>}
    </div>
  )
}
