import { useEffect, useRef, useState } from 'react'
import { Captions, CaptionsOff, Languages, Volume2, VolumeX } from 'lucide-react'
import { useSpeechUsage } from '../../../hooks/useSpeechUsage'
import { useRoomContext } from '@livekit/components-react'
import { RoomEvent, type RemoteParticipant } from 'livekit-client'
import { Trans, useLingui } from '@lingui/react/macro'
import { cn } from '../../../lib/utils'
import { useLiveCaptions } from '../../../hooks/useLiveCaptions'
import { useContentLanguage } from '../../../i18n/useContentLanguage'
import { UI_LANGS, isUiLang, type UiLang } from '../../../lib/i18n/protocol'

const LANG_NAME: Record<UiLang, string> = { en: 'English', fr: 'Français', es: 'Español' }
const PREF_KEY = 'ktip.captions.prefs'
/** How loud the room is while a translation is being read aloud. */
const DUCKED_VOLUME = 0.25

interface Prefs {
  lang?: UiLang
  original?: boolean
  voice?: boolean
}

function readPrefs(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PREF_KEY) || '{}')
    return {
      lang: isUiLang(raw.lang) ? raw.lang : undefined,
      original: raw.original === true,
      voice: raw.voice === true,
    }
  } catch {
    return {}
  }
}

function writePrefs(p: Prefs) {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(p))
  } catch {
    // Private window or storage blocked: preferences last for this visit only.
  }
}

const speechSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window

/** A voice for the language, preferring a local one (they start faster). */
function voiceFor(lang: UiLang): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices()
  const matches = voices.filter((v) => v.lang.toLowerCase().startsWith(lang))
  return matches.find((v) => v.localService) ?? matches[0]
}

/**
 * Live captions under the call, each in the reader's own language.
 *
 * Must be rendered inside <LiveKitRoom> — the hook talks over the room's data
 * channel, and outside that context there is no channel to talk over.
 *
 * Two halves:
 *   - speaking: "Caption my speech" turns on the browser's recogniser for the
 *     local mic (Chrome, Edge, Safari), or sends each phrase to Groq's free
 *     Whisper in a browser without one (Firefox, 203), and everyone reads it
 *     in their language
 *   - listening: pick the language to read in, show the original under each
 *     translation, or have translations read aloud
 *
 * Reading aloud uses the browser's own voices (speechSynthesis), so it costs
 * nothing and needs no key. It runs a few seconds behind the speaker, because
 * a sentence is translated once it is finished. While it is on, the room's
 * audio is turned down so the translation can be heard over it.
 */
