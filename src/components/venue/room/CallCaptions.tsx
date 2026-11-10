import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Captions, CaptionsOff, Languages, Pause, Play, Volume2 } from 'lucide-react'
import { useLocalParticipant, useRemoteParticipants, useSpeakingParticipants } from '@livekit/components-react'
import { useLanguage } from '../../../i18n/LanguageContext'
import { Trans, useLingui } from '@lingui/react/macro'
import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'
import { cn } from '../../../lib/utils'
import { UI_LANGS, type UiLang } from '../../../lib/i18n/protocol'
import {
  audienceFor,
  captionStatus,
  subtitleNotice,
  wantsSubtitles,
  type Audience,
  type CaptionStatus,
  type SubtitleNotice,
} from '../../../lib/captions/followers'
import { captionRuns, type CaptionRun } from '../../../lib/captions/runs'
import { useCallLanguage, type CallLanguage } from '../../../hooks/useCallLanguage'
import { useLiveCaptions, type LiveCaptions, type ResolvedCaption } from '../../../hooks/useLiveCaptions'
import { primeSpeechVoice, useTranslationVoice } from '../../../hooks/useTranslationVoice'
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
  /** My recogniser should be running right now. */
  transcribe: boolean
  micOn: boolean
  /** What the call is told about my recogniser (followers.ts). */
  cap: CaptionStatus | undefined
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
  // My caption status is worked out from the recogniser below, which depends on
  // the language state above it, so it reaches the call one render later.
  const [cap, setCap] = useState<CaptionStatus | undefined>(undefined)
  const language = useCallLanguage(translationAllowed, cap)
  const { isMicrophoneEnabled } = useLocalParticipant()

  const audience = useMemo(
    () => audienceFor(language.roster.values(), language.speaks, translationAllowed),
    [language.roster, language.speaks, translationAllowed]
  )

  // Transcribe only while someone is following AND my microphone is live. The
  // recogniser opens its own microphone stream, so muting in the call would not
  // silence it; without the second condition a muted speaker would still be
  // captioned to the room.
  const transcribe = canPublish && isMicrophoneEnabled && !language.paused && audience.total > 0

  const live = useLiveCaptions({
    transcribe,
    speaks: language.speaks,
    targets: audience.targets,
    reads: language.reads,
  })

  const nextCap = captionStatus({
    canPublish,
    followed: audience.total > 0,
    paused: language.paused,
    micOn: isMicrophoneEnabled,
    supported: live.supported,
    running: live.transcribing,
    failed: live.failed,
  })
  useEffect(() => setCap(nextCap), [nextCap])

  const subs = wantsSubtitles(language.choice)
  const voiceOn = language.choice === 'voice' && translationAllowed
  useTranslationVoice({ captions: live.captions, enabled: voiceOn, lang: language.reads })

  const value = useMemo<CallCaptionsValue>(
    () => ({
      language,
      live,
      audience,
      subs,
      voiceOn,
      translationAllowed,
      canPublish,
      transcribe,
      micOn: isMicrophoneEnabled,
      cap,
    }),
    [language, live, audience, subs, voiceOn, translationAllowed, canPublish, transcribe, isMicrophoneEnabled, cap]
  )

  return <CallCaptionsContext.Provider value={value}>{children}</CallCaptionsContext.Provider>
}

/**
 * The language someone in the call speaks, for the code on their tile. Null
 * outside a call's provider or before they have said.
 */
export function useSpeakerLang(identity: string, isLocal: boolean): UiLang | null {
  const value = useContext(CallCaptionsContext)
  if (!value) return null
  if (isLocal) return value.language.speaks
  return value.language.roster.get(identity)?.speaks ?? null
}

/**
 * The chip in the call's header: what my subtitles are doing. "Subtitles · FR",
 * with "· voice" when translations are read aloud, or "Translation off" with a
 * way back on after I chose to keep the original.
 */
