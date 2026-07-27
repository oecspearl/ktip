import { useRef, useState, type ChangeEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../contexts/ToastContext'
import { cn } from '../../lib/utils'
import { Camera, X, Loader2 } from 'lucide-react'

interface ImageUploadProps {
  bucket: string
  path: string
  currentUrl?: string
  onUpload: (url: string) => void
  onRemove?: () => void
  placeholder?: string
  className?: string
  maxSizeMB?: number
}

export function ImageUpload({
  bucket,
  path,
  currentUrl,
  onUpload,
  onRemove,
  placeholder,
  className,
  maxSizeMB,
}: ImageUploadProps) {
  const toast = useToast()
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const maxSize = (maxSizeMB ?? 5) * 1024 * 1024
  const displayUrl = preview || currentUrl || null

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.target
    const file = input.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file')
      input.value = ''
      return
    }

    if (file.size > maxSize) {
      toast.error(`Image must be less than ${maxSizeMB ?? 5}MB`)
      input.value = ''
      return
    }

    setUploading(true)
    try {
      const fileExt = file.name.split('.').pop() || 'jpg'
      const filePath = `${path}.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(filePath, file, { upsert: true })

      if (uploadError) throw uploadError

      const {
        data: { publicUrl },
      } = supabase.storage.from(bucket).getPublicUrl(filePath)

      setPreview(publicUrl)
      onUpload(publicUrl)
      toast.success('Image uploaded')
    } catch (err: any) {
      toast.error(err.message || 'Failed to upload image')
    } finally {
      setUploading(false)
      input.value = ''
    }
  }

  const handleRemove = () => {
    setPreview(null)
    onRemove?.()
  }

  return (
    <div className={cn('relative', className)}>
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
            alt="Uploaded"
            className="w-full h-32 object-cover rounded-xl border border-ktip-sand-200"
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 rounded-xl transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="p-2 bg-white rounded-full shadow-soft text-ktip-sand-700 hover:text-ktip-ocean-600 transition-colors"
              title="Change image"
            >
              <Camera size={16} />
            </button>
            {onRemove && (
              <button
                type="button"
                onClick={handleRemove}
                className="p-2 bg-white rounded-full shadow-soft text-ktip-sand-700 hover:text-red-500 transition-colors"
                title="Remove image"
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
          className="w-full flex flex-col items-center justify-center gap-2 px-4 py-6 border-2 border-dashed border-ktip-sand-300 rounded-xl bg-ktip-sand-50/50 hover:border-ktip-ocean-400 hover:bg-ktip-ocean-50/30 transition-colors cursor-pointer"
        >
          {uploading ? (
            <Loader2 size={24} className="animate-spin text-ktip-ocean-500" />
          ) : (
            <Camera size={24} className="text-ktip-sand-400" />
          )}
          <span className="text-sm text-ktip-sand-500">
            {uploading ? 'Uploading...' : placeholder || 'Click to upload image'}
          </span>
        </button>
      )}
    </div>
  )
}
