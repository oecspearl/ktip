import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Captions, CaptionsOff, Languages, Pause, Play, Volume2 } from 'lucide-react'
import { useLocalParticipant } from '@livekit/components-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'
import { cn } from '../../../lib/utils'
import { UI_LANGS, type UiLang } from '../../../lib/i18n/protocol'
import { audienceFor, wantsSubtitles, type Audience } from '../../../lib/captions/followers'
import { captionRuns } from '../../../lib/captions/runs'
import { useCallLanguage, type CallLanguage } from '../../../hooks/useCallLanguage'
import { useLiveCaptions, type LiveCaptions } from '../../../hooks/useLiveCaptions'
import { useTranslationVoice } from '../../../hooks/useTranslationVoice'
import { Button } from '../../ui/Button'
import { Switch } from '../../ui/Toggle'
import { Segmented } from '../../ui/Segmented'

/**
 * Subtitles and translation for a call, in three pieces that share one state:
 *
 *   <CallCaptionsProvider>  inside <LiveKitRoom>, wrapping the call
 *     <CaptionOverlay />    on the video itself, centred at the bottom
 *     <TranslationOffer />  "Kemar is speaking English. Follow along in French?"
 *     <CallTranslateBar />  under the video: Subtitles, language, my own status
 *
 * Split this way so a call with LiveKit's own layout (MeetingCall) and a call
 * with ours (VenueCall) both put the subtitles where subtitles go, on the
 * picture, instead of in a strip underneath it.
 *
 * Nobody presses a button to be captioned. A listener turns subtitles on, or
 * answers the offer; that tells the call (captions/followers.ts), and the
 * speaker's browser starts transcribing for as long as anyone is following.
 */

/** Each language in its own name, for pickers. */
const ENDONYM: Record<UiLang, string> = { en: 'English', fr: 'Français', es: 'Español' }
/**
 * Each language in the reader's language, for the middle of a sentence. Its own
 * context, because the plain "English" entries are picker labels and French
 * capitalises those ("Anglais"), which is wrong mid-sentence.
 */
const LANG_NAME: Record<UiLang, MessageDescriptor> = {
  en: msg({ message: 'English', context: 'language name inside a sentence' }),
  fr: msg({ message: 'French', context: 'language name inside a sentence' }),
  es: msg({ message: 'Spanish', context: 'language name inside a sentence' }),
}

/** How long a subtitle stays up after its speaker stops. Film subtitles leave; so do these. */
const HOLD_MS = 7_000
/** About two lines of subtitle. Older words scroll off the front. */
const MAX_SUBTITLE_CHARS = 160

interface CallCaptionsValue {
  language: CallLanguage
  live: LiveCaptions
  audience: Audience
  /** Subtitles are on for me. */
  subs: boolean
  /** Translations are read aloud to me. */
  voiceOn: boolean
  translationAllowed: boolean
  canPublish: boolean
}

const CallCaptionsContext = createContext<CallCaptionsValue | null>(null)

function useCallCaptions(): CallCaptionsValue {
  const value = useContext(CallCaptionsContext)
  if (!value) throw new Error('Call caption pieces must be inside <CallCaptionsProvider>')
  return value
}

export function CallCaptionsProvider({
  children,
  translationAllowed = true,
  canPublish = true,
}: {
  children: ReactNode
  /** The organiser's switch for this room (207). Off still allows same-language subtitles. */
  translationAllowed?: boolean
  /** From the signed grant. A listen-only member is never transcribed. */
  canPublish?: boolean
}) {
  const language = useCallLanguage(translationAllowed)
  const { isMicrophoneEnabled } = useLocalParticipant()

  const audience = useMemo(
    () => audienceFor(language.roster.values(), language.lang, translationAllowed),
    [language.roster, language.lang, translationAllowed]
  )

  // Transcribe only while someone is following AND my microphone is live. The
  // recogniser opens its own microphone stream, so muting in the call would not
  // silence it; without the second condition a muted speaker would still be
  // captioned to the room.
  const transcribe = canPublish && isMicrophoneEnabled && !language.paused && audience.total > 0

  const live = useLiveCaptions({
    transcribe,
    speaks: language.lang,
    targets: audience.targets,
    reads: language.lang,
  })

  const subs = wantsSubtitles(language.choice)
  const voiceOn = language.choice === 'voice' && translationAllowed
  useTranslationVoice({ captions: live.captions, enabled: voiceOn, lang: language.lang })

  const value = useMemo<CallCaptionsValue>(
    () => ({ language, live, audience, subs, voiceOn, translationAllowed, canPublish }),
    [language, live, audience, subs, voiceOn, translationAllowed, canPublish]
  )

  return <CallCaptionsContext.Provider value={value}>{children}</CallCaptionsContext.Provider>
}

