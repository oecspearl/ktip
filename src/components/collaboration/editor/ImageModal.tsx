import { useCallback, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { Modal } from '../../ui/Modal'
import { useFileDrop } from '../../../hooks/useFileDrop'
import { uploadDocumentImage } from '../../../lib/storage-upload'
import { Upload, Link, Loader2 } from 'lucide-react'

interface ImageModalProps {
  open: boolean
  onClose: () => void
  editor: Editor | null
}

const IMAGE_ACCEPT = ['image/*'] as const

export function ImageModal({ open, onClose, editor }: ImageModalProps) {
  const [mode, setMode] = useState<'upload' | 'url'>('upload')
  const [url, setUrl] = useState('')
  const [alt, setAlt] = useState('')
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setUrl('')
    setAlt('')
    setPreview(null)
    setError(null)
    setUploading(false)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.')
      return
    }

    // Checked before optimization so a huge file is never handed to the decoder.
    if (file.size > 10 * 1024 * 1024) {
      setError('Image must be less than 10MB.')
      return
    }

    setError(null)
    setUploading(true)

    try {
      const publicUrl = await uploadDocumentImage(file)
      setPreview(publicUrl)
      setUrl(publicUrl)
    } catch (err: any) {
      setError(err.message || 'Failed to upload image. The storage bucket may not exist yet.')
    } finally {
      setUploading(false)
    }
  }, [])

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target
    const file = input.files?.[0]
    input.value = ''
    if (file) await handleFile(file)
  }

  const { isDragging, dropProps } = useFileDrop({
    onFiles: (files) => void handleFile(files[0]),
    accept: IMAGE_ACCEPT,
    disabled: uploading,
  })

  const handleInsert = () => {
    const ed = editor
    const src = url.trim()
    if (!ed || !src) return

    ed.chain().focus().setImage({ src, alt: alt.trim() || undefined }).run()
    handleClose()
  }

  const handleUrlSubmit = (e: React.FormEvent) => {
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
    <Modal open={open} onClose={handleClose} title="Insert Image" size="md">
      <div className="space-y-4">
        {/* Tabs */}
        <div className="flex border-b border-ktip-sand-200">
          <button type="button" className={tabClass(mode === 'upload')} onClick={() => setMode('upload')}>
            <Upload size={16} />
            Upload from Computer
          </button>
          <button type="button" className={tabClass(mode === 'url')} onClick={() => setMode('url')}>
            <Link size={16} />
            From URL
          </button>
        </div>

        {/* Upload Tab */}
        {mode === 'upload' && (
          <div className="space-y-4" {...dropProps}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileSelect}
            />

            {preview ? (
              <div className="space-y-3">
                <div className="relative rounded-lg overflow-hidden border border-ktip-sand-200">
                  <img src={preview} alt="Preview" className="w-full max-h-48 object-contain bg-ktip-sand-50" />
                </div>
                <button
                  type="button"
                  onClick={() => { setPreview(null); setUrl(''); fileInputRef.current?.click() }}
                  className="text-sm text-ktip-ocean-600 hover:text-ktip-ocean-700"
                >
                  Choose a different image
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className={`w-full flex flex-col items-center justify-center gap-3 px-4 py-10 border-2 border-dashed rounded-xl transition-colors cursor-pointer ${
                  isDragging
                    ? 'border-ktip-ocean-400 bg-ktip-ocean-50/50'
                    : 'border-ktip-sand-300 bg-ktip-sand-50/50 hover:border-ktip-ocean-400 hover:bg-ktip-ocean-50/30'
                }`}
              >
                {uploading ? (
                  <Loader2 size={28} className="animate-spin text-ktip-ocean-500" />
                ) : (
                  <Upload size={28} className="text-ktip-sand-400" />
                )}
                <div className="text-center">
                  <p className="text-sm font-medium text-ktip-sand-700">
                    {uploading
                      ? 'Uploading...'
                      : isDragging
                        ? 'Drop image to upload'
                        : 'Click or drag an image here'}
                  </p>
                  <p className="text-xs text-ktip-sand-400 mt-1">
                    JPG, PNG, GIF, WebP up to 10MB — resized and optimized automatically
                  </p>
                </div>
              </button>
            )}

            <div>
              <label className="block text-sm font-medium text-ktip-sand-700 mb-1">
                Alt Text <span className="text-ktip-sand-400">(optional)</span>
              </label>
              <input
                type="text"
                value={alt}
                onChange={(e) => setAlt(e.target.value)}
                placeholder="Describe the image"
                className="w-full px-3 py-2 border border-ktip-sand-200 rounded-lg focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none text-sm"
              />
            </div>
          </div>
        )}

        {/* URL Tab */}
        {mode === 'url' && (
          <form onSubmit={handleUrlSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-ktip-sand-700 mb-1">Image URL</label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/image.jpg"
                className="w-full px-3 py-2 border border-ktip-sand-200 rounded-lg focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ktip-sand-700 mb-1">
                Alt Text <span className="text-ktip-sand-400">(optional)</span>
              </label>
              <input
                type="text"
                value={alt}
                onChange={(e) => setAlt(e.target.value)}
                placeholder="Describe the image"
                className="w-full px-3 py-2 border border-ktip-sand-200 rounded-lg focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none text-sm"
              />
            </div>
          </form>
        )}

        {/* Error */}
        {error && <p className="text-sm text-red-600">{error}</p>}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={handleInsert}
            disabled={!url.trim() || uploading}
            className="px-4 py-2 btn-brand text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Insert Image
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-sm text-ktip-sand-600 hover:bg-ktip-sand-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  )
}
