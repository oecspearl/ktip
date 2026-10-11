import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { announce } from '../../core/announce'
import type { A11ySettings, SetupStatus, ThemeMode } from '../../core/config'
import { applyPreset, changedKeys, NO_NEEDS } from '../../core/setup/presets'
import type { SetupRun } from '../../core/setup/flow'
import { recognitionSupported } from '../../core/speech/recognizer'
import { speechSupported } from '../../core/speech/speak'
import { AccessibilityControls, type ControlId } from '../AccessibilityControls'
import { useA11yContext, type A11yContextValue } from '../context'
import { useA11ySettings } from '../hooks'
import type { A11yMessages } from '../messages'
import { BROWSER_NAVIGATION, type JourneyStop } from '../options'

type Finish = (status: SetupStatus | 'later') => void
type Change = keyof A11ySettings | 'theme'

interface FlowProps {
  run: SetupRun
  update: (run: SetupRun) => void
  finish: Finish
}

/** What a run would set: the needs' preset over the snapshot, minus what was switched off. */
function planned(run: SetupRun, ctx: A11yContextValue): { settings: A11ySettings; theme?: ThemeMode } {
  const needs = run.needs.filter((n) => n !== NO_NEEDS)
  const { settings, theme } = applyPreset(run.snapshot.settings, needs, ctx.options.needs)
  const out = { ...settings }
  for (const k of run.declined) (out as unknown as Record<string, unknown>)[k] = run.snapshot.settings[k]
  const declinedTheme = (run.declined as Change[]).includes('theme')
  return { settings: out, theme: declinedTheme ? run.snapshot.theme : theme ?? run.snapshot.theme }
}

function applyPlan(run: SetupRun, ctx: A11yContextValue) {
  const plan = planned(run, ctx)
  ctx.store.replace({ ...plan.settings, setup: run.snapshot.settings.setup })
  if (plan.theme && ctx.theme && ctx.theme.get() !== plan.theme) ctx.theme.set(plan.theme)
}

function restoreSnapshot(run: SetupRun, ctx: A11yContextValue) {
  ctx.store.replace(run.snapshot.settings)
  if (run.snapshot.theme && ctx.theme) ctx.theme.set(run.snapshot.theme)
}

export function SetupFlow({ run, update, finish }: FlowProps) {
  if (run.stage === 'journey') return <Journey run={run} update={update} />
  return <SetupDialog run={run} update={update} finish={finish} />
}

// ---- Describing a change in words ----------------------------------------------------

const LABEL: Partial<Record<Change, keyof A11yMessages>> = {
  fontScale: 'textSize',
  font: 'font',
  spacing: 'spacing',
  contrast: 'contrast',
  pageBrightness: 'pageBrightness',
  pageContrast: 'pageContrast',
  saturation: 'saturation',
  photoBrightness: 'photoBrightness',
  underlineLinks: 'underlineLinks',
  highlightHeadings: 'highlightHeadings',
  bigTargets: 'bigTargets',
  cursor: 'largeCursor',
  focusRing: 'strongFocus',
  reduceMotion: 'reduceMotion',
  readerBar: 'readerBar',
  ttsRate: 'readingSpeed',
  shortcuts: 'shortcuts',
  focusOnNavigate: 'focusOnNavigate',
  voiceNav: 'voiceNav',
  voiceMode: 'voiceMode',
  captions: 'captionsLabel',
  theme: 'theme',
}