/** Re-render once a second while there is something that could expire. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(timer)
  }, [active])
  return now
}

/** The end of a long run, cut at a word, so the newest words are always the ones on screen. */
function tail(text: string, max: number): string {
  if (text.length <= max) return text
  const cut = text.slice(-max)
  const space = cut.indexOf(' ')
  return `…${space > 0 && space < 24 ? cut.slice(space + 1) : cut}`
}

/**
 * Subtitles on the picture. The parent must be positioned and carry Tailwind's
 * `@container`, so the text scales with the video rather than the window.
 */
export function CaptionOverlay({ className }: { className?: string }) {
  const { t } = useLingui()
  const { live, subs, voiceOn, language } = useCallCaptions()
  const lines = useMemo(() => live.captions.filter((caption) => !caption.own), [live.captions])
  const now = useNow(subs && lines.length > 0)

  if (!subs) return null
  const runs = captionRuns(lines)
  const last = runs[runs.length - 1]
  if (!last) return null
  const newest = last.pieces[last.pieces.length - 1]
  if (now - newest.at > HOLD_MS) return null

  const from = last.pieces[0].lang
  const translated = last.pieces.some((piece) => piece.translated)
  const shown = tail(last.pieces.map((piece) => piece.display).join(' '), MAX_SUBTITLE_CHARS)
  const original =
    translated && language.showOriginal
      ? tail(last.pieces.map((piece) => piece.text).join(' '), MAX_SUBTITLE_CHARS)
      : null

  return (
    <div
      // Polite: a screen reader finishes its sentence before reading the next line.
      aria-live="polite"
      className={cn(
        'pointer-events-none absolute inset-x-[5%] bottom-[7%] z-raised flex flex-col items-center gap-1 text-center',
        className
      )}
    >
      <span className="inline-flex items-center gap-1.5 rounded-full bg-black/60 px-2 py-0.5 text-micro font-bold tracking-wide text-white/75">
        {last.name && <span className="text-white">{last.name}</span>}
        {translated ? `${from.toUpperCase()} → ${language.lang.toUpperCase()}` : from.toUpperCase()}
        {translated && voiceOn && <Volume2 size={11} className="text-ktip-tropical-400" aria-label={t`Read aloud`} />}
      </span>
      {/* lang= on the text, so a screen reader reads French with a French voice. */}
      <p lang={translated ? language.lang : from} className="max-w-[44ch] text-balance text-[clamp(0.875rem,2.4cqw,1.625rem)] font-bold">
        <span className="box-decoration-clone rounded-[0.2em] bg-black/75 px-[0.4em] leading-[1.6] text-white">
          {shown}
        </span>
      </p>
      {original && (
        <p lang={from} className="max-w-[44ch] text-balance text-[clamp(0.75rem,1.6cqw,1rem)] italic">
          <span className="box-decoration-clone rounded-[0.2em] bg-black/55 px-[0.4em] leading-[1.6] text-white/80">
            {original}
          </span>
        </p>
      )}
    </div>
  )
}

/**
 * The offer, shown once someone who speaks another language starts talking.
 * Asked once per browser: the answer covers every speaker, and lives in the
 * language button afterwards.
 */
