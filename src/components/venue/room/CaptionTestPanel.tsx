import { useEffect, useRef, useState } from 'react'
import { Loader2, Mic, RotateCcw } from 'lucide-react'
import { acquireMic } from '@a11y-kit'
import { Trans, useLingui } from '@lingui/react/macro'
import { cn } from '../../../lib/utils'
import { UI_LANGS, type UiLang } from '../../../lib/i18n/protocol'
import { useContentLanguage } from '../../../i18n/useContentLanguage'
import { captionEngine, createSpeechRecognizer, type SpeechRecognizer } from '../../../lib/captions/speech'
import { createWhisperRecognizer } from '../../../lib/captions/whisper-speech'
import { translateCaption } from '../../../lib/captions/caption-translate'
import { readCallLanguage } from '../../../hooks/useCallLanguage'
import { Segmented } from '../../ui/Segmented'
import { RoomPanel } from './RoomPanel'
import type { VenueRoom } from '../../../types'

const ENDONYM: Record<UiLang, string> = { en: 'English', fr: 'Français', es: 'Español' }

/** Long enough to take a breath before speaking; short enough not to sit there listening. */
const LISTEN_MS = 12_000

type Phase = 'idle' | 'listening' | 'translating' | 'done'
type Problem = 'unsupported' | 'no-mic' | 'unreachable' | 'used-up' | 'service' | 'mic-busy' | 'silent' | 'no-translation'

/**
 * The Green Room's subtitle test.
 *
 * A speaker says one sentence and sees it the way a listener in each of the
 * other languages will: as a subtitle, translated. The same recogniser and the
 * same translation route the call uses, so what it shows is what the audience
 * gets, including when the room has translation switched off.
 *
 * Nothing is broadcast and nothing is stored: the call never hears the test,
 * and the text is gone when the panel unmounts.
 */
