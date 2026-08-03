import { Captions, CaptionsOff, Languages } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { cn } from '../../../lib/utils'
import { useLiveCaptions } from '../../../hooks/useLiveCaptions'

/**
 * Live captions under the call, each in the reader's own language.
 *
 * Must be rendered inside <LiveKitRoom> — the hook talks over the room's data
 * channel, and outside that context there is no channel to talk over.
 *
 * The strip is deliberately quiet when there is nothing to say: no empty box, no
 * "waiting for speech". It appears when somebody speaks and fades out when they
 * stop, so a room where nobody has switched captioning on looks exactly as it
 * did before this existed.
 */
export function CaptionStrip({ enabled }: { enabled: boolean }) {
  const { t } = useLingui()
  const { captions, interim, captioning, toggleCaptioning, supported, error } =
    useLiveCaptions(enabled)

  const hasLines = captions.length > 0 || interim.length > 0

  return (
    <div className="flex flex-col gap-1.5">
      {hasLines && (
        <div
          className="max-h-28 overflow-y-auto rounded-xl bg-black/40 px-3 py-2"
          // Captions arrive continuously; a screen reader announcing every line
          // over the top of the speaker would be worse than silence. `polite`
          // lets it finish the current sentence first.
          aria-live="polite"
          aria-atomic="false"
        >
          {captions.map((caption) => (
            <p key={caption.id} className="text-sm leading-snug text-white/90">
              {caption.name && (
                <span className="mr-1.5 font-semibold text-white/60">{caption.name}</span>
              )}
              {/* lang= on the text itself, so a screen reader pronounces a
                  French caption with a French voice rather than reading it as
                  mangled English. */}
              <span lang={caption.translated ? undefined : caption.lang}>{caption.display}</span>
              {caption.translated && (
                <Languages
                  size={11}
                  className="ml-1 inline-block text-white/30"
                  aria-label={t`Translated`}
                />
              )}
            </p>
          ))}
          {interim && (
            // The speaker's own in-progress words, on their screen only. Dimmed
            // because it is not final and will be rewritten as they keep talking.
            <p className="text-sm italic leading-snug text-white/40">{interim}</p>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggleCaptioning}
          disabled={!supported}
          title={
            supported
              ? undefined
              : // Firefox has no SpeechRecognition. Saying so beats a dead button.
                t`Captioning needs Chrome, Edge or Safari`
          }
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-micro font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40',
            captioning
              ? 'bg-white/20 text-white'
              : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
          )}
        >
          {captioning ? (
            <>
              <Captions size={13} aria-hidden="true" />
              <Trans>Captioning my speech</Trans>
            </>
          ) : (
            <>
              <CaptionsOff size={13} aria-hidden="true" />
              <Trans>Caption my speech</Trans>
            </>
          )}
        </button>

        {captioning && (
          <span className="text-micro text-white/40">
            <Trans>Everyone reads you in their own language</Trans>
          </span>
        )}
        {error && <span className="text-micro text-amber-300/70">{error}</span>}
      </div>
    </div>
  )
}
