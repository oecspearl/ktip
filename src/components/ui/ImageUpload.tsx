import { createSignal, Show } from 'solid-js'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../contexts/ToastContext'
import { cn } from '../../lib/utils'
import { Camera, X, Loader2 } from 'lucide-solid'

interface ImageUploadProps {
  bucket: string
  path: string
  currentUrl?: string
  onUpload: (url: string) => void
  onRemove?: () => void
  placeholder?: string
  class?: string
  maxSizeMB?: number
}

export function ImageUpload(props: ImageUploadProps) {
  const toast = useToast()
  const [uploading, setUploading] = createSignal(false)
  const [preview, setPreview] = createSignal<string | null>(null)
  let fileInput!: HTMLInputElement

  const maxSize = () => (props.maxSizeMB ?? 5) * 1024 * 1024

  const displayUrl = () => preview() || props.currentUrl || null

  const handleFileSelect = async (e: Event) => {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file')
      input.value = ''
      return
    }

    if (file.size > maxSize()) {
      toast.error(`Image must be less than ${props.maxSizeMB ?? 5}MB`)
      input.value = ''
      return
    }

    setUploading(true)
    try {
      const fileExt = file.name.split('.').pop() || 'jpg'
      const filePath = `${props.path}.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from(props.bucket)
        .upload(filePath, file, { upsert: true })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from(props.bucket)
        .getPublicUrl(filePath)

      setPreview(publicUrl)
      props.onUpload(publicUrl)
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
    props.onRemove?.()
  }

  return (
    <div class={cn('relative', props.class)}>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        class="hidden"
        onChange={handleFileSelect}
      />

      <Show
        when={displayUrl()}
        fallback={
          <button
            type="button"
            onClick={() => fileInput.click()}
            disabled={uploading()}
            class="w-full flex flex-col items-center justify-center gap-2 px-4 py-6 border-2 border-dashed border-ktip-sand-300 rounded-xl bg-ktip-sand-50/50 hover:border-ktip-ocean-400 hover:bg-ktip-ocean-50/30 transition-colors cursor-pointer"
          >
            <Show
              when={!uploading()}
              fallback={
                <Loader2 size={24} class="animate-spin text-ktip-ocean-500" />
              }
            >
              <Camera size={24} class="text-ktip-sand-400" />
            </Show>
            <span class="text-sm text-ktip-sand-500">
              {uploading() ? 'Uploading...' : props.placeholder || 'Click to upload image'}
            </span>
          </button>
        }
      >
        <div class="relative group">
          <img
            src={displayUrl()!}
            alt="Uploaded"
            class="w-full h-32 object-cover rounded-xl border border-ktip-sand-200"
          />
          <div class="absolute inset-0 bg-black/0 group-hover:bg-black/30 rounded-xl transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
            <button
              type="button"
              onClick={() => fileInput.click()}
              disabled={uploading()}
              class="p-2 bg-white rounded-full shadow-soft text-ktip-sand-700 hover:text-ktip-ocean-600 transition-colors"
              title="Change image"
            >
              <Camera size={16} />
            </button>
            <Show when={props.onRemove}>
              <button
                type="button"
                onClick={handleRemove}
                class="p-2 bg-white rounded-full shadow-soft text-ktip-sand-700 hover:text-red-500 transition-colors"
                title="Remove image"
              >
                <X size={16} />
              </button>
            </Show>
          </div>
          <Show when={uploading()}>
            <div class="absolute inset-0 bg-white/60 rounded-xl flex items-center justify-center">
              <Loader2 size={24} class="animate-spin text-ktip-ocean-500" />
            </div>
          </Show>
        </div>
      </Show>
    </div>
  )
}