export function TranslationOffer({ className }: { className?: string }) {
  const { t, i18n } = useLingui()
  const { language } = useCallCaptions()
  const offer = language.offer
  if (!offer) return null

  const name = offer.name.split(' ')[0]
  const theirs = i18n._(LANG_NAME[offer.speaks])
  const mine = i18n._(LANG_NAME[language.lang])

  return (
    <div
      role="dialog"
      aria-labelledby="call-offer-title"
      className={cn(
        'absolute right-3 top-3 z-raised flex w-[min(21rem,calc(100%-1.5rem))] flex-col gap-3 rounded-surface border border-ktip-sand-200 bg-ktip-cream p-4 text-ktip-sand-900 shadow-card',
        className
      )}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-ktip-ocean-50 text-ktip-ocean-700">
          <Languages size={18} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p id="call-offer-title" className="text-label font-bold">
            {t`${name} is speaking ${theirs}`}
          </p>
          <p className="mt-0.5 text-caption text-ktip-sand-600">
            {t`Follow along in ${mine}? Read what they say as subtitles, and hear it read aloud if you like.`}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Button size="sm" onClick={() => language.setChoice('voice')}>
          <Volume2 size={14} aria-hidden="true" />
          <Trans>Subtitles and voice</Trans>
        </Button>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" className="flex-1" onClick={() => language.setChoice('captions')}>
            <Trans>Subtitles only</Trans>
          </Button>
          <Button size="sm" variant="ghost" onClick={() => language.setChoice('off')}>
            <Trans>Not now</Trans>
          </Button>
        </div>
      </div>
      <p className="text-micro text-ktip-sand-500">
        <Trans>This covers everyone who speaks another language. Change it with the language button under the call.</Trans>
      </p>
    </div>
  )
}

/**
 * For a call with no video (a huddle): a dark band that appears only while
 * there is something to read. The offer sits in it rather than over it, so the
 * band grows to fit instead of the card spilling out.
 */
export function SubtitleBand() {
  const { subs, language } = useCallCaptions()
  if (!subs && !language.offer) return null
  return (
    <div className="relative flex min-h-28 flex-col gap-2 rounded-surface bg-black/30 p-3 @container">
      <TranslationOffer className="static w-full" />
      <CaptionOverlay />
    </div>
  )
}

/** The row under the video: Subtitles, the language menu, and what is happening to my own words. */
export function CallTranslateBar() {
  const { t } = useLingui()
  const { language, live, audience, subs, translationAllowed, canPublish } = useCallCaptions()
  const [menuOpen, setMenuOpen] = useState(false)

  const pill = (on: boolean) =>
    cn(
      'inline-flex items-center gap-1.5 rounded-control px-2.5 py-1 text-micro font-semibold transition-colors',
      on ? 'bg-white/20 text-white' : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
    )

  const audienceText = (Object.entries(audience.byLang) as [UiLang, number][])
    .map(([lang, count]) => `${ENDONYM[lang]} (${count})`)
    .join(', ')

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        aria-pressed={subs}
        onClick={() => language.setChoice(subs ? 'off' : 'captions')}
        className={pill(subs)}
      >
        {subs ? <Captions size={13} aria-hidden="true" /> : <CaptionsOff size={13} aria-hidden="true" />}
        <Trans>Subtitles</Trans>
      </button>

      <div className="relative">
        <button
          type="button"
          aria-expanded={menuOpen}
          aria-haspopup="dialog"
          onClick={() => setMenuOpen((open) => !open)}
          className={pill(menuOpen)}
        >
          <Languages size={13} aria-hidden="true" />
          {ENDONYM[language.lang]}
        </button>
        {menuOpen && <LanguageMenu onClose={() => setMenuOpen(false)} />}
      </div>

      {canPublish && language.paused && (
        <span className="inline-flex items-center gap-2 text-micro text-white/60">
          <Trans>Your subtitles are paused</Trans>
          <button type="button" onClick={() => language.setPaused(false)} className={pill(false)}>
            <Play size={12} aria-hidden="true" />
            <Trans>Resume</Trans>
          </button>
        </span>
      )}

      {canPublish && !language.paused && live.transcribing && audience.total > 0 && (
        <span className="inline-flex min-w-0 items-center gap-2 text-micro text-white/70" title={t`Only while someone is reading your subtitles. Nothing is stored.`}>
          <span className="h-2 w-2 shrink-0 rounded-full bg-ktip-tropical-400" aria-hidden="true" />
          <span className="min-w-0 truncate">{t`Your words go out in ${audienceText}`}</span>
          <button type="button" onClick={() => language.setPaused(true)} className={pill(false)}>
            <Pause size={12} aria-hidden="true" />
            <Trans>Pause</Trans>
          </button>
        </span>
      )}

      {live.transcribing && live.engine === 'whisper' && (
        <span className="text-micro text-white/40">
          <Trans>In this browser your subtitles appear a few seconds after each phrase.</Trans>
        </span>
      )}
      {!translationAllowed && (
        <span className="text-micro text-white/40">
          <Trans>Translation is off in this room.</Trans>
        </span>
      )}
      {live.error && <span className="text-micro text-ktip-sun-300">{errorText(live.error)}</span>}
    </div>
  )

  /** Every stop has a reason a member can act on. An unknown code shows as is. */
  function errorText(code: string): string {
    switch (code) {
      case 'speech-day-cap':
        return t`Subtitles in this browser have used today's free allowance. Chrome, Edge or Safari can still subtitle you.`
      case 'speech-user-day-cap':
        return t`You have used today's hour of subtitles in this browser. Chrome, Edge or Safari can still subtitle you.`
      case 'speech-busy':
        return t`The subtitle service is busy, so a phrase was skipped. Subtitles carry on.`
      case 'speech-not-allowed':
        return t`Subtitles are not open to you in this room.`
      case 'speech-unavailable':
        return t`Subtitles are not available in this browser yet. Try Chrome, Edge or Safari.`
      case 'speech-no-mic':
        return t`Subtitles need your microphone. Allow it in the browser and try again.`
      case 'speech-error':
        return t`A phrase could not be subtitled. Subtitles carry on.`
      case 'speech-browser-unreachable':
        return t`This browser cannot reach its speech service. Try Chrome or Edge, or turn off your VPN.`
      default:
        return code
    }
  }
}