export function CaptionStrip({ enabled }: { enabled: boolean }) {
  const { t } = useLingui()
  const { lang: siteLang } = useContentLanguage()
  const [prefs, setPrefs] = useState<Prefs>(() => readPrefs())
  const readLang: UiLang = prefs.lang ?? siteLang
  const update = (patch: Prefs) =>
    setPrefs((p) => {
      const next = { ...p, ...patch }
      writePrefs(next)
      return next
    })

  const { captions, interim, captioning, toggleCaptioning, supported, engine, error } = useLiveCaptions(
    enabled,
    readLang
  )

  // Whisper's stops have reasons a member can act on. Browser errors keep
  // showing their own short code, as before.
  const errorText = (code: string): string => {
    switch (code) {
      case 'speech-day-cap':
        return t`Captions in this browser have used today's free allowance. Chrome, Edge or Safari can still caption you.`
      case 'speech-user-day-cap':
        return t`You have used today's hour of captions in this browser. Chrome, Edge or Safari can still caption you.`
      case 'speech-busy':
        return t`The caption service is busy, so a phrase was skipped. Captions carry on.`
      case 'speech-not-allowed':
        return t`Captions are not open to you in this room.`
      case 'speech-unavailable':
        return t`Captions are not available in this browser yet. Try Chrome, Edge or Safari.`
      case 'speech-no-mic':
        return t`Captions need your microphone. Allow it in the browser and try again.`
      case 'speech-error':
        return t`A phrase could not be captioned. Captions carry on.`
      default:
        return code
    }
  }

  // ---- read translations aloud, with the room turned down ----
  const room = useRoomContext()
  const voiceOn = !!prefs.voice && speechSupported()
  const spoken = useRef(new Set<string>())
  // Characters read aloud, for the organiser's usage panel (199).
  const meterRead = useSpeechUsage(room?.name || undefined, 'read_aloud_chars')

  useEffect(() => {
    if (!voiceOn || !room) return
    const duck = (p: RemoteParticipant) => p.setVolume(DUCKED_VOLUME)
    room.remoteParticipants.forEach(duck)
    room.on(RoomEvent.ParticipantConnected, duck)
    return () => {
      room.off(RoomEvent.ParticipantConnected, duck)
      room.remoteParticipants.forEach((p) => p.setVolume(1))
      window.speechSynthesis.cancel()
    }
  }, [voiceOn, room])

  useEffect(() => {
    if (!voiceOn) return
    for (const c of captions) {
      // Only finished translations, each once. A caption already in the
      // reader's language is heard from the speaker directly.
      if (!c.translated || spoken.current.has(c.id)) continue
      spoken.current.add(c.id)
      const u = new SpeechSynthesisUtterance(c.display)
      u.lang = readLang
      const v = voiceFor(readLang)
      if (v) u.voice = v
      u.rate = 1.05
      window.speechSynthesis.speak(u)
      meterRead(c.display.length)
    }
  }, [captions, voiceOn, readLang, meterRead])

  const hasLines = captions.length > 0 || interim.length > 0

  return (
    <div className="flex flex-col gap-1.5">
      {hasLines && (
        <div
          className="max-h-32 overflow-y-auto rounded-xl bg-black/40 px-3 py-2"
          // Captions arrive continuously; a screen reader announcing every line
          // over the top of the speaker would be worse than silence. `polite`
          // lets it finish the current sentence first.
          aria-live="polite"
          aria-atomic="false"
        >
          {captions.map((caption) => (
            <div key={caption.id} className="py-0.5">
              <p className="text-sm leading-snug text-white/90">
                {caption.name && (
                  <span className="mr-1.5 font-semibold text-white/60">{caption.name}</span>
                )}
                {/* lang= on the text itself, so a screen reader pronounces a
                    French caption with a French voice rather than reading it as
                    mangled English. */}
                <span lang={caption.translated ? readLang : caption.lang}>{caption.display}</span>
                {caption.translated && (
                  <Languages size={11} className="ml-1 inline-block text-white/30" aria-label={t`Translated`} />
                )}
              </p>
              {prefs.original && caption.translated && (
                <p lang={caption.lang} className="text-xs italic leading-snug text-white/45">
                  {caption.text}
                </p>
              )}
            </div>
          ))}
          {interim && (
            // The speaker's own in-progress words, on their screen only. Dimmed
            // because it is not final and will be rewritten as they keep talking.
            <p className="text-sm italic leading-snug text-white/40">{interim}</p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
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

        <label className="inline-flex items-center gap-1.5 text-micro text-white/70">
          <Languages size={13} aria-hidden="true" />
          <span className="sr-only">
            <Trans>Read captions in</Trans>
          </span>
          <select
            value={readLang}
            onChange={(e) => isUiLang(e.target.value) && update({ lang: e.target.value })}
            className="rounded-md border border-white/15 bg-black/30 px-1.5 py-0.5 text-micro text-white"
          >
            {UI_LANGS.map((l) => (
              <option key={l} value={l} className="text-black">
                {LANG_NAME[l]}
              </option>
            ))}
          </select>
        </label>

        <label className="inline-flex cursor-pointer items-center gap-1.5 text-micro text-white/70">
          <input
            type="checkbox"
            checked={!!prefs.original}
            onChange={(e) => update({ original: e.target.checked })}
            className="h-3 w-3 accent-lime-400"
          />
          <Trans>Show original</Trans>
        </label>

        {speechSupported() && (
          <button
            type="button"
            onClick={() => update({ voice: !prefs.voice })}
            aria-pressed={!!prefs.voice}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-micro font-semibold transition-colors',
              prefs.voice ? 'bg-white/20 text-white' : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
            )}
          >
            {prefs.voice ? <Volume2 size={13} aria-hidden="true" /> : <VolumeX size={13} aria-hidden="true" />}
            {prefs.voice ? <Trans>Hearing translations</Trans> : <Trans>Hear translations</Trans>}
          </button>
        )}

        {captioning && (
          <span className="text-micro text-white/40">
            <Trans>Everyone reads you in their own language</Trans>
          </span>
        )}
        {captioning && engine === 'whisper' && (
          <span className="text-micro text-white/40">
            <Trans>In this browser your captions appear a few seconds after each phrase.</Trans>
          </span>
        )}
        {prefs.voice && (
          <span className="text-micro text-white/40">
            <Trans>Read aloud a few seconds behind. The room is turned down while it plays.</Trans>
          </span>
        )}
        {error && <span className="text-micro text-amber-300/70">{errorText(error)}</span>}
      </div>
    </div>
  )
}
