import { supabase } from './supabase'
import type { MessageAttachment } from '../types'

/**
 * Files sent inside a conversation.
 *
 * Attachments ride on the message row as a JSONB array rather than living in
 * their own table. The reason is the realtime path: a message arrives at the
 * other end the moment its row is inserted, and a second table would let the
 * bubble render before its files did. One row means the note and the files are
 * always delivered together, and the message's own RLS already answers "who
 * may read this".
 *
 * Blobs go to the private `message-attachments` bucket keyed by conversation:
 *
 *   {conversationId}/{senderId}/{ts}-{rand}-{fileName}
 *
 * The conversation is the *first* segment on purpose — the storage policy asks
 * whether the caller is a participant of that thread, which is the same
 * question the messages table asks, and it can answer it before any message
 * row exists (the upload happens first).
 */

export const MESSAGE_ATTACHMENTS_BUCKET = 'message-attachments'

/** Mirrors the bucket's file_size_limit in migration 095. */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024

/** Mirrors the CHECK on messages.attachments in migration 095. */
export const MAX_ATTACHMENTS_PER_MESSAGE = 5

/** Mirrors the bucket's allowed_mime_types. Kept in sync by hand — a mime the
 *  bucket refuses fails the upload with a storage error nobody can act on, so
 *  it is caught here with a sentence a member can read. */
export const ALLOWED_ATTACHMENT_MIME = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/markdown',
  'text/csv',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]

/**
 * Browsers disagree about the mime of the same file — Windows reports
 * `.csv` as `application/vnd.ms-excel`, `.md` usually as nothing at all. The
 * extension is the more reliable signal for exactly the types where the mime
 * is unreliable, so it wins when the browser is silent or obviously wrong.
 */
const EXTENSION_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
}

export function extensionOfName(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  if (dot <= 0 || dot === fileName.length - 1) return ''
  return fileName.slice(dot + 1).toLowerCase()
}

/** The mime we will actually upload with: the extension's, or the browser's. */
export function resolveMimeType(fileName: string, browserType: string | undefined): string {
  const byExtension = EXTENSION_MIME[extensionOfName(fileName)]
  if (byExtension) return byExtension
  return (browserType || '').toLowerCase()
}

/**
 * Object keys are ASCII-safe and free of path separators. Supabase Storage
 * accepts a surprising amount in a key, but a key containing `/` invents a
 * folder — and the folder is what the RLS policy reads.
 */
export function sanitizeFileName(fileName: string): string {
  const cleaned = fileName
    .normalize('NFKD')
    .replace(/[^\w.\- ]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.\-]+/, '')
    .slice(-80)

  return cleaned.length > 0 ? cleaned : 'file'
}

/** `1.4 MB`. Sizes are shown next to every chip and bubble. */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${Math.round(bytes)} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`
  const mb = kb / 1024
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`
}

/**
 * Why this file cannot be sent, or null. Takes the values rather than a `File`
 * so it is testable without a DOM.
 */
export function attachmentRejection(file: {
  name: string
  size: number
  type?: string
}): string | null {
  if (file.size === 0) return `“${file.name}” is empty.`
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return `“${file.name}” is ${formatFileSize(file.size)} — the limit is ${formatFileSize(
      MAX_ATTACHMENT_BYTES
    )}.`
  }

  const mime = resolveMimeType(file.name, file.type)
  if (!ALLOWED_ATTACHMENT_MIME.includes(mime)) {
    return `“${file.name}” is not a file type this chat accepts.`
  }

  return null
}

/** Object key for one upload. `stamp` and `token` are injected so this is pure. */
export function attachmentKey(params: {
  conversationId: string
  senderId: string
  fileName: string
  stamp: number
  token: string
}): string {
  const { conversationId, senderId, fileName, stamp, token } = params
  return `${conversationId}/${senderId}/${stamp}-${token}-${sanitizeFileName(fileName)}`
}

export function isImageAttachment(attachment: Pick<MessageAttachment, 'mime'>): boolean {
  return attachment.mime.startsWith('image/')
}

/** Thread-list preview for a message whose words are files. */
export function describeAttachments(attachments: MessageAttachment[] | undefined): string {
  if (!attachments?.length) return ''
  if (attachments.length === 1) return attachments[0].name
  return `${attachments.length} files`
}

/**
 * Upload one file and return the metadata that goes on the message row.
 * `upsert` stays off: keys carry a timestamp and a random token, so a
 * collision means something is wrong and silently overwriting the other
 * member's file is the worst possible response to it.
 */
export async function uploadAttachment(params: {
  conversationId: string
  senderId: string
  file: File
}): Promise<MessageAttachment> {
  const { conversationId, senderId, file } = params

  const rejection = attachmentRejection(file)
  if (rejection) throw new Error(rejection)

  const mime = resolveMimeType(file.name, file.type)
  const path = attachmentKey({
    conversationId,
    senderId,
    fileName: file.name,
    stamp: Date.now(),
    token: Math.random().toString(36).slice(2, 8),
  })

  const { error } = await supabase.storage
    .from(MESSAGE_ATTACHMENTS_BUCKET)
    .upload(path, file, { contentType: mime, upsert: false })

  if (error) throw error

  return { path, name: file.name, mime, size: file.size }
}

/** Signed URL for a private attachment (1 hour), same shape as entity docs. */
export async function attachmentUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(MESSAGE_ATTACHMENTS_BUCKET)
    .createSignedUrl(path, 3600)
  if (error) return null
  return data?.signedUrl ?? null
}

/**
 * Best effort cleanup for blobs whose message never made it — an upload that
 * succeeded before a failing insert is otherwise an orphan nobody can see.
 */
export async function discardAttachments(paths: string[]): Promise<void> {
  if (paths.length === 0) return
  try {
    await supabase.storage.from(MESSAGE_ATTACHMENTS_BUCKET).remove(paths)
  } catch {
    // Ignore — a few unreferenced bytes beat failing a send the member saw work.
  }
}
