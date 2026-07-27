import { createSignal, Show } from 'solid-js'
import type { Editor } from '@tiptap/core'
import { Modal } from '../../ui/Modal'
import { supabase } from '../../../lib/supabase'
import { Upload, Link, Loader2 } from 'lucide-solid'

interface ImageModalProps {
  open: boolean
  onClose: () => void
  editor: () => Editor | undefined
}

export function ImageModal(props: ImageModalProps) {
  const [mode, setMode] = createSignal<'upload' | 'url'>('upload')
  const [url, setUrl] = createSignal('')
  const [alt, setAlt] = createSignal('')
  const [uploading, setUploading] = createSignal(false)
  const [preview, setPreview] = createSignal<string | null>(null)
  const [error, setError] = createSignal<string | null>(null)
  let fileInput!: HTMLInputElement

  const reset = () => {
    setUrl('')
    setAlt('')
    setPreview(null)
    setError(null)
    setUploading(false)
  }

  const handleClose = () => {
    reset()
    props.onClose()
  }

  const handleFileSelect = async (e: Event) => {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.')
      input.value = ''
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('Image must be less than 10MB.')
      input.value = ''
      return
    }

    setError(null)
    setUploading(true)

    try {
      const fileExt = file.name.split('.').pop() || 'jpg'
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${fileExt}`
      const filePath = `documents/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('document-images')
        .upload(filePath, file, { upsert: true })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('document-images')
        .getPublicUrl(filePath)

      setPreview(publicUrl)
      setUrl(publicUrl)
    } catch (err: any) {
      setError(err.message || 'Failed to upload image. The storage bucket may not exist yet.')
    } finally {
      setUploading(false)
      input.value = ''
    }
  }

  const handleInsert = () => {
    const ed = props.editor()
    const src = url().trim()
    if (!ed || !src) return

    ed.chain().focus().setImage({ src, alt: alt().trim() || undefined }).run()
    handleClose()
  }

  const handleUrlSubmit = (e: Event) => {
    e.preventDefault()
    handleInsert()
  }

  const tabClass = (active: boolean) =>
    `flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium border-b-2 transition-colors ${
      active
        ? 'border-ktip-ocean-500 text-ktip-ocean-600'
        : 'border-transparent text-ktip-sand-400 hover:text-ktip-sand-600'
    }`

  return (
    <Modal open={props.open} onClose={handleClose} title="Insert Image" size="md">
      <div class="space-y-4">
        {/* Tabs */}
        <div class="flex border-b border-ktip-sand-200">
          <button type="button" class={tabClass(mode() === 'upload')} onClick={() => setMode('upload')}>
            <Upload size={16} />
            Upload from Computer
          </button>
          <button type="button" class={tabClass(mode() === 'url')} onClick={() => setMode('url')}>
            <Link size={16} />
            From URL
          </button>
        </div>

        {/* Upload Tab */}
        <Show when={mode() === 'upload'}>
          <div class="space-y-4">
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              class="hidden"
              onChange={handleFileSelect}
            />

            <Show
              when={preview()}
              fallback={
                <button
                  type="button"
                  onClick={() => fileInput.click()}
                  disabled={uploading()}
                  class="w-full flex flex-col items-center justify-center gap-3 px-4 py-10 border-2 border-dashed border-ktip-sand-300 rounded-xl bg-ktip-sand-50/50 hover:border-ktip-ocean-400 hover:bg-ktip-ocean-50/30 transition-colors cursor-pointer"
                >
                  <Show
                    when={!uploading()}
                    fallback={<Loader2 size={28} class="animate-spin text-ktip-ocean-500" />}
                  >
                    <Upload size={28} class="text-ktip-sand-400" />
                  </Show>
                  <div class="text-center">
                    <p class="text-sm font-medium text-ktip-sand-700">
                      {uploading() ? 'Uploading...' : 'Click to select an image'}
                    </p>
                    <p class="text-xs text-ktip-sand-400 mt-1">JPG, PNG, GIF, WebP up to 10MB</p>
                  </div>
                </button>
              }
            >
              <div class="space-y-3">
                <div class="relative rounded-lg overflow-hidden border border-ktip-sand-200">
                  <img src={preview()!} alt="Preview" class="w-full max-h-48 object-contain bg-ktip-sand-50" />
                </div>
                <button
                  type="button"
                  onClick={() => { setPreview(null); setUrl(''); fileInput.click() }}
                  class="text-sm text-ktip-ocean-600 hover:text-ktip-ocean-700"
                >
                  Choose a different image
                </button>
              </div>
            </Show>

            <div>
              <label class="block text-sm font-medium text-ktip-sand-700 mb-1">
                Alt Text <span class="text-ktip-sand-400">(optional)</span>
              </label>
              <input
                type="text"
                value={alt()}
                onInput={(e) => setAlt(e.currentTarget.value)}
                placeholder="Describe the image"
                class="w-full px-3 py-2 border border-ktip-sand-200 rounded-lg focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none text-sm"
              />
            </div>
          </div>
        </Show>

        {/* URL Tab */}
        <Show when={mode() === 'url'}>
          <form onSubmit={handleUrlSubmit} class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-ktip-sand-700 mb-1">Image URL</label>
              <input
                type="url"
                value={url()}
                onInput={(e) => setUrl(e.currentTarget.value)}
                placeholder="https://example.com/image.jpg"
                class="w-full px-3 py-2 border border-ktip-sand-200 rounded-lg focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none text-sm"
                required
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-ktip-sand-700 mb-1">
                Alt Text <span class="text-ktip-sand-400">(optional)</span>
              </label>
              <input
                type="text"
                value={alt()}
                onInput={(e) => setAlt(e.currentTarget.value)}
                placeholder="Describe the image"
                class="w-full px-3 py-2 border border-ktip-sand-200 rounded-lg focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none text-sm"
              />
            </div>
          </form>
        </Show>

        {/* Error */}
        <Show when={error()}>
          <p class="text-sm text-red-600">{error()}</p>
        </Show>

        {/* Actions */}
        <div class="flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={handleInsert}
            disabled={!url().trim() || uploading()}
            class="px-4 py-2 bg-ktip-ocean-600 hover:bg-ktip-ocean-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Insert Image
          </button>
          <button
            type="button"
            onClick={handleClose}
            class="px-4 py-2 text-sm text-ktip-sand-600 hover:bg-ktip-sand-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  )
}
