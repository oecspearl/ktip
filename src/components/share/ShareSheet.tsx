import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronLeft, Link2, RefreshCw, Share2, X as CloseIcon } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { useToast } from '../../contexts/ToastContext'
import { useIsMobile } from '../../hooks/useMediaQuery'
import { cn } from '../../lib/utils'
import { X_LIMIT, shareHref, taggedUrl, xLength } from '../../lib/share/platforms'
import { unmatchedIn } from '../../lib/share/fact-check'
import { DraftError, requestShareDrafts, type DraftFailure } from '../../lib/share/draft-client'
import { DRAFT_ANGLES, type DraftAngle, type DraftLang } from '../../lib/share/draft-prompt'
import type { ShareTarget } from '../../lib/share/targets'
import { SharePreview } from './SharePreview'
import { canNativeShare, useShareApps, type ShareApp, type ShareAppId } from './share-apps'

/**
 * The share panel: slides in from the right over a blurred page, half the
 * width of a wide screen and all of a phone's.
 *
 * Step 1, pick the apps (one tap each), or copy just the link. Step 2, one
 * app at a time: a preview of the post in that app with the message typed
 * into it, a toggle for the app and one for the writing style, and a Share
 * button in the app's colour that moves on to the next app once used.
 *
 * Every message opens as the correct one built from the page (src/lib/share/
 * targets.ts). On step 2 the panel asks api/share.ts once for all three styles
 * for every picked app. The reply streams, so messages land one at a time,
 * the app on screen first, and each style is usable as soon as it arrives.
 * Regenerate rewrites only the app and style on screen. Every number in an AI message, and in the member's
 * edits of it, is checked against the item's record and flagged when it isn't
 * there.
 */

/** Matches the slide's duration-300; the panel unmounts once it has slid out. */
const SLIDE_MS = 300

/**
 * One step above the floating help button (z-fab) so it can't sit on the
 * Share button in the panel's bottom corner, and still under the toasts
 * (z-toast), so "Message copied" shows over the panel. No token sits between.
 */
const LAYER = { zIndex: 'calc(var(--z-index-fab) + 1)' }

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Older WebViews refuse the async clipboard; a selected textarea still copies.
    try {
      const el = document.createElement('textarea')
      el.value = text
      el.setAttribute('readonly', '')
      el.style.position = 'fixed'
      el.style.opacity = '0'
      document.body.appendChild(el)
      el.select()
      const ok = document.execCommand('copy')
      el.remove()
      return ok
    } catch {
      return false
    }
  }
}

const toDraftLang = (locale: string): DraftLang => (locale === 'fr' || locale === 'es' ? locale : 'en')
const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

type Texts = Record<DraftAngle, string>
const fill = (text: string): Texts => Object.fromEntries(DRAFT_ANGLES.map((a) => [a, text])) as Texts

