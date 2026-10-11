/**
 * Requests that cross component boundaries: a shortcut or a voice command asks
 * for the accessibility panel, and whichever host component owns the panel
 * (a floating button, a header menu) opens it. The kit never needs to know
 * where the panel lives.
 */
export type A11yRequest = 'panel' | 'help' | 'setup' | 'read' | 'voice'

/** What the reader is asked to do. Bare 'read' requests mean toggle */
export type ReaderCommand = 'toggle' | 'start' | 'selection' | 'stop' | 'pause' | 'resume' | 'next' | 'prev'

const listeners = new Map<A11yRequest, Set<(detail?: string) => void>>()

export function request(kind: A11yRequest, detail?: string) {
  listeners.get(kind)?.forEach((l) => l(detail))
}

export function onRequest(kind: A11yRequest, listener: (detail?: string) => void): () => void {
  let set = listeners.get(kind)
  if (!set) listeners.set(kind, (set = new Set()))
  set.add(listener)
  return () => {
    set!.delete(listener)
  }
}

/** Whether anything answers a request, e.g. so a help list only shows features that exist */
export function hasHandler(kind: A11yRequest): boolean {
  return (listeners.get(kind)?.size ?? 0) > 0
}

export const openAccessibilityPanel = () => request('panel')
export const openShortcutHelp = () => request('help')
