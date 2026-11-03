import { supabase } from './supabase'

/**
 * Logos and murals a team hangs in its Homebase (migration 188).
 *
 * The bucket is public-read, so the map can draw an image with a plain
 * <image href>. venue_rooms.decor stores the object path, never a URL; this is
 * the one place a path becomes something a browser can load.
 */
export const ROOM_ART_BUCKET = 'venue-room-art'

/** Biggest upload the bucket accepts. Mirrors file_size_limit in 188. */
export const ROOM_ART_MAX_BYTES = 2 * 1024 * 1024

export const ROOM_ART_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const

export function roomArtUrl(path: string): string {
  return supabase.storage.from(ROOM_ART_BUCKET).getPublicUrl(path).data.publicUrl
}

/**
 * Upload one image into a room's folder and return its path.
 *
 * A fresh name every time: the public URL is cached by browsers and the CDN,
 * so overwriting `logo.png` in place would leave half the venue looking at the
 * old logo. The previous file is removed after the new one is in.
 */
export async function uploadRoomArt(
  roomId: string,
  slot: 'logo' | 'mural',
  file: File,
  previousPath?: string | null
): Promise<string> {
  if (!(ROOM_ART_TYPES as readonly string[]).includes(file.type)) {
    throw new Error('Use a PNG, JPEG, WebP or GIF image.')
  }
  if (file.size > ROOM_ART_MAX_BYTES) {
    throw new Error('That image is over 2 MB. Try a smaller one.')
  }
  const ext = file.type.split('/')[1].replace('jpeg', 'jpg')
  const path = `${roomId}/${slot}-${Date.now().toString(36)}.${ext}`
  const { error } = await supabase.storage
    .from(ROOM_ART_BUCKET)
    .upload(path, file, { contentType: file.type, cacheControl: '31536000', upsert: false })
  if (error) throw error
  if (previousPath && previousPath !== path && previousPath.startsWith(`${roomId}/`)) {
    // Best effort: a stale file costs a few KB, a failed upload costs the logo.
    await supabase.storage.from(ROOM_ART_BUCKET).remove([previousPath])
  }
  return path
}