export function ShareSheet({ target, onClose }: { target: ShareTarget; onClose: () => void }) {
  const { t, i18n } = useLingui()
  const toast = useToast()
  const isMobile = useIsMobile()
  const apps = useShareApps()
  const appById = Object.fromEntries(apps.map((a) => [a.id, a])) as Record<ShareAppId, ShareApp>

  const panelRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const requests = useRef(new Set<AbortController>())
  const closingRef = useRef(false)

  const [shown, setShown] = useState(false)
  const [step, setStep] = useState<1 | 2>(1)
  const [selected, setSelected] = useState<ShareAppId[]>(['whatsapp'])
  const [active, setActive] = useState<ShareAppId>('whatsapp')
  const [lang, setLang] = useState<DraftLang>(toDraftLang(i18n.locale))
  const [texts, setTexts] = useState<Partial<Record<ShareAppId, Texts>>>({})
  const [aiMade, setAiMade] = useState<Partial<Record<ShareAppId, boolean>>>({})
  const [angleFor, setAngleFor] = useState<Partial<Record<ShareAppId, DraftAngle>>>({})
  const [writing, setWriting] = useState<Partial<Record<ShareAppId, DraftAngle[]>>>({})
  const [shared, setShared] = useState<Partial<Record<ShareAppId, boolean>>>({})
  const [finished, setFinished] = useState(false)
  const [allowed, setAllowed] = useState<string[]>([])
  const [failure, setFailure] = useState<DraftFailure | null>(null)

  const host = new URL(target.url).host
  const app = appById[active] ?? apps[0]
  const appName = app.name
  const angle = angleFor[active] ?? 'detail'
  const text = texts[active]?.[angle] ?? target.message
  const busy = writing[active]
  /** The message on screen is still being written. */
  const pending = !!busy?.includes(angle)
  const isAi = !!aiMade[active]
  const unmatched = isAi ? unmatchedIn(text, allowed) : []
  // Nothing more to ask for: logged out, or the item went private since the page loaded.
  const aiOff = failure === 'signed_out' || failure === 'not_shareable'

  // ---- slide in, slide out ------------------------------------------------
  useEffect(() => {
    // Mount off-screen, then slide on the next frame so the transition runs.
    const frame = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  const abortAll = () => {
    requests.current.forEach((c) => c.abort())
    requests.current.clear()
  }

  const close = useCallback(() => {
    if (closingRef.current) return
    closingRef.current = true
    requests.current.forEach((c) => c.abort())
    setShown(false)
    window.setTimeout(onClose, reducedMotion() ? 0 : SLIDE_MS)
  }, [onClose])

  // ---- scroll lock, focus, Escape, focus trap -----------------------------
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()
    const pending = requests.current
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
        return
      }
      if (e.key !== 'Tab' || !panelRef.current) return
      const items = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), textarea, select, a[href], [tabindex]:not([tabindex="-1"])'
      )
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      document.removeEventListener('keydown', onKey)
      pending.forEach((c) => c.abort())
    }
  }, [close])

  // A new step replaces the panel's content; put keyboard focus at its top.
  const firstStep = useRef(true)
  useEffect(() => {
    if (firstStep.current) {
      firstStep.current = false
      return
    }
    titleRef.current?.focus()
  }, [step])

  // ---- AI messages ----------------------------------------------------------
  /**
   * Writes every style for `ids` in one streamed request, or with `only`,
   * just that style for one app (Regenerate). Messages land one by one, in the
   * order of `ids`, so callers put the app on screen first; each style's
   * spinner stops as its message arrives. Apps that share a style rule (email
   * and the phone's menu) share one set of takes.
   */
  const write = async (ids: ShareAppId[], lng: DraftLang, only?: { angle: DraftAngle; avoid: string }) => {
    if (aiOff || ids.length === 0) return
    const angles = only ? [only.angle] : [...DRAFT_ANGLES]
    const ctl = new AbortController()
    requests.current.add(ctl)
    setWriting((w) => ({ ...w, ...Object.fromEntries(ids.map((id) => [id, angles])) }))
    setFailure(null)

    const settle = (done: ShareAppId[], angle?: DraftAngle) =>
      setWriting((w) => {
        const next = { ...w }
        for (const id of done) {
          const left = angle ? (next[id] ?? []).filter((x) => x !== angle) : []
          if (left.length) next[id] = left
          else delete next[id]
        }
        return next
      })

    try {
      const platforms = [...new Set(ids.map((id) => appById[id].draft))]
      await requestShareDrafts(
        { kind: target.kind, id: target.id, platforms, lang: lng, ...(only ?? {}) },
        {
          onAllowed: setAllowed,
          onTake: (take) => {
            if (ctl.signal.aborted) return
            const hit = ids.filter((id) => appById[id].draft === take.platform)
            setTexts((prev) => {
              const next = { ...prev }
              for (const id of hit) next[id] = { ...(next[id] ?? fill(target.message)), [take.angle]: take.text }
              return next
            })
            setAiMade((m) => ({ ...m, ...Object.fromEntries(hit.map((id) => [id, true])) }))
            settle(hit, take.angle)
          },
        },
        ctl.signal
      )
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return
      setFailure(err instanceof DraftError ? err.reason : 'unavailable')
    } finally {
      requests.current.delete(ctl)
      // Anything the stream never delivered stops spinning and keeps the page's message.
      if (!ctl.signal.aborted) settle(ids)
    }
  }

  /** The app on screen goes first, so its messages are the first to arrive. */
  const screenFirst = (ids: ShareAppId[], onScreen: ShareAppId) =>
    ids.includes(onScreen) ? [onScreen, ...ids.filter((id) => id !== onScreen)] : ids

  const setText = (value: string) =>
    setTexts((prev) => ({ ...prev, [active]: { ...(prev[active] ?? fill(target.message)), [angle]: value } }))

  // ---- steps -------------------------------------------------------------
  const togglePick = (id: ShareAppId) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  const toStepTwo = () => {
    const ordered = apps.map((a) => a.id).filter((id) => selected.includes(id))
    if (!ordered.length) return
    setSelected(ordered)
    setFinished(false)
    const onScreen = ordered.includes(active) ? active : ordered[0]
    setActive(onScreen)
    setStep(2)
    write(
      screenFirst(
        ordered.filter((id) => !aiMade[id] && !writing[id]),
        onScreen
      ),
      lang
    )
  }

  const changeLang = (next: DraftLang) => {
    setLang(next)
    abortAll()
    setWriting({})
    setAiMade({})
    setTexts({})
    write(screenFirst(selected, active), next)
  }

  // ---- sharing -------------------------------------------------------------
  const copyLink = async () => {
    if (await copyText(taggedUrl(target.url, 'copy', i18n.locale))) toast.success(t`Link copied`)
    else toast.error(t`Couldn't copy the link. Select it in the address bar instead.`)
  }

  const shareNow = async () => {
    const id = active
    const url = taggedUrl(target.url, id, i18n.locale)
    const message = text.trim()
    const withLink = message ? `${message}\n\n${url}` : url

    if (id === 'x' && xLength(message) > X_LIMIT) {
      const over = xLength(message) - X_LIMIT
      toast.warning(t`Too long for X by ${over} characters. Shorten the message first.`)
      return
    }
    if (id === 'native') {
      navigator.share({ title: target.title, text: message, url }).catch(() => {})
    } else if (id === 'instagram') {
      if (isMobile && canNativeShare()) {
        navigator.share({ text: withLink }).catch(() => {})
      } else if (await copyText(withLink)) {
        toast.info(t`Caption and link copied. Paste them into your Instagram story or post.`)
      } else {
        toast.error(t`Couldn't copy the caption. Select it in the preview and copy it yourself.`)
        return
      }
    } else {
      const href = shareHref(id, { url, message, title: target.title })
      if (!href) return
      // Copy before opening: some browsers only allow the clipboard while the tap is still fresh.
      if ((id === 'linkedin' || id === 'facebook') && message) {
        copyText(message).then((ok) => {
          if (ok) toast.info(t`Message copied. Paste it into ${appName} above the link.`)
        })
      }
      if (id === 'email') window.location.href = href
      else window.open(href, '_blank', 'noopener,noreferrer')
    }

    const nowShared = { ...shared, [id]: true }
    setShared(nowShared)
    const next = selected.find((s) => !nowShared[s])
    if (next) setActive(next)
    else setFinished(true)
  }

  // ---- copy ---------------------------------------------------------------
  const heading = {
    event: t`Share this event`,
    grant: t`Share this funding call`,
    project: t`Share this project`,
    org: t`Share this business`,
  }[target.kind]

  const kindLabel = {
    event: t`Event`,
    grant: t`Funding`,
    project: t`Project`,
    org: t`Business`,
  }[target.kind]

  const angleLabel: Record<DraftAngle, string> = {
    detail: t`The detail`,
    'for-you': t`Who it's for`,
    question: t`The question`,
  }

  const failureText: Record<DraftFailure, string> = {
    signed_out: t`Log in to get AI-written messages. This one is built from the page.`,
    rate_limited: t`That's a lot of drafts in a row. Try again in a few minutes.`,
    not_shareable: t`This page isn't public yet, so there's nothing to write about.`,
    unavailable: t`AI writing isn't working right now. You can still edit and share the message.`,
  }

  const allDone = finished && selected.every((s) => shared[s])
  const iconsOnly = selected.length > 3
  const label = 'text-xs font-bold uppercase tracking-wider text-ktip-sand-600'
  const seg = 'relative flex gap-1 overflow-x-auto rounded-2xl bg-ktip-sand-100 p-1'
  const segButton =
    'flex min-h-11 flex-1 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3 text-sm font-bold text-ktip-sand-600 transition-colors ' +
    'aria-pressed:bg-ktip-cream aria-pressed:text-ktip-sand-900 aria-pressed:shadow-soft aria-selected:bg-ktip-cream aria-selected:text-ktip-sand-900 aria-selected:shadow-soft ' +
    'enabled:hover:text-ktip-sand-900 disabled:cursor-default'
  const listFormat = new Intl.ListFormat(i18n.locale === 'pseudo' ? 'en' : i18n.locale, { type: 'conjunction' })
  const sentTo = listFormat.format(selected.map((s) => appById[s].name))
  const appCount = selected.length
  const missing = unmatched.join(', ')

  // ---- pieces --------------------------------------------------------------
  const stepper = (
    <ol
      aria-label={t`Progress`}
      className="grid shrink-0 grid-cols-[auto_minmax(1.5rem,1fr)_auto] items-center gap-3 border-b border-ktip-sand-200 px-5 pb-4 pt-2 sm:px-6"
    >
      <li className="min-w-0">
        {step === 2 ? (
          <button
            type="button"
            onClick={() => setStep(1)}
            aria-label={t`Step 1, choose apps. Go back`}
            className="group -m-1 flex min-w-0 items-center gap-2.5 rounded-xl p-1 text-left"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ktip-tropical-500 text-ktip-ocean-700 transition-shadow group-hover:ring-4 group-hover:ring-ktip-tropical-500/25">
              <Check className="size-4" strokeWidth={3} aria-hidden="true" />
            </span>
            <StepLabel n={1} text={t`Choose apps`} on />
          </button>
        ) : (
          <span aria-current="step" className="flex min-w-0 items-center gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ktip-ocean-700 text-sm font-extrabold text-white dark:bg-ktip-ocean-500">
              1
            </span>
            <StepLabel n={1} text={t`Choose apps`} on />
          </span>
        )}
      </li>
      <li aria-hidden="true" className="relative h-0.5 overflow-hidden rounded-full bg-ktip-sand-200">
        <span
          className={cn(
            'absolute inset-0 origin-left bg-ktip-tropical-500 transition-transform duration-300 motion-reduce:transition-none',
            step === 2 ? 'scale-x-100' : 'scale-x-0'
          )}
        />
      </li>
      <li className="min-w-0">
        <span aria-current={step === 2 ? 'step' : undefined} className="flex min-w-0 items-center gap-2.5">
          <span
            className={cn(
              'grid size-8 shrink-0 place-items-center rounded-full border-2 text-sm font-extrabold transition-colors',
              step === 2
                ? 'border-ktip-ocean-700 bg-ktip-ocean-700 text-white dark:border-ktip-ocean-500 dark:bg-ktip-ocean-500'
                : 'border-ktip-sand-200 text-ktip-sand-500'
            )}
          >
            2
          </span>
          <StepLabel n={2} text={t`Review and share`} on={step === 2} />
        </span>
      </li>
    </ol>
  )

  const stepOne = (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
        <p className="text-sm text-ktip-sand-600">
          <Trans>Where do you want to share it? Pick one or more.</Trans>
        </p>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,7rem),1fr))] gap-2.5">
          {apps.map((a) => {
            const on = selected.includes(a.id)
            return (
              <button
                key={a.id}
                type="button"
                aria-pressed={on}
                onClick={() => togglePick(a.id)}
                className={cn(
                  'relative flex min-w-0 flex-col items-center gap-2 rounded-2xl border-2 bg-white px-2 pb-3 pt-4 transition-colors dark:bg-ktip-sand-50',
                  on ? 'border-ktip-ocean-700 dark:border-ktip-ocean-500' : 'border-ktip-sand-200 hover:border-ktip-sand-300'
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute right-2 top-2 grid size-5 place-items-center rounded-full border-2',
                    on
                      ? 'border-ktip-ocean-700 bg-ktip-ocean-700 text-white dark:border-ktip-ocean-500 dark:bg-ktip-ocean-500'
                      : 'border-ktip-sand-200 text-transparent'
                  )}
                >
                  <Check className="size-3" strokeWidth={3} />
                </span>
                <span className={cn('grid size-11 place-items-center rounded-full', a.tone)}>{a.icon}</span>
                <span className="w-full truncate text-center text-sm font-semibold text-ktip-sand-900">{a.name}</span>
              </button>
            )
          })}
        </div>

        <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
          <span aria-hidden="true" className="h-px bg-ktip-sand-200" />
          <span className={label}>
            <Trans>Or just the link</Trans>
          </span>
          <span aria-hidden="true" className="h-px bg-ktip-sand-200" />
        </div>
        <div className="@container rounded-2xl border border-ktip-sand-200 bg-white p-2.5 dark:bg-ktip-sand-50">
          <div className="grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-3.5 @md:grid-cols-[clamp(6rem,28%,9.5rem)_minmax(0,1fr)_auto]">
            <div className="aspect-[1.91/1] overflow-hidden rounded-lg bg-ktip-ocean-700">
              {target.image ? (
                <img src={target.image} alt="" className="size-full object-cover" loading="lazy" />
              ) : (
                <span className="flex size-full items-end bg-gradient-to-br from-ktip-ocean-800 to-ktip-ocean-600 p-2 text-micro font-bold leading-tight text-white">
                  KTIP
                </span>
              )}
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-micro font-bold uppercase tracking-wide text-ktip-sand-500">{host}</span>
              <span className="break-words text-sm font-bold text-ktip-sand-900">{target.title}</span>
              <span className="truncate text-micro text-ktip-sand-500">{target.url}</span>
            </div>
            <button
              type="button"
              onClick={copyLink}
              className="col-span-2 flex min-h-11 items-center justify-center gap-2 rounded-xl border border-ktip-sand-200 px-4 text-sm font-bold text-ktip-sand-900 hover:bg-ktip-sand-100 @md:col-span-1"
            >
              <Link2 className="size-4" aria-hidden="true" />
              <Trans>Copy link</Trans>
            </button>
          </div>
        </div>
        <p className="-mt-2 text-sm text-ktip-sand-600">
          <Trans>Copies the link on its own, with no message.</Trans>
        </p>
      </div>
      <div className="shrink-0 border-t border-ktip-sand-200 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:px-6">
        <button
          type="button"
          onClick={toStepTwo}
          disabled={!selected.length}
          className="btn-brand flex min-h-12 w-full items-center justify-center rounded-xl px-4 text-base font-bold disabled:opacity-50"
        >
          {selected.length > 1 ? <Trans>Continue with {appCount} apps</Trans> : <Trans>Continue</Trans>}
        </button>
      </div>
    </>
  )

  const appToggle =
    selected.length > 1 ? (
      <div className="flex min-w-0 flex-col gap-1.5">
        <span id="share-seg-app" className={label}>
          <Trans>App</Trans>
        </span>
        <div role="tablist" aria-labelledby="share-seg-app" className={seg}>
          {selected.map((id) => {
            const a = appById[id]
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={id === active}
                onClick={() => setActive(id)}
                title={a.name}
                className={cn(segButton, iconsOnly && 'px-2.5')}
              >
                <span className={cn('grid size-6 shrink-0 place-items-center rounded-full [&_svg]:size-3.5', a.tone)}>{a.icon}</span>
                <span className={cn(iconsOnly && 'sr-only')}>{a.name}</span>
                {shared[id] && <Check className="size-4 text-ktip-tropical-700" strokeWidth={3} aria-label={t`Shared`} />}
              </button>
            )
          })}
        </div>
      </div>
    ) : null

  const styleToggle = (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span id="share-seg-style" className={label}>
        <Trans>Style</Trans>
      </span>
      <div role="group" aria-labelledby="share-seg-style" aria-busy={!!busy} className={seg}>
        {DRAFT_ANGLES.map((a) => {
          const loading = !!busy?.includes(a)
          return (
            <button
              key={a}
              type="button"
              aria-pressed={angle === a}
              disabled={!isAi || loading}
              onClick={() => setAngleFor((m) => ({ ...m, [active]: a }))}
              className={cn(segButton, 'disabled:opacity-50', loading && 'disabled:text-ktip-sand-900 disabled:opacity-100')}
            >
              {loading && (
                <span
                  aria-hidden="true"
                  className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-pulse"
                />
              )}
              {angleLabel[a]}
            </button>
          )
        })}
        {busy && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-3 bottom-0.5 h-0.5 rounded-full bg-ktip-tropical-500 motion-safe:animate-pulse"
          />
        )}
      </div>
      <span role="status" className="sr-only">
        {busy ? (busy.length > 1 ? t`Writing all three styles` : t`Writing a new take`) : ''}
      </span>
    </div>
  )

  const xCount = xLength(text)
  const stepTwo = (
    <>
      <div className="@container flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
        {allDone ? (
          <div className="flex flex-col items-center gap-2 px-2 py-8 text-center">
            <span className="grid size-14 place-items-center rounded-full bg-ktip-tropical-500 text-ktip-ocean-700">
              <Check className="size-7" strokeWidth={3} aria-hidden="true" />
            </span>
            <h3 className="font-display text-2xl font-bold">
              <Trans>Shared</Trans>
            </h3>
            <p className="text-sm text-ktip-sand-600">
              <Trans>Sent to {sentTo}.</Trans>
            </p>
            <button
              type="button"
              onClick={() => setStep(1)}
              className="mt-1 min-h-11 text-sm font-bold text-ktip-sand-700 underline underline-offset-4"
            >
              <Trans>Share somewhere else</Trans>
            </button>
          </div>
        ) : (
          <>
            <div
              className={cn(
                'grid gap-4',
                appToggle && '@xl:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] @xl:gap-5'
              )}
            >
              {appToggle}
              {appToggle && <span aria-hidden="true" className="hidden bg-ktip-sand-200 @xl:block" />}
              {styleToggle}
            </div>

            <SharePreview
              app={app}
              target={target}
              host={host}
              kindLabel={kindLabel}
              text={text}
              onText={setText}
              writing={pending}
            />

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => write([active], lang, { angle, avoid: text })}
                disabled={!!busy || aiOff}
                className="flex min-h-11 items-center gap-2 rounded-xl border border-ktip-sand-200 px-3.5 text-sm font-bold text-ktip-sand-900 hover:bg-ktip-sand-100 disabled:opacity-50"
              >
                <RefreshCw className={cn('size-4', busy && 'motion-safe:animate-spin')} aria-hidden="true" />
                <Trans>Regenerate</Trans>
              </button>
              <label className="sr-only" htmlFor="share-lang">
                <Trans>Language of the message</Trans>
              </label>
              <select
                id="share-lang"
                value={lang}
                onChange={(e) => changeLang(e.target.value as DraftLang)}
                disabled={aiOff}
                className="min-h-11 rounded-xl border border-ktip-sand-200 bg-white px-3 text-base font-semibold text-ktip-sand-900 md:text-sm dark:bg-ktip-sand-50"
              >
                <option value="en">English</option>
                <option value="fr">Français</option>
                <option value="es">Español</option>
              </select>
              {active === 'x' && (
                <span className={cn('text-xs font-bold tabular-nums text-ktip-sand-600', xCount > X_LIMIT && 'text-red-600')}>
                  {xCount} / {X_LIMIT}
                </span>
              )}
              <span
                className={cn(
                  'ml-auto text-xs font-bold',
                  pending || !isAi
                    ? 'text-ktip-sand-500'
                    : unmatched.length
                      ? 'text-red-600'
                      : 'text-ktip-tropical-700 dark:text-ktip-tropical-400'
                )}
              >
                {pending ? (
                  <Trans>Writing…</Trans>
                ) : !isAi ? (
                  <Trans>From the page</Trans>
                ) : unmatched.length ? (
                  <Trans>Not on this page: {missing}</Trans>
                ) : (
                  <Trans>Numbers match the page</Trans>
                )}
              </span>
            </div>

            <p className="text-sm leading-snug text-ktip-sand-600">
              {failure ? failureText[failure] : app.how} <Trans>Tap the text to edit it.</Trans>
            </p>
            <button
              type="button"
              onClick={() => setStep(1)}
              className="-mt-3 min-h-11 self-start text-sm font-bold text-ktip-sand-700 underline underline-offset-4"
            >
              <Trans>Change apps</Trans>
            </button>
          </>
        )}
      </div>
      <div className="shrink-0 border-t border-ktip-sand-200 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:px-6">
        {allDone ? (
          <button
            type="button"
            onClick={close}
            className="btn-brand flex min-h-12 w-full items-center justify-center rounded-xl px-4 text-base font-bold"
          >
            <Trans>Done</Trans>
          </button>
        ) : (
          <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2.5">
            <button
              type="button"
              onClick={copyLink}
              className="flex min-h-12 items-center gap-2 rounded-xl border border-ktip-sand-200 px-4 text-sm font-bold text-ktip-sand-900 hover:bg-ktip-sand-100"
            >
              <Link2 className="size-4" aria-hidden="true" />
              <Trans>Copy link</Trans>
            </button>
            <button
              type="button"
              onClick={shareNow}
              // Wait for the message on screen: sharing the page's version a second
              // before the AI's lands would send something the member never read.
              disabled={pending}
              className={cn(
                'flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-xl px-4 text-base font-bold transition-[filter,background-color]',
                pending ? 'cursor-default bg-ktip-sand-200 text-ktip-sand-500' : cn(app.tone, 'hover:brightness-110')
              )}
            >
              <Share2 className="size-5 shrink-0" aria-hidden="true" />
              <span className="truncate">
                {shared[active] ? <Trans>Share to {appName} again</Trans> : <Trans>Share to {appName}</Trans>}
              </span>
            </button>
          </div>
        )}
      </div>
    </>
  )

  return createPortal(
    <>
      {/* Blurred page behind the panel. Phones in lite mode keep the tint and drop the blur. */}
      <div
        aria-hidden="true"
        onClick={close}
        style={LAYER}
        data-lite-solid
        className={cn(
          'fixed inset-0 bg-black/45 backdrop-blur-sm transition-opacity duration-300 ease-out motion-reduce:transition-none [--lite-solid:rgb(0_0_0/0.6)]',
          shown ? 'opacity-100' : 'opacity-0'
        )}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-panel-title"
        tabIndex={-1}
        style={LAYER}
        className={cn(
          '@container fixed inset-y-0 right-0 flex w-full flex-col bg-ktip-cream text-ktip-sand-900 shadow-hard outline-none',
          'sm:w-[clamp(26rem,50vw,56rem)] sm:rounded-l-2xl sm:border-l sm:border-ktip-sand-200',
          'transition-transform duration-300 ease-out motion-reduce:transition-none',
          shown ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        <div className="flex shrink-0 items-center gap-2 px-5 pb-2 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
          {step === 2 && (
            <button
              type="button"
              onClick={() => setStep(1)}
              aria-label={t`Back to step 1`}
              className="-ml-2 grid size-11 shrink-0 place-items-center rounded-full text-ktip-sand-700 hover:bg-ktip-sand-100"
            >
              <ChevronLeft className="size-5" aria-hidden="true" />
            </button>
          )}
          <h2
            id="share-panel-title"
            ref={titleRef}
            tabIndex={-1}
            className="min-w-0 flex-1 font-display text-2xl font-bold outline-none"
          >
            {step === 1 ? heading : t`Review and share`}
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label={t`Close`}
            className="-mr-2 grid size-11 shrink-0 place-items-center rounded-full text-ktip-sand-700 hover:bg-ktip-sand-100"
          >
            <CloseIcon className="size-5" aria-hidden="true" />
          </button>
        </div>
        {stepper}
        {step === 1 ? stepOne : stepTwo}
      </div>
    </>,
    document.body
  )
}

function StepLabel({ n, text, on }: { n: number; text: string; on: boolean }) {
  return (
    <span className={cn('flex min-w-0 flex-col leading-tight', on ? 'text-ktip-sand-900' : 'text-ktip-sand-500')}>
      <span className="text-micro font-semibold uppercase tracking-wider opacity-80">
        <Trans>Step {n}</Trans>
      </span>
      <span className="truncate text-sm font-bold">{text}</span>
    </span>
  )
}
