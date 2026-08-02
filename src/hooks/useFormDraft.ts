import { useEffect } from 'react'

/**
 * Keeps a long form's answers alive while the tab is open.
 *
 * The create-event form is a screen's worth of typing that used to be wiped by
 * anything that unmounted it — a mis-click on the breadcrumb, a look at the
 * event type's docs, the browser back button. React state does not survive an
 * unmount and the router restores no state of its own, so the answers have to
 * live somewhere outside the component.
 *
 * sessionStorage rather than localStorage on purpose: the draft should outlive
 * navigation and reloads, and die with the tab. A draft that came back a week
 * later, half-filled and stale, would be worse than an empty form.
 *
 * Files are not restorable — a File cannot be serialized and no browser will
 * hand one back without a fresh picker — so callers leave attachments out of
 * `value` and say so in the UI.
 *
 * Reading is a separate function rather than a return value because the caller
 * needs the stored draft to *seed* the state this hook is then handed, which is
 * a step earlier than the hook can run.
 */
export function useFormDraft<T extends Record<string, unknown>>(
  key: string,
  value: T
): { clear: () => void } {
  // Compared as a string so an unchanged form does not write on every render.
  const serialized = JSON.stringify(value)

  useEffect(() => {
    try {
      sessionStorage.setItem(key, serialized)
    } catch {
      // Private mode, or a quota a form this size will never hit. Losing the
      // draft is the cost; breaking the form is not.
    }
  }, [key, serialized])

  return { clear: () => clearDraft(key) }
}

/** Seeds a form's initial state. Call it from a useState initializer. */
export function readDraft<T>(key: string): Partial<T> {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    // Anything that is not a plain object came from another version of this
    // form, or from something else writing the key. Start clean.
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

export function clearDraft(key: string): void {
  try {
    sessionStorage.removeItem(key)
  } catch {
    // Nothing to do — the draft is already unreachable.
  }
}