function describe(key: Change, value: unknown, m: A11yMessages, fonts: { id: string; label: string }[]): string {
  const pct = (v: number) => `${Math.round(v * 100)}%`
  switch (key) {
    case 'fontScale':
    case 'pageBrightness':
    case 'pageContrast':
    case 'saturation':
    case 'photoBrightness':
      return pct(value as number)
    case 'ttsRate':
      return `${value}×`
    case 'font':
      return value === 'default' ? m.fontDefault : fonts.find((f) => f.id === value)?.label ?? String(value)
    case 'spacing':
      return [m.spacingNormal, m.spacingWider, m.spacingWidest][value as number] ?? String(value)
    case 'contrast':
      return { auto: m.contrastAuto, standard: m.contrastStandard, more: m.contrastMore }[value as string] ?? String(value)
    case 'shortcuts':
      return { off: m.shortcutsOff, modifier: m.shortcutsModifier, all: m.shortcutsAll }[value as string] ?? String(value)
    case 'voiceMode':
      return value === 'continuous' ? m.voiceModeContinuous : m.voiceModePush
    case 'theme':
      return value === 'dark' ? m.themeDark : m.themeLight
    case 'cursor':
      return value === 'large' ? m.on : m.off
    case 'focusRing':
      return value === 'strong' ? m.on : m.off
    case 'captions':
      return value === 'on' ? m.on : m.off
    default:
      return value ? m.on : m.off
  }
}

function useChanges(before: A11ySettings, beforeTheme: ThemeMode | undefined, after: A11ySettings, afterTheme: ThemeMode | undefined) {
  const { messages: m, store } = useA11yContext()
  const keys: Change[] = changedKeys(before, after)
  if (afterTheme && beforeTheme && afterTheme !== beforeTheme) keys.push('theme')
  return keys
    .filter((k) => LABEL[k])
    .map((k) => {
      const label = m[LABEL[k]!] as string
      const from = describe(k, k === 'theme' ? beforeTheme : before[k as keyof A11ySettings], m, store.config.fonts)
      const to = describe(k, k === 'theme' ? afterTheme : after[k as keyof A11ySettings], m, store.config.fonts)
      return { key: k, text: m.changeFromTo(label, from, to) }
    })
}

// ---- The modal stages ------------------------------------------------------------------

