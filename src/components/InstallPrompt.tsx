import { useCallback, useEffect, useState } from 'react'
import { Download, Share, SquarePlus, X } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { Button } from './ui/Button'

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

function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS predates display-mode and reports it here instead.
    (window.navigator as { standalone?: boolean }).standalone === true
  )
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

export function InstallPrompt() {
  const { t } = useLingui()
  const [event, setEvent] = useState<InstallEvent | null>(null)
  const [showIosHelp, setShowIosHelp] = useState(false)
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    // Every reason not to be here, checked before anything is rendered or
    // listened for: already installed, already declined, or on a desktop where
    // "add to home screen" means nothing to the reader.
    if (isStandalone()) return
    const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false
    if (!coarse) return
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
    <section
      aria-label={t`Install KTIP`}
      data-bottom-sheet
      className="fixed inset-x-4 bottom-fab-clear lg:bottom-4 z-toast mx-auto max-w-md rounded-xl border border-ktip-sand-200 bg-ktip-cream p-4 shadow-xl"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0 rounded-lg bg-ktip-tropical-100 p-2 text-ktip-tropical-700">
          <Download size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display font-bold text-ktip-sand-900">
            <Trans>Add KTIP to your home screen</Trans>
          </h2>
          {showIosHelp ? (
            <p className="mt-1 flex flex-wrap items-center gap-1 text-sm leading-relaxed text-ktip-sand-600">
              <Trans>
                Tap <Share size={15} className="inline align-text-bottom" /> then
                <SquarePlus size={15} className="inline align-text-bottom" /> Add to Home Screen.
              </Trans>
            </p>
          ) : (
            <p className="mt-1 text-sm leading-relaxed text-ktip-sand-600">
              <Trans>Opens full screen and loads faster on repeat visits.</Trans>
            </p>
          )}
          {!showIosHelp && (
            <div className="mt-3">
              <Button size="sm" onClick={install}>
                <Trans>Install</Trans>
              </Button>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={close}
          aria-label={t`Dismiss`}
          className="shrink-0 rounded-lg p-1.5 text-ktip-sand-500 transition-colors hover:bg-ktip-sand-100 hover:text-ktip-sand-900"
        >
          <X size={18} />
        </button>
      </div>
    </section>
  )
}
