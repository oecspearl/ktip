import { Suspense, useCallback, useEffect, useState } from 'react'
import { isIos, isStandalone, isTouchDevice } from '../lib/platform'
import { lazyOverlay } from '../lib/lazy-overlay'

// The sheet is fetched only once there is something to offer. Everything that
// decides whether to offer — and the `beforeinstallprompt` listener, which has
// to be attached from first paint or the event is missed — stays here, in the
// entry chunk, where it costs a few hundred bytes.
const InstallPromptSheet = lazyOverlay(
  () => import('./InstallPromptSheet').then((m) => ({ default: m.InstallPromptSheet })),
  'install-prompt'
)

/**
 * Offers to install the app to the home screen.
 *
 * Two platforms, two mechanisms, and only one of them is an API:
 *
 *   Android/Chromium — fires `beforeinstallprompt`, which can be captured and
 *     replayed later from a real click. The browser's own mini-infobar is
 *     suppressed by that capture, so taking the event means taking
 *     responsibility for offering the install.
 *   iOS/Safari — no event, no API. Add to Home Screen exists only in the share
 *     sheet, so the honest thing is to say where it is.
 *
 * Deliberately quiet: shown once, dismissible, never on desktop, and never
 * when already running installed. A reader who says no is not asked again.
 */
const DISMISSED_KEY = 'ktip_install_prompt_dismissed_v1'

/** The captured event, held until the reader asks for it. */
interface InstallEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function InstallPrompt() {
  const [event, setEvent] = useState<InstallEvent | null>(null)
  const [showIosHelp, setShowIosHelp] = useState(false)
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    // Every reason not to be here, checked before anything is rendered or
    // listened for: already installed, already declined, or on a desktop where
    // "add to home screen" means nothing to the reader.
    if (isStandalone()) return
    if (!isTouchDevice()) return
    try {
      if (localStorage.getItem(DISMISSED_KEY) === '1') return
    } catch {
      // Storage unavailable: fall through and offer it. A prompt that cannot
      // remember a refusal is still better than one that never appears.
    }
    setDismissed(false)

    if (isIos()) {
      setShowIosHelp(true)
      return
    }

    const onBeforeInstall = (e: Event) => {
      // Suppresses Chromium's own mini-infobar; from here the offer is ours.
      e.preventDefault()
      setEvent(e as InstallEvent)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    // Installed from anywhere — our button, the browser menu — the offer goes.
    const onInstalled = () => setDismissed(true)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const close = useCallback(() => {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISSED_KEY, '1')
    } catch {
      // Nothing to persist to; it stays gone for this session at least.
    }
  }, [])

  const install = useCallback(async () => {
    if (!event) return
    await event.prompt()
    // Either outcome retires the offer: accepted installs, dismissed is an
    // answer. The captured event is single-use and cannot be replayed.
    await event.userChoice
    setEvent(null)
    close()
  }, [event, close])

  if (dismissed) return null
  if (!event && !showIosHelp) return null

  return (
    <Suspense fallback={null}>
      <InstallPromptSheet iosHelp={showIosHelp} onInstall={install} onClose={close} />
    </Suspense>
  )
}