function SetupDialog({ run, update, finish }: FlowProps) {
  const ctx = useA11yContext()
  const { messages: m } = ctx
  const ref = useRef<HTMLDialogElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const titleId = useId()
  const runRef = useRef(run)
  runRef.current = run

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (typeof d.showModal === 'function' && !d.open) d.showModal()
    else d.setAttribute('open', '')
    // Escape means "not now" before anything is decided, and nothing at the
    // review, where a choice has to be made
    const onCancel = (e: Event) => {
      e.preventDefault()
      // (finish restores the snapshot itself)
      if (runRef.current.stage !== 'review') finish('later')
    }
    d.addEventListener('cancel', onCancel)
    return () => d.removeEventListener('cancel', onCancel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Each stage starts at its heading, so a screen reader hears where it is
  useEffect(() => {
    headingRef.current?.focus()
  }, [run.stage])

  const go = (patch: Partial<SetupRun>) => update({ ...run, ...patch })

  let title = m.setupTitle
  let body: ReactNode = null
  if (run.stage === 'intro') {
    body = (
      <>
        <p className="ak-dialog-text">{m.setupIntro}</p>
        <p className="ak-hint">{m.setupPrivacy}</p>
        <div className="ak-dialog-actions ak-dialog-actions-split">
          <button type="button" className="ak-link-btn" onClick={() => finish('skipped')}>
            {m.setupSkip}
          </button>
          <span className="ak-dialog-actions">
            <button type="button" className="ak-btn" onClick={() => finish('later')}>
              {m.setupLater}
            </button>
            <button type="button" className="ak-btn ak-btn-primary" onClick={() => go({ stage: 'needs' })}>
              {m.setupStart}
            </button>
          </span>
        </div>
      </>
    )
  } else if (run.stage === 'needs') {
    title = m.needsTitle
    body = <Needs run={run} go={go} />
  } else if (run.stage === 'preview') {
    title = m.previewTitle
    body = <Preview run={run} go={go} finish={finish} />
  } else if (run.stage === 'review') {
    title = m.reviewTitle
    body = <Review run={run} finish={finish} />
  }

  return (
    <dialog ref={ref} className="ak-dialog ak-setup" aria-labelledby={titleId}>
      <div className="ak-panel-head">
        <h2 className="ak-panel-title" id={titleId} ref={headingRef} tabIndex={-1}>
          {title}
        </h2>
      </div>
      <div className="ak-panel-body ak-dialog-body">{body}</div>
    </dialog>
  )
}

const NEED_TEXT: Record<string, [keyof A11yMessages, keyof A11yMessages]> = {
  lowVision: ['needLowVision', 'needLowVisionHint'],
  screenReader: ['needScreenReader', 'needScreenReaderHint'],
  lightSensitive: ['needLightSensitive', 'needLightSensitiveHint'],
  colourVision: ['needColourVision', 'needColourVisionHint'],
  dyslexia: ['needDyslexia', 'needDyslexiaHint'],
  motor: ['needMotor', 'needMotorHint'],
  hearing: ['needHearing', 'needHearingHint'],
  cognitive: ['needCognitive', 'needCognitiveHint'],
  motionSensitive: ['needMotionSensitive', 'needMotionSensitiveHint'],
}

function Needs({ run, go }: { run: SetupRun; go: (p: Partial<SetupRun>) => void }) {
  const ctx = useA11yContext()
  const { messages: m, options } = ctx
  const [chosen, setChosen] = useState<string[]>(run.needs)
  const toggle = (id: string, on: boolean) => {
    if (id === NO_NEEDS) return setChosen(on ? [NO_NEEDS] : [])
    setChosen((c) => (on ? [...c.filter((x) => x !== NO_NEEDS), id] : c.filter((x) => x !== id)))
  }
  const items = [
    ...options.needs.filter((n) => NEED_TEXT[n.id]).map((n) => ({ id: n.id, text: NEED_TEXT[n.id] })),
    { id: NO_NEEDS, text: ['needNone', 'needNoneHint'] as [keyof A11yMessages, keyof A11yMessages] },
  ]
  return (
    <>
      <fieldset className="ak-needs">
        <legend className="ak-hint">{m.needsLegend}</legend>
        {items.map(({ id, text: [label, hint] }) => (
          <label key={id} className="ak-need" data-checked={chosen.includes(id) || undefined}>
            <input type="checkbox" checked={chosen.includes(id)} onChange={(e) => toggle(id, e.target.checked)} />
            <span>
              <span className="ak-row-label">{m[label] as string}</span>
              <span className="ak-hint">{m[hint] as string}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="ak-dialog-actions">
        <button type="button" className="ak-btn" onClick={() => go({ stage: 'intro', needs: chosen })}>
          {m.back}
        </button>
        <button
          type="button"
          className="ak-btn ak-btn-primary"
          onClick={() => {
            const next: SetupRun = {
              ...run,
              stage: 'preview',
              needs: chosen,
              declined: [],
              textTour: applyPreset(run.snapshot.settings, chosen, options.needs).textTour,
            }
            applyPlan(next, ctx)
            go(next)
          }}
        >
          {m.next}
        </button>
      </div>
    </>
  )
}

function Preview({ run, go, finish }: { run: SetupRun; go: (p: Partial<SetupRun>) => void; finish: Finish }) {
  const ctx = useA11yContext()
  const { messages: m, options } = ctx
  // Every change the needs asked for, declined ones included, so each can be switched back on
  const full = planned({ ...run, declined: [] }, ctx)
  const changes = useChanges(run.snapshot.settings, run.snapshot.theme, full.settings, full.theme)

  const setDeclined = (key: Change, declined: boolean) => {
    const next = {
      ...run,
      declined: (declined ? [...run.declined, key] : run.declined.filter((k) => k !== key)) as SetupRun['declined'],
    }
    applyPlan(next, ctx)
    go(next)
  }

  return (
    <>
      <p className="ak-dialog-text">{changes.length ? m.previewIntro : m.previewNothing}</p>
      {changes.length > 0 && (
        <ul className="ak-changes">
          {changes.map((c) => {
            const on = !(run.declined as Change[]).includes(c.key)
            return (
              <li key={c.key}>
                <label className="ak-row">
                  <span className="ak-row-label">{c.text}</span>
                  <button
                    type="button"
                    role="switch"
                    className="ak-switch"
                    aria-checked={on}
                    aria-label={c.text}
                    onClick={() => setDeclined(c.key, on)}
                  />
                </label>
              </li>
            )
          })}
        </ul>
      )}
      <div className="ak-dialog-actions">
        <button
          type="button"
          className="ak-btn"
          onClick={() => {
            restoreSnapshot(run, ctx)
            go({ stage: 'needs' })
          }}
        >
          {m.back}
        </button>
        <button type="button" className="ak-btn" onClick={() => finish('kept')}>
          {m.keepNoTour}
        </button>
        <button
          type="button"
          className="ak-btn ak-btn-primary"
          onClick={() => go({ stage: options.journey.length ? 'journey' : 'review', stop: 0 })}
        >
          {m.tourStart}
        </button>
      </div>
    </>
  )
}

function Review({ run, finish }: { run: SetupRun; finish: Finish }) {
  const { messages: m, store, theme } = useA11yContext()
  const now = useA11ySettings(store)
  const t = theme ?? { get: () => undefined, subscribe: () => () => {} }
  const themeNow = useSyncExternalStore(t.subscribe, t.get as () => ThemeMode | undefined, t.get as () => ThemeMode | undefined)
  const changes = useChanges(run.snapshot.settings, run.snapshot.theme, now, themeNow)
  const [adjusting, setAdjusting] = useState(false)

  const done = (status: SetupStatus) => {
    finish(status)
    announce(status === 'reverted' ? m.setupReverted : m.setupDone)
  }

  return (
    <>
      {adjusting ? (
        <AccessibilityControls variant="panel" />
      ) : (
        <>
          <p className="ak-dialog-text">{changes.length ? m.reviewIntro : m.reviewNoChange}</p>
          {changes.length > 0 && (
            <ul className="ak-changes ak-changes-plain">
              {changes.map((c) => (
                <li key={c.key}>{c.text}</li>
              ))}
            </ul>
          )}
        </>
      )}
      <div className="ak-dialog-actions">
        <button type="button" className="ak-btn" onClick={() => done('reverted')}>
          {m.revert}
        </button>
        {!adjusting && (
          <button type="button" className="ak-btn" onClick={() => setAdjusting(true)}>
            {m.adjust}
          </button>
        )}
        <button type="button" className="ak-btn ak-btn-primary" onClick={() => done('kept')}>
          {m.keep}
        </button>
      </div>
    </>
  )
}

// ---- The walkthrough --------------------------------------------------------------------

function usableStops(stops: JourneyStop[]): JourneyStop[] {
  return stops.filter((s) => {
    // A stop about voice or speech, on a browser that has neither, would only show what is missing
    if (s.tryIt?.length && s.tryIt.every((c) => c === 'voiceNav' || c === 'voiceMode')) return recognitionSupported()
    if (s.tryIt?.length && s.tryIt.every((c) => c === 'readerBar' || c === 'ttsRate')) return speechSupported()
    return true
  })
}

/**
 * The tour across real pages. Not modal, on purpose: the point is to read
 * and click the real page with the new settings. A ring marks the stop's
 * target, with no dimming scrim, so brightness and contrast are judged on
 * the page as it really is.
 */
function Journey({ run, update }: { run: SetupRun; update: (run: SetupRun) => void }) {
  const { messages: m, options } = useA11yContext()
  const nav = options.navigation ?? BROWSER_NAVIGATION
  const path = useSyncExternalStore(nav.location.subscribe, nav.location.get, nav.location.get)
  const stops = usableStops(options.journey)
  const index = Math.min(run.stop, Math.max(stops.length - 1, 0))
  const stop = stops[index]
  const [minimised, setMinimised] = useState(false)
  const [target, setTarget] = useState<HTMLElement | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const titleId = useId()
  const onPath = !stop || path.split(/[?#]/)[0] === stop.path.split(/[?#]/)[0]

  const goStop = useCallback(
    (i: number) => {
      if (i >= stops.length) return update({ ...run, stage: 'review' })
      update({ ...run, stop: Math.max(0, i) })
    },
    [run, stops.length, update]
  )

  // Arrive: go to the stop's page, then find its target once the page has drawn
  useEffect(() => {
    if (!stop) return
    if (!onPath) nav.navigate(stop.path)
    // Only on arriving at a stop, not on every wander
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stop?.id])

  useEffect(() => {
    setTarget(null)
    if (!stop || !onPath) return
    const t = setTimeout(() => {
      const el = stop.target ? document.querySelector<HTMLElement>(stop.target) : null
      setTarget(el)
      el?.scrollIntoView?.({ block: 'center', behavior: 'auto' })
      headingRef.current?.focus()
      announce(`${m.journeyStep(index + 1, stops.length)}. ${stop.title}`)
    }, 700)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stop?.id, onPath])

  if (!stop) return null

  if (minimised) {
    return (
      <div className="ak-journey ak-journey-min" data-a11y-voice-ui>
        <button type="button" className="ak-btn ak-btn-primary" onClick={() => setMinimised(false)}>
          {m.journeyResume} · {index + 1}/{stops.length}
        </button>
      </div>
    )
  }

  const last = index === stops.length - 1
  return (
    <>
      {target && !run.textTour && <Spotlight el={target} />}
      <section className="ak-journey" aria-labelledby={titleId} data-a11y-voice-ui>
        <p className="ak-journey-step">{m.journeyStep(index + 1, stops.length)}</p>
        <h2 className="ak-journey-title" id={titleId} ref={headingRef} tabIndex={-1}>
          {stop.title}
        </h2>
        <p className="ak-dialog-text">{stop.body}</p>
        {!onPath && (
          <p className="ak-note">
            {m.journeyOff}{' '}
            <button type="button" className="ak-link-btn" onClick={() => nav.navigate(stop.path)}>
              {m.journeyReturn}
            </button>
          </p>
        )}
        {stop.tryIt && stop.tryIt.length > 0 && (
          <div className="ak-journey-try">
            <p className="ak-section-title">{m.journeyTry}</p>
            <AccessibilityControls variant="compact" only={stop.tryIt as ControlId[]} />
          </div>
        )}
        <div className="ak-dialog-actions ak-dialog-actions-split">
          <span className="ak-dialog-actions">
            <button type="button" className="ak-link-btn" onClick={() => update({ ...run, stage: 'review' })}>
              {m.journeyExit}
            </button>
            <button type="button" className="ak-link-btn" onClick={() => setMinimised(true)}>
              {m.journeyMinimise}
            </button>
          </span>
          <span className="ak-dialog-actions">
            {index > 0 && (
              <button type="button" className="ak-btn" onClick={() => goStop(index - 1)}>
                {m.back}
              </button>
            )}
            <button type="button" className="ak-btn ak-btn-primary" onClick={() => goStop(index + 1)}>
              {last ? m.journeyFinish : m.journeyNext}
            </button>
          </span>
        </div>
      </section>
    </>
  )
}

/** A ring around the target that follows it as the page scrolls. */
function Spotlight({ el }: { el: HTMLElement }) {
  const [box, setBox] = useState<DOMRect | null>(null)
  useLayoutEffect(() => {
    let frame = 0
    const measure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setBox(el.isConnected ? el.getBoundingClientRect() : null))
    }
    measure()
    window.addEventListener('scroll', measure, { passive: true, capture: true })
    window.addEventListener('resize', measure)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', measure, { capture: true })
      window.removeEventListener('resize', measure)
    }
  }, [el])
  if (!box) return null
  const pad = 6
  return (
    <div
      className="ak-spotlight"
      aria-hidden="true"
      style={{ top: box.top - pad, left: box.left - pad, width: box.width + pad * 2, height: box.height + pad * 2 }}
    />
  )
}
