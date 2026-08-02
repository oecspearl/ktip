/**
 * Ghost mode: what a pinned surface does once it is pinned.
 *
 * Pinning a messaging panel or a sticky note used to be pure bookkeeping — the
 * surface stayed exactly as opaque and exactly as clickable as before, sitting
 * on top of the page it was pinned over. Ghost mode is the other half of that
 * bargain: a pinned surface fades to almost nothing and stops taking pointer
 * events at all, so the page underneath can be read, clicked and scrolled
 * straight through it. Hovering lights its edge; a wake chip brings it back.
 *
 * One preference for every surface, not one per note. "How see-through should
 * my parked windows be" is a taste, and a taste asked once is a taste answered
 * once — a per-note slider would mean re-answering it on every note.
 */

const STORAGE_KEY = 'ktip_ghost_mode'

export interface GhostPrefs {
  /** Off means pinning goes back to meaning only what it meant before. */
  enabled: boolean
  /** 0.05–1. The opacity a ghosted surface fades to. */
  opacity: number
}

/** Faint enough to see past, solid enough to still be a shape on the page. */
export const GHOST_DEFAULTS: GhostPrefs = { enabled: true, opacity: 0.2 }

/** Below 5% a ghost is gone rather than faint, and there is no way back to it
 *  except by memory — the hover glow needs something to be hovering over. */
export const GHOST_MIN_OPACITY = 0.05

export function clampGhostOpacity(value: number): number {
  if (!Number.isFinite(value)) return GHOST_DEFAULTS.opacity
  return Math.min(1, Math.max(GHOST_MIN_OPACITY, value))
}

function parse(raw: string | null): GhostPrefs {
  if (!raw) return GHOST_DEFAULTS
  try {
    const parsed = JSON.parse(raw) as Partial<GhostPrefs>
    if (!parsed || typeof parsed !== 'object') return GHOST_DEFAULTS
    return {
      enabled:
        typeof parsed.enabled === 'boolean' ? parsed.enabled : GHOST_DEFAULTS.enabled,
      opacity:
        typeof parsed.opacity === 'number'
          ? clampGhostOpacity(parsed.opacity)
          : GHOST_DEFAULTS.opacity,
    }
  } catch {
    return GHOST_DEFAULTS
  }
}

/** Never throws: a preference is not worth breaking a page over, and
 *  localStorage is unavailable outright in some privacy modes. */
export function readGhostPrefs(): GhostPrefs {
  if (typeof window === 'undefined') return GHOST_DEFAULTS
  try {
    return parse(window.localStorage.getItem(STORAGE_KEY))
  } catch {
    return GHOST_DEFAULTS
  }
}

/**
 * A store rather than a context, because the readers are scattered: the
 * messaging panel lives in one corner of the tree and every sticky note lives
 * in a portal off `document.body`. A provider high enough to cover both would
 * re-render the app to move a slider.
 */
let current: GhostPrefs = readGhostPrefs()
const listeners = new Set<() => void>()

export function subscribeGhostPrefs(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Identity is stable until a write, which is what `useSyncExternalStore`
 *  needs to avoid an infinite render loop. */
export function getGhostPrefs(): GhostPrefs {
  return current
}

export function setGhostPrefs(patch: Partial<GhostPrefs>): void {
  const next: GhostPrefs = {
    enabled: patch.enabled ?? current.enabled,
    opacity: patch.opacity === undefined ? current.opacity : clampGhostOpacity(patch.opacity),
  }
  if (next.enabled === current.enabled && next.opacity === current.opacity) return
  current = next
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      /* quota or a blocked store — the setting still holds for this session */
    }
  }
  for (const listener of listeners) listener()
}

/** Tests only: drop the cached copy and re-read the store. */
export function resetGhostPrefs(): void {
  current = readGhostPrefs()
  for (const listener of listeners) listener()
}