export function TranslationChip() {
  const { t } = useLingui()
  const { language, subs, voiceOn, translationAllowed } = useCallCaptions()
  const chip =
    'inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-micro font-bold'
  const code = language.reads.toUpperCase()
  if (subs) {
    return (
      <span className={cn(chip, 'border-ktip-tropical-400/35 bg-ktip-tropical-400/15 text-ktip-tropical-300')}>
        <Captions size={12} aria-hidden="true" />
        {voiceOn ? t`Subtitles · ${code} · voice` : t`Subtitles · ${code}`}
      </span>
    )
  }
  if (language.choice === 'off' && translationAllowed) {
    return (
      <span className={cn(chip, 'border-white/12 bg-white/9 text-white/74')}>
        <Languages size={12} aria-hidden="true" />
        <Trans>Translation off</Trans>
        <button
          type="button"
          onClick={() => language.setChoice('captions')}
          className="font-extrabold text-white underline underline-offset-2"
        >
          <Trans>Turn on</Trans>
        </button>
      </span>
    )
  }
  return null
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
export function CaptionOverlay({
  className,
  band = false,
}: {
  className?: string
  /** In a subtitle band rather than over video: there is room to say "waiting" and whose microphone is off. */
  band?: boolean
}) {
  const { t } = useLingui()
  const { live, subs, voiceOn, language } = useCallCaptions()
  const lines = useMemo(() => live.captions.filter((caption) => !caption.own), [live.captions])
  const now = useNow(subs && lines.length > 0)
  const notice = useSubtitleNotice(subs, band)

  if (!subs) return null
  const runs = captionRuns(lines)
  const last = runs[runs.length - 1]
  const newest = last?.pieces[last.pieces.length - 1]
  const showing = last && newest && now - newest.at <= HOLD_MS ? last : null

  return (
    <div
      // Polite: a screen reader finishes its sentence before reading the next
      // line. Always mounted while subtitles are on, so the region is there
      // before the first line arrives.
      aria-live="polite"
      className={cn(
        'pointer-events-none absolute inset-x-[5%] bottom-[7%] z-raised flex flex-col items-center gap-1 text-center',
        className
      )}
    >
      {showing ? (
        <SubtitleLine run={showing} reads={language.reads} showOriginal={language.showOriginal} voiceOn={voiceOn} readAloud={t`Read aloud`} />
      ) : (
        // Nothing to read: say why, rather than an empty band that looks
        // exactly like subtitles not working.
        notice && (
          <span className="rounded-full bg-black/60 px-3 py-1 text-micro font-semibold text-white/75">
            {noticeText(notice)}
          </span>
        )
      )}
    </div>
  )

  function noticeText(next: SubtitleNotice): string {
    switch (next.kind) {
      case 'waiting':
        return t`Subtitles show here when someone speaks.`
      case 'muted':
        return t`${next.name}'s microphone is off.`
      case 'all-muted':
        return t`Every microphone is off.`
      case 'paused':
        return t`${next.name} has paused their subtitles.`
      case 'cannot':
        return t`${next.name}'s browser can't make subtitles.`
    }
  }
}

function SubtitleLine({
  run,
  reads,
  showOriginal,
  voiceOn,
  readAloud,
}: {
  run: CaptionRun<ResolvedCaption>
  reads: UiLang
  showOriginal: boolean
  voiceOn: boolean
  readAloud: string
}) {
  const from = run.pieces[0].lang
  const translated = run.pieces.some((piece) => piece.translated)
  const shown = tail(run.pieces.map((piece) => piece.display).join(' '), MAX_SUBTITLE_CHARS)
  const original =
    translated && showOriginal ? tail(run.pieces.map((piece) => piece.text).join(' '), MAX_SUBTITLE_CHARS) : null

  return (
    <>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-black/60 px-2 py-0.5 text-micro font-bold tracking-wide text-white/75">
        {run.name && <span className="text-white">{run.name}</span>}
        {translated ? `${from.toUpperCase()} → ${reads.toUpperCase()}` : from.toUpperCase()}
        {translated && voiceOn && <Volume2 size={11} className="text-ktip-tropical-400" aria-label={readAloud} />}
      </span>
      {/* lang= on the text, so a screen reader reads French with a French voice. */}
      <p lang={translated ? reads : from} className="max-w-[44ch] text-balance text-[clamp(0.875rem,2.4cqw,1.625rem)] font-bold">
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
    </>
  )
}

/**
 * Why my subtitle area is empty, from what everyone else's browser reports
 * (followers.ts `subtitleNotice`). Null while subtitles are off.
 */
function useSubtitleNotice(active: boolean, band: boolean): SubtitleNotice | null {
  const { t } = useLingui()
  const { language } = useCallCaptions()
  const remotes = useRemoteParticipants()
  const speaking = useSpeakingParticipants()
  const someone = t`Someone`
  return useMemo(() => {
    if (!active) return null
    const talking = new Set(speaking.map((participant) => participant.identity))
    return subtitleNotice(
      remotes.map((participant) => ({
        // First name, as in the offer. The identity is a user id: never shown.
        name: participant.name?.trim().split(/\s+/)[0] || someone,
        cap: language.roster.get(participant.identity)?.cap,
        speaking: talking.has(participant.identity),
      })),
      band
    )
  }, [active, band, remotes, speaking, language.roster, someone])
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
  const mine = i18n._(LANG_NAME[language.reads])

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
        <Button
          size="sm"
          onClick={() => {
            // Inside the tap: phones keep speech silent until a gesture has spoken once.
            primeSpeechVoice()
            language.setChoice('voice')
          }}
        >
          <Volume2 size={14} aria-hidden="true" />
          <Trans>Subtitles and voice</Trans>
        </Button>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" className="flex-1" onClick={() => language.setChoice('captions')}>
            <Trans>Subtitles only</Trans>
          </Button>
          <Button size="sm" variant="ghost" onClick={() => language.setChoice('off')}>
            <Trans>Keep the original</Trans>
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
      <CaptionOverlay band />
    </div>
  )
}