export function CaptionTestPanel({ room }: { room: Pick<VenueRoom, 'id' | 'live_translation'> }) {
  const { t } = useLingui()
  const { lang: contentLang } = useContentLanguage()
  const [speaks, setSpeaks] = useState<UiLang>(() => readCallLanguage() ?? contentLang)
  const [phase, setPhase] = useState<Phase>('idle')
  const [problem, setProblem] = useState<Problem | null>(null)
  const [heard, setHeard] = useState('')
  const [results, setResults] = useState<Partial<Record<UiLang, string>>>({})

  const stopRef = useRef<(() => void) | null>(null)
  useEffect(() => () => stopRef.current?.(), [])

  const translationOff = room.live_translation === false
  const others = UI_LANGS.filter((lang) => lang !== speaks)

  const start = () => {
    stopRef.current?.()
    setProblem(null)
    setHeard('')
    setResults({})

    const engine = captionEngine()
    if (!engine) {
      setProblem('unsupported')
      return
    }
    // Live subtitles hold the microphone at the same priority. Taking it from
    // them would silence this speaker for the people already following them.
    const release = acquireMic('caption-test', 10)
    if (!release) {
      setProblem('mic-busy')
      return
    }

    let settled = false
    let lastText = ''
    let recognizer: SpeechRecognizer | null = null
    const finish = () => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      recognizer?.stop()
      release()
      stopRef.current = null
    }
    const fail = (next: Problem) => {
      finish()
      setProblem(next)
      setPhase('idle')
    }
    // Out of time mid-sentence: what was heard so far is the sentence.
    const timer = window.setTimeout(() => {
      if (lastText) onSegment({ text: lastText, final: true })
      else fail('silent')
    }, LISTEN_MS)

    function onSegment({ text, final }: { text: string; final: boolean }) {
      if (settled) return
      lastText = text
      setHeard(text)
      if (!final) return
      finish()
      if (translationOff) {
        setPhase('done')
        return
      }
      setPhase('translating')
      void translateCaption({ text, from: speaks, targets: others, roomId: room.id }).then((variants) => {
        setResults(variants)
        if (Object.keys(variants).length === 0) setProblem('no-translation')
        setPhase('done')
      })
    }

    recognizer =
      engine === 'whisper'
        ? createWhisperRecognizer({
            lang: speaks,
            roomId: room.id,
            onSegment,
            onError: (reason, fatal) => {
              if (!fatal) return
              if (reason === 'speech-no-mic') fail('no-mic')
              else if (reason === 'speech-day-cap' || reason === 'speech-user-day-cap') fail('used-up')
              else fail('service')
            },
          })
        : createSpeechRecognizer({
            lang: speaks,
            onSegment,
            onError: (_reason, failure) => {
              if (failure === 'no-mic') fail('no-mic')
              else if (failure === 'unreachable') fail('unreachable')
            },
          })

    stopRef.current = finish
    setPhase('listening')
    recognizer.start()
  }

  const busy = phase === 'listening' || phase === 'translating'

  return (
    <RoomPanel title={t`Subtitle test`} meta={<Trans>Nothing is stored</Trans>}>
      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-ktip-sand-700">
          <span>
            <Trans>I will speak</Trans>
          </span>
          <Segmented
            value={speaks}
            options={UI_LANGS.map((code) => ({ value: code, label: ENDONYM[code] }))}
            onChange={(next) => {
              if (!busy) setSpeaks(next)
            }}
            label={t`The language you will speak`}
            radius="sm"
          />
        </div>

        <p className="text-sm text-ktip-sand-600">
          {translationOff ? (
            <Trans>Translation is off in this room, so this shows your subtitles in the language you speak.</Trans>
          ) : (
            <Trans>Say one sentence from your talk. You will see it the way listeners in the other languages will.</Trans>
          )}
        </p>

        {/* The same black-band look as the call, so the test reads like the real thing. */}
        <div className="@container rounded-control bg-ktip-ink px-4 py-5">
          {phase === 'idle' && !heard ? (
            <p className="text-center text-sm text-white/60">
              <Trans>Your subtitles appear here.</Trans>
            </p>
          ) : (
            <div className="flex flex-col items-center gap-3 text-center">
              <SubtitleLine label={ENDONYM[speaks]} lang={speaks} text={heard || '…'} dim={phase === 'listening'} />
              {phase === 'translating' &&
                others.map((lang) => <SubtitleLine key={lang} label={ENDONYM[lang]} lang={lang} text="…" dim />)}
              {phase === 'done' &&
                others
                  .filter((lang) => results[lang])
                  .map((lang) => <SubtitleLine key={lang} label={ENDONYM[lang]} lang={lang} text={results[lang]!} />)}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={start}
            disabled={busy}
            className="inline-flex h-10 items-center gap-2 rounded-control bg-ktip-ocean-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-ktip-ocean-700 disabled:opacity-60"
          >
            {phase === 'listening' ? (
              <Mic size={16} className="animate-pulse" aria-hidden="true" />
            ) : phase === 'translating' ? (
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            ) : phase === 'done' ? (
              <RotateCcw size={16} aria-hidden="true" />
            ) : (
              <Mic size={16} aria-hidden="true" />
            )}
            {phase === 'listening'
              ? t`Listening…`
              : phase === 'translating'
                ? t`Translating…`
                : phase === 'done'
                  ? t`Try another sentence`
                  : t`Start the test`}
          </button>
          {problem && (
            <p role="status" className="min-w-0 flex-1 basis-56 text-sm text-ktip-sun-800">
              {problemText(problem)}
            </p>
          )}
        </div>
      </div>
    </RoomPanel>
  )

  function problemText(code: Problem): string {
    switch (code) {
      case 'unsupported':
        return t`This browser cannot make subtitles. Try Chrome, Edge or Safari.`
      case 'no-mic':
        return t`The test needs your microphone. Allow it in the browser and try again.`
      case 'unreachable':
        return t`This browser's speech service is out of reach from here. Try Chrome, Edge or Safari.`
      case 'used-up':
        return t`Subtitles in this browser have used today's free allowance. Chrome, Edge or Safari can still run the test.`
      case 'service':
        return t`The subtitle service did not answer. Try again in a moment.`
      case 'mic-busy':
        return t`Your live subtitles are using the microphone. Pause them in the call, then run the test.`
      case 'silent':
        return t`Nothing came through. Check your microphone is on and try again.`
      case 'no-translation':
        return t`The translation did not come back this time. Try again in a moment.`
    }
  }
}

function SubtitleLine({ label, lang, text, dim }: { label: string; lang: UiLang; text: string; dim?: boolean }) {
  return (
    <div className="flex max-w-full flex-col items-center gap-1">
      <span className="rounded-full bg-white/10 px-2 py-0.5 text-micro font-bold tracking-wide text-white/70">{label}</span>
      <p lang={lang} className={cn('max-w-[44ch] text-balance text-base font-bold @lg:text-lg', dim && 'opacity-70')}>
        <span className="box-decoration-clone rounded-[0.2em] bg-black/75 px-[0.4em] leading-[1.6] text-white">{text}</span>
      </p>
    </div>
  )
}
