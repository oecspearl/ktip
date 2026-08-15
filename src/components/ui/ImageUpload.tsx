import { useCallback, useRef, useState, type ChangeEvent } from 'react'
import { useToast } from '../../contexts/ToastContext'
import { useFileDrop } from '../../hooks/useFileDrop'
import { IMAGE_PRESETS } from '../../lib/constants'
import { uploadOptimizedImage } from '../../lib/storage-upload'
import type { OptimizeOptions } from '../../lib/image-optimize'
import { cn } from '../../lib/utils'
import { Camera, X, Loader2 } from 'lucide-react'
import { useLingui } from '@lingui/react/macro'

interface ImageUploadProps {
  bucket: string
  path: string
  currentUrl?: string
  onUpload: (url: string) => void
  onRemove?: () => void
  placeholder?: string
  className?: string
  maxSizeMB?: number
  /** Downscale/encode settings applied before upload. */
  preset?: OptimizeOptions
}

const ACCEPT = ['image/*'] as const

export function ImageUpload({
  bucket,
  path,
  currentUrl,
  onUpload,
  onRemove,
  placeholder,
  className,
  maxSizeMB,
  preset = IMAGE_PRESETS.SPEAKER,
}: ImageUploadProps) {
    const { t } = useLingui()
  const toast = useToast()
  const [uploading, setUploading] = useState(false)
  // The safety check adds a second or two after the bytes are already up.
  // Saying "Uploading…" through it would be a lie, and a lie that makes the
  // slowest part of the interaction look like a stall.
  const [phase, setPhase] = useState<'uploading' | 'checking'>('uploading')
  const [preview, setPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const maxSize = (maxSizeMB ?? 5) * 1024 * 1024
  const displayUrl = preview || currentUrl || null

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) {
        toast.error(t`Please select an image file`)
        return
      }

      // Checked before optimization so a huge file is never handed to the decoder.
      if (file.size > maxSize) {
        // Hoisted so the catalog entry reads `{limitMb}` rather than `{0}`.
        const limitMb = maxSizeMB ?? 5
        toast.error(t`Image must be less than ${limitMb}MB`)
        return
      }

      setUploading(true)
      setPhase('uploading')
      try {
        const publicUrl = await uploadOptimizedImage({
          bucket,
          basePath: path,
          file,
          preset,
          onPhase: setPhase,
        })

        setPreview(publicUrl)
        onUpload(publicUrl)
        toast.success(t`Image uploaded`)
      } catch (err: any) {
        // Only the fallback is ours to translate. `err.message` comes from
        // Supabase storage or the browser and stays in whatever language it
        // arrived in — documented, not fixable from here.
        toast.error(err.message || t`Failed to upload image`)
      } finally {
        setUploading(false)
      }
    },
    [bucket, path, preset, maxSize, maxSizeMB, onUpload, toast]
  )

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.target
    const file = input.files?.[0]
    input.value = ''
    if (file) await handleFile(file)
  }

  const { isDragging, dropProps } = useFileDrop({
    onFiles: (files) => void handleFile(files[0]),
    accept: ACCEPT,
    disabled: uploading,
  })

  const handleRemove = () => {
    setPreview(null)
    onRemove?.()
  }

  return (
    <div className={cn('relative', className)} {...dropProps}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect}
      />

      {displayUrl ? (
        <div className="relative group">
          <img
            src={displayUrl}
            alt={t`Uploaded`}
            className={cn(
              'w-full h-32 object-cover rounded-xl border transition-colors',
              isDragging ? 'border-ktip-ocean-400 ring-2 ring-ktip-ocean-300' : 'border-ktip-sand-200'
            )}
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 rounded-xl transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="p-2 bg-ktip-cream rounded-full shadow-soft text-ktip-sand-700 hover:text-ktip-ocean-600 transition-colors"
              title={t`Change image`}
            >
              <Camera size={16} />
            </button>
            {onRemove && (
              <button
                type="button"
                onClick={handleRemove}
                className="p-2 bg-ktip-cream rounded-full shadow-soft text-ktip-sand-700 hover:text-red-500 transition-colors"
                title={t`Remove image`}
              >
                <X size={16} />
              </button>
            )}
          </div>
          {uploading && (
            <div className="absolute inset-0 bg-white/60 rounded-xl flex items-center justify-center">
              <Loader2 size={24} className="animate-spin text-ktip-ocean-500" />
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className={cn(
            'w-full flex flex-col items-center justify-center gap-2 px-4 py-6 border-2 border-dashed rounded-xl transition-colors cursor-pointer',
            isDragging
              ? 'border-ktip-ocean-400 bg-ktip-ocean-50/50'
              : 'border-ktip-sand-300 bg-ktip-sand-50/50 hover:border-ktip-ocean-400 hover:bg-ktip-ocean-50/30'
          )}
        >
          {uploading ? (
            <Loader2 size={24} className="animate-spin text-ktip-ocean-500" />
          ) : (
            <Camera size={24} className="text-ktip-sand-400" />
          )}
          <span className="text-sm text-ktip-sand-500">
            {uploading
              ? phase === 'checking'
                ? t`Checking image...`
                : t`Uploading...`
              : isDragging
                ? t`Drop image to upload`
                : placeholder || t`Click or drag an image here`}
          </span>
        </button>
      )}
    </div>
  )
}
