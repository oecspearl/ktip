import { supabase } from '../supabase'

/**
 * Client half of the image safety check.
 *
 * Fails open on anything it cannot resolve — a member on a Caribbean mobile
 * link loses a request often enough that "the network hiccuped, so you cannot
 * send a photo" would be a daily event rather than an edge case.
 */

export interface ImageGateVerdict {
  ok: boolean
  reason?: string
  severity?: string | null
  categories?: string[]
}

/** Below this an image is an icon or a signature; not worth a vision call. */
export const IMAGE_SCAN_MIN_BYTES = 8 * 1024
/** Above this the call is slow and expensive for no extra safety. */
export const IMAGE_SCAN_MAX_BYTES = 8 * 1024 * 1024

const checked = new Set<string>()

export function shouldScanImage(mime: string, size: number): boolean {
  // Images only. ALLOWED_ATTACHMENT_MIME includes seven document types, and
  // sending a PDF to a vision model costs money and returns nothing useful.
  if (!mime.startsWith('image/')) return false
  if (mime === 'image/svg+xml') return false
  return size >= IMAGE_SCAN_MIN_BYTES && size <= IMAGE_SCAN_MAX_BYTES
}

export async function checkImage(bucket: string, path: string): Promise<ImageGateVerdict> {
  const key = `${bucket}/${path}`
  if (checked.has(key)) return { ok: true }

  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) return { ok: true }

  try {
    const res = await fetch('/api/moderate-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ bucket, path }),
    })

    if (!res.ok) return { ok: true }

    const verdict = await res.json()
    checked.add(key)

    if (verdict?.severity === 'medium' || verdict?.severity === 'high') {
      return {
        ok: false,
        // The model's sentence when there is one; never the category list,
        // which reads as a checklist of what to avoid next time.
        reason: verdict.reason || "That image can't be sent.",
        severity: verdict.severity,
        categories: verdict.categories ?? [],
      }
    }

    return { ok: true, severity: verdict?.severity ?? null }
  } catch {
    return { ok: true }
  }
}
