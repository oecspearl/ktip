import { useCallback, useState, type ChangeEvent } from 'react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Textarea } from '../../components/ui/Textarea'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { useMyVerificationRequest, useSubmitVerification } from '../../hooks/useVerification'
import { useFileDrop } from '../../hooks/useFileDrop'
import { BadgeCheck, Clock, XCircle, Upload, FileText, X } from 'lucide-react'
import { formatDate } from '../../lib/utils'

const MAX_FILES = 3
const MAX_SIZE = 10 * 1024 * 1024 // matches the bucket limit
const ACCEPTED = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']

export function VerificationTab() {
  const auth = useAuth()
  const toast = useToast()
  const { request, loading } = useMyVerificationRequest(auth.user?.id)
  const { submitRequest, loading: submitting } = useSubmitVerification()

  const [files, setFiles] = useState<File[]>([])
  const [note, setNote] = useState('')

  const isVerified = auth.profile?.is_verified

  const addFiles = useCallback(
    (picked: File[]) => {
      const valid = picked.filter((f) => {
        if (!ACCEPTED.includes(f.type)) {
          toast.error(`${f.name}: only PDF, JPG, PNG, or WebP files are allowed`)
          return false
        }
        if (f.size > MAX_SIZE) {
          toast.error(`${f.name}: file exceeds the 10MB limit`)
          return false
        }
        return true
      })
      setFiles((prev) => [...prev, ...valid].slice(0, MAX_FILES))
    },
    [toast]
  )

  const handleFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || [])
    e.target.value = ''
    addFiles(picked)
  }

  // No `accept` filter here — addFiles reports rejected files by name instead of
  // dropping them silently.
  const { isDragging, dropProps } = useFileDrop({
    onFiles: addFiles,
    multiple: true,
    disabled: submitting,
  })

  const handleSubmit = async () => {
    if (!auth.user || files.length === 0) return
    try {
      await submitRequest({ userId: auth.user.id, files, note: note.trim() || undefined })
      setFiles([])
      setNote('')
      toast.success('Verification request submitted')
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit request')
    }
  }

  if (loading) {
    return <Card><p className="text-sm text-ktip-sand-500 py-8 text-center">Loading…</p></Card>
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-ktip-ocean-100 rounded-xl flex items-center justify-center">
            <BadgeCheck size={20} className="text-ktip-ocean-600" />
          </div>
          <div>
            <h2 className="text-lg font-display font-bold text-ktip-sand-900">Identity Verification</h2>
            <p className="text-sm text-ktip-sand-600">
              Verified members get a badge on their profile
            </p>
          </div>
        </div>

        {isVerified ? (
          <div className="flex items-center gap-2 p-4 bg-ktip-tropical-50 border border-ktip-tropical-200 rounded-lg text-ktip-tropical-700">
            <BadgeCheck size={20} />
            <p className="text-sm font-medium">Your account is verified.</p>
          </div>
        ) : request?.status === 'pending' ? (
          <div className="flex items-start gap-2 p-4 bg-ktip-sun-50 border border-ktip-sun-200 rounded-lg text-ktip-sun-800">
            <Clock size={20} className="shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">Your verification request is under review.</p>
              <p className="text-xs mt-1">Submitted {formatDate(request.created_at)}</p>
            </div>
          </div>
        ) : (
          <>
            {request?.status === 'rejected' && (
              <div className="flex items-start gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 mb-4">
                <XCircle size={20} className="shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Your previous request was not approved.</p>
                  {request.admin_note && <p className="text-xs mt-1">{request.admin_note}</p>}
                  <p className="text-xs mt-1">You can submit a new request below.</p>
                </div>
              </div>
            )}

            <p className="text-sm text-ktip-sand-600 mb-4">
              Upload an identity document (national ID, passport, or business registration) as PDF
              or image. Documents are stored privately and only visible to OECS administrators.
            </p>

            {/* File picker */}
            <label
              {...dropProps}
              className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-6 cursor-pointer transition-colors mb-3 ${
                isDragging
                  ? 'border-ktip-ocean-400 bg-ktip-ocean-50/50'
                  : 'border-ktip-sand-300 hover:border-ktip-ocean-400 hover:bg-ktip-ocean-50/30'
              }`}
            >
              <Upload size={22} className="text-ktip-sand-400" />
              <span className="text-sm text-ktip-sand-600">
                {isDragging
                  ? 'Drop files to add'
                  : `Click or drag files here (PDF, JPG, PNG, WebP — max ${MAX_FILES} files, 10MB each)`}
              </span>
              <input
                type="file"
                accept={ACCEPTED.join(',')}
                multiple
                onChange={handleFiles}
                className="hidden"
              />
            </label>

            {files.length > 0 && (
              <div className="space-y-2 mb-4">
                {files.map((file, i) => (
                  <div key={`${file.name}-${i}`} className="flex items-center justify-between px-3 py-2 bg-ktip-sand-50 border border-ktip-sand-200 rounded-lg">
                    <span className="flex items-center gap-2 text-sm text-ktip-sand-700 truncate">
                      <FileText size={16} className="shrink-0" />
                      {file.name}
                    </span>
                    <button
                      onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                      className="p-1 text-ktip-sand-400 hover:text-red-500"
                      aria-label={`Remove ${file.name}`}
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <Textarea
              label="Note (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Anything the reviewers should know..."
              fullWidth
            />

            <div className="flex justify-end mt-4">
              <Button onClick={handleSubmit} disabled={files.length === 0} loading={submitting}>
                Submit for Verification
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