/** A square button in the call dock. Pressed states read green, like the rest of the site. */
export const DOCK_BUTTON =
  'relative inline-flex h-10.5 w-10.5 shrink-0 items-center justify-center rounded-control border border-white/12 bg-white/9 text-white transition-colors hover:bg-white/16 disabled:cursor-not-allowed disabled:opacity-40 aria-pressed:border-ktip-tropical-400/40 aria-pressed:bg-ktip-tropical-400/18 aria-pressed:text-ktip-tropical-300'

const pill = (on: boolean) =>
  cn(
    'inline-flex items-center gap-1.5 rounded-control px-2.5 py-1 text-micro font-semibold transition-colors',
    on ? 'bg-white/20 text-white' : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
  )

/** Subtitles on or off. `dock` is the square icon button; `pill` the labelled one. */
export function SubtitlesToggle({ variant = 'pill' }: { variant?: 'pill' | 'dock' }) {
  const { t } = useLingui()
  const { language, subs } = useCallCaptions()
  const toggle = () => language.setChoice(subs ? 'off' : 'captions')

  if (variant === 'dock') {
    const label = subs ? t`Turn subtitles off` : t`Turn subtitles on`
    return (
      <button type="button" aria-pressed={subs} aria-label={label} title={label} onClick={toggle} className={DOCK_BUTTON}>
        {subs ? <Captions size={18} aria-hidden="true" /> : <CaptionsOff size={18} aria-hidden="true" />}
      </button>
    )
  }
  return (
    <button type="button" aria-pressed={subs} onClick={toggle} className={pill(subs)}>
      {subs ? <Captions size={13} aria-hidden="true" /> : <CaptionsOff size={13} aria-hidden="true" />}
      <Trans>Subtitles</Trans>
    </button>
  )
}

/** My language, with the menu of subtitle and voice settings behind it. */
export function LanguageButton({ variant = 'pill' }: { variant?: 'pill' | 'dock' }) {
  const { t } = useLingui()
  const { language } = useCallCaptions()
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)

  return (
    <div ref={wrap} className="relative">
      {variant === 'dock' ? (
        <button
          type="button"
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={t`Language and subtitles`}
          title={t`Language and subtitles`}
          onClick={() => setOpen((current) => !current)}
          className={DOCK_BUTTON}
        >
          <Languages size={18} aria-hidden="true" />
          <span className="absolute -right-1.5 -top-1.5 rounded-full bg-ktip-tropical-500 px-1 text-micro font-extrabold leading-none text-ktip-ink">
            {language.reads.toUpperCase()}
          </span>
        </button>
      ) : (
        <button
          type="button"
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => setOpen((current) => !current)}
          className={pill(open)}
        >
          <Languages size={13} aria-hidden="true" />
          {ENDONYM[language.reads]}
        </button>
      )}
      {open && <LanguageMenu container={wrap} align={variant === 'dock' ? 'center' : 'left'} onClose={() => setOpen(false)} />}
    </div>
  )
}

