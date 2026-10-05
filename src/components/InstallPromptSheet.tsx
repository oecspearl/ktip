import { Download, Share, SquarePlus, X } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { Button } from './ui/Button'

interface InstallPromptSheetProps {
  /** iOS: no install API, so the sheet says where Add to Home Screen lives. */
  iosHelp: boolean
  onInstall: () => void
  onClose: () => void
}

/**
 * The install offer itself. InstallPrompt decides whether it is shown and owns
 * the captured browser event; this is only what the reader sees.
 *
 * A separate module so the sheet's copy, icons and button load only on the
 * devices that will see it — a touch device, not installed, not declined —
 * rather than in every visitor's entry chunk.
 */
export function InstallPromptSheet({ iosHelp, onInstall, onClose }: InstallPromptSheetProps) {
  const { t } = useLingui()

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
          {iosHelp ? (
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
          {!iosHelp && (
            <div className="mt-3">
              <Button size="sm" onClick={onInstall}>
                <Trans>Install</Trans>
              </Button>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t`Dismiss`}
          className="shrink-0 rounded-lg p-1.5 text-ktip-sand-500 transition-colors hover:bg-ktip-sand-100 hover:text-ktip-sand-900"
        >
          <X size={18} />
        </button>
      </div>
    </section>
  )
}