function LanguageMenu({ onClose }: { onClose: () => void }) {
  const { t } = useLingui()
  const { language, subs, voiceOn, translationAllowed, canPublish } = useCallCaptions()
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node)) onClose()
    }
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    // Next tick, so the click that opened the menu does not close it.
    const timer = setTimeout(() => document.addEventListener('pointerdown', onDown), 0)
    document.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const row = (label: ReactNode, hint: ReactNode, control: ReactNode) => (
    <div className="flex items-center justify-between gap-3">
      <span className="min-w-0">
        <span className="block text-caption font-semibold text-ktip-sand-900">{label}</span>
        <span className="block text-micro text-ktip-sand-500">{hint}</span>
      </span>
      {control}
    </div>
  )

  return (
    <div
      ref={panel}
      role="dialog"
      aria-label={t`Language and subtitles`}
      className="absolute bottom-full left-0 z-dropdown mb-2 flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-4 rounded-surface border border-ktip-sand-200 bg-ktip-cream p-4 text-ktip-sand-900 shadow-card max-sm:fixed max-sm:inset-x-4 max-sm:bottom-24 max-sm:w-auto"
    >
      <div className="flex flex-col gap-2">
        <span className="text-micro font-semibold uppercase tracking-wider text-ktip-sand-500">
          <Trans>I speak and read</Trans>
        </span>
        <Segmented
          value={language.lang}
          options={UI_LANGS.map((lang) => ({ value: lang, label: ENDONYM[lang] }))}
          onChange={language.setLang}
          label={t`My language`}
          radius="sm"
        />
      </div>
      <div className="flex flex-col gap-3">
        {row(
          <Trans>Subtitles</Trans>,
          <Trans>On the video, in your language</Trans>,
          <Switch
            checked={subs}
            onChange={(on) => language.setChoice(on ? 'captions' : 'off')}
            label={t`Subtitles`}
          />
        )}
        {row(
          <Trans>Hear translations</Trans>,
          <Trans>The speaker’s own voice drops while it plays</Trans>,
          <Switch
            checked={voiceOn}
            disabled={!translationAllowed}
            onChange={(on) => language.setChoice(on ? 'voice' : 'captions')}
            label={t`Hear translations`}
          />
        )}
        {row(
          <Trans>Show the original</Trans>,
          <Trans>Under each translated line</Trans>,
          <Switch checked={language.showOriginal} onChange={language.setShowOriginal} label={t`Show the original`} />
        )}
        {canPublish &&
          row(
            <Trans>Subtitle me for others</Trans>,
            <Trans>Runs only while someone is reading your subtitles</Trans>,
            <Switch
              checked={!language.paused}
              onChange={(on) => language.setPaused(!on)}
              label={t`Subtitle me for others`}
            />
          )}
      </div>
      {!translationAllowed && (
        <p className="text-micro text-ktip-sand-600">
          <Trans>The organiser has turned translation off in this room. Subtitles still show what is said.</Trans>
        </p>
      )}
      <p className="text-micro text-ktip-sand-500">
        <Trans>Nothing anyone says is stored. Subtitles disappear after a few seconds.</Trans>
      </p>
    </div>
  )
}