/** What is happening to my own words, and anything that went wrong. */
export function SpeakerStatus() {
  const { t, i18n } = useLingui()
  const { language, live, audience, translationAllowed, canPublish, micOn } = useCallCaptions()

  const audienceText = (Object.entries(audience.byLang) as [UiLang, number][])
    .map(([lang, count]) => `${ENDONYM[lang]} (${count})`)
    .join(', ')

  // What went out from my microphone just now. Never a subtitle on my own
  // video; a faint line here, so a speaker can see they are being heard
  // (2026-11-10: a two-device test could not tell which side had failed).
  const mine = useMemo(() => {
    const own = live.captions.filter((caption) => caption.own)
    const runs = captionRuns(own)
    return runs[runs.length - 1] ?? null
  }, [live.captions])
  const newestMine = mine?.pieces[mine.pieces.length - 1]
  const now = useNow(live.transcribing && !!newestMine)
  const heard =
    live.transcribing && mine && newestMine && now - newestMine.at <= HOLD_MS
      ? tail(mine.pieces.map((piece) => piece.text).join(' '), 90)
      : null
  const spoken = i18n._(LANG_NAME[language.speaks])

  return (
    <>
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
        <span
          className="inline-flex min-w-0 items-center gap-2 text-micro text-white/70"
          title={t`Only while someone is reading your subtitles. Nothing is stored.`}
        >
          <span className="h-2 w-2 shrink-0 rounded-full bg-ktip-tropical-400" aria-hidden="true" />
          <span className="min-w-0 truncate">{t`Your words go out in ${audienceText}`}</span>
          <button type="button" onClick={() => language.setPaused(true)} className={pill(false)}>
            <Pause size={12} aria-hidden="true" />
            <Trans>Pause</Trans>
          </button>
        </span>
      )}

      {/* Followed, but muted: the recogniser stays off, so say so here instead
          of leaving the listener's band empty with no reason on this side. */}
      {canPublish && !language.paused && audience.total > 0 && !micOn && (
        <span className="text-micro text-white/70">
          <Trans>Someone wants to read what you say. Unmute so they can.</Trans>
        </span>
      )}

      {heard && (
        <span lang={language.speaks} className="w-full min-w-0 truncate text-micro text-white/55 @max-3xl:text-center">
          {t`Heard: ${heard}`}
        </span>
      )}

      {live.transcribing && live.translationIssue && (
        <span className="text-micro text-ktip-sun-300">
          {t`Translation isn't working right now, so listeners see your words in ${spoken}.`}
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
      {/* People want my words but this browser cannot hear them. Silent before,
          which looked exactly like translation not working. */}
      {canPublish && !language.paused && audience.total > 0 && !live.supported && (
        <span className="text-micro text-ktip-sun-300">
          <Trans>Someone is following you, but this browser cannot subtitle you. Use Chrome, Edge or Safari.</Trans>
        </span>
      )}
      {live.error && <span className="text-micro text-ktip-sun-300">{errorText(live.error)}</span>}
    </>
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

/**
 * What the call knows, for testing with two devices: add ?calldebug to the
 * address. English only and unstyled on purpose; it is a tool, not a feature.
 */
export function CallDebug() {
  const value = useContext(CallCaptionsContext)
  const [on] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).has('calldebug')
    } catch {
      return false
    }
  })
  if (!on || !value) return null
  const { language, live, audience, subs, transcribe, micOn, translationAllowed, cap } = value
  const last = live.captions[live.captions.length - 1]
  const roster = [...language.roster.entries()]
  return (
    <pre className="col-span-full max-h-48 overflow-auto whitespace-pre-wrap rounded-control bg-black/60 p-2 font-mono text-micro leading-snug text-white/80">
      {[
        `me: speaks ${language.speaks}, reads ${language.reads}, choice ${language.choice}, subs ${subs}, paused ${language.paused}, mic ${micOn}`,
        `room translation ${translationAllowed ? 'on' : 'off'}; offer ${language.offer ? `${language.offer.name} (${language.offer.speaks})` : 'none'}`,
        `following me: ${audience.total}, translate into [${audience.targets.join(', ')}]; transcribe ${transcribe}, engine ${live.engine ?? 'none'}, running ${live.transcribing}, cap ${cap ?? 'none'}, error ${live.error ?? 'none'}${live.failed ? ' (stopped)' : ''}, translation ${live.translationIssue ?? 'ok'}`,
        `roster (${roster.length}): ${roster.map(([id, s]) => `${id.slice(0, 8)} speaks ${s.speaks} reads ${s.reads} subs ${s.subs}${s.paused ? ' paused' : ''} cap ${s.cap ?? '-'}`).join(' | ') || 'empty'}`,
        `captions: ${live.captions.length}${last ? `, last ${last.own ? 'mine' : 'theirs'} ${last.lang}${last.translated ? ` → ${language.reads}` : ''}: "${last.display.slice(0, 60)}"` : ''}`,
      ].join('\n')}
    </pre>
  )
}

/** The row under a call that has no dock of its own (MeetingCall). */
export function CallTranslateBar() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SubtitlesToggle />
      <LanguageButton />
      <SpeakerStatus />
    </div>
  )
}

function LanguageMenu({
  container,
  align,
  onClose,
}: {
  /** The button and the menu together: a press anywhere inside is not "outside". */
  container: RefObject<HTMLDivElement | null>
  align: 'left' | 'center'
  onClose: () => void
}) {
  const { t, i18n } = useLingui()
  const { language, subs, voiceOn, translationAllowed, canPublish } = useCallCaptions()
  const site = useLanguage()
  const [pickSpeaks, setPickSpeaks] = useState(false)
  const mine = i18n._(LANG_NAME[language.reads])
  const spoken = i18n._(LANG_NAME[language.speaks])

  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) onClose()
    }
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [container, onClose])

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
      role="dialog"
      aria-label={t`Language and subtitles`}
      className={cn(
        'absolute bottom-full z-dropdown mb-2 flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-4 rounded-surface border border-ktip-sand-200 bg-ktip-cream p-4 text-ktip-sand-900 shadow-card max-sm:fixed max-sm:inset-x-4 max-sm:bottom-24 max-sm:w-auto max-sm:translate-x-0',
        align === 'center' ? 'left-1/2 -translate-x-1/2' : 'left-0'
      )}
    >
      <div className="flex flex-col gap-2">
        <span className="text-micro font-semibold uppercase tracking-wider text-ktip-sand-500">
          <Trans>Your language</Trans>
        </span>
        {/* The site's own language, the same switch as the top bar. */}
        <Segmented
          value={language.reads}
          options={UI_LANGS.map((lang) => ({ value: lang, label: ENDONYM[lang] }))}
          onChange={(next) => site.setLang(next)}
          label={t`Your language`}
          radius="sm"
        />
        <span className="text-micro text-ktip-sand-500">
          <Trans>The site's language. Changing it here changes the whole site.</Trans>
        </span>
      </div>
      <div className="flex flex-col gap-3">
        {row(
          <Trans>Subtitles</Trans>,
          t`On the video, in ${mine}`,
          <Switch
            checked={subs}
            onChange={(on) => language.setChoice(on ? 'captions' : 'off')}
            label={t`Subtitles`}
          />
        )}
        {row(
          t`Hear it in ${mine}`,
          <Trans>The speaker’s own voice drops while it plays</Trans>,
          <Switch
            checked={voiceOn}
            disabled={!translationAllowed}
            onChange={(on) => {
              if (on) primeSpeechVoice()
              language.setChoice(on ? 'voice' : 'captions')
            }}
            label={t`Hear translations`}
          />
        )}
        {row(
          <Trans>Show the original</Trans>,
          <Trans>Under each translated line</Trans>,
          <Switch checked={language.showOriginal} onChange={language.setShowOriginal} label={t`Show the original`} />
        )}
      </div>
      {canPublish && (
        <div className="flex flex-col gap-3 border-t border-ktip-sand-200 pt-3">
          {row(
            <Trans>Subtitle me for others</Trans>,
            <Trans>Runs only while someone is reading your subtitles</Trans>,
            <Switch
              checked={!language.paused}
              onChange={(on) => language.setPaused(!on)}
              label={t`Subtitle me for others`}
            />
          )}
          <div className="flex flex-col gap-2">
            <span className="text-micro text-ktip-sand-600">
              {t`You are subtitled as ${spoken}.`}{' '}
              <button
                type="button"
                aria-expanded={pickSpeaks}
                onClick={() => setPickSpeaks((open) => !open)}
                className="font-semibold text-ktip-ocean-700 underline underline-offset-2 hover:text-ktip-ocean-800"
              >
                <Trans>Speaking another language?</Trans>
              </button>
            </span>
            {pickSpeaks && (
              <Segmented
                value={language.speaks}
                options={UI_LANGS.map((lang) => ({ value: lang, label: ENDONYM[lang] }))}
                onChange={(next) => language.setSpeaks(next === language.reads ? null : next)}
                label={t`The language you are speaking`}
                radius="sm"
              />
            )}
          </div>
        </div>
      )}
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
