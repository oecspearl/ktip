import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router'
import { ArrowDown, Check, ChevronDown, ExternalLink } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { LegalBody, resolveLegal } from './LegalBody'
import { AuthoritativeLanguageNotice } from './AuthoritativeLanguageNotice'
import { useDisclosureAnimation } from '../ui/useDisclosureAnimation'
import { cn } from '../../lib/utils'
import {
  documentsInBundle,
  legalPath,
  type LegalBundle,
  type LegalDocument,
  type LegalSection,
} from '../../lib/legal'

interface ConsentDocumentProps {
  bundle: Exclude<LegalBundle, 'informational'>
  /** Called whenever the accept state changes — scrolled to the end AND ticked. */
  onAcceptedChange: (accepted: boolean) => void
  /** Tighter spacing and a shorter scroller, for the create-flow modal. */
  dense?: boolean
  className?: string
}

/**
 * One scrollable document, sections expandable, with an accept control that
 * unlocks only once the reader has reached the end.
 *
 * The gate is an IntersectionObserver on a sentinel at the foot of the
 * scroller, not `scrollTop + clientHeight >= scrollHeight`, and the reasons are
 * concrete rather than stylistic:
 *
 *   1. Expanding a section animates `grid-template-rows: 0fr → 1fr` for 200ms,
 *      so `scrollHeight` is a MOVING NUMBER for the whole transition. Any
 *      arithmetic check is comparing against a value mid-animation.
 *   2. Sub-pixel rounding and browser zoom make the inevitable `- N` fudge
 *      factor unreliable; `threshold: 1` is exact.
 *   3. On a tall screen where the document does not overflow at all, the
 *      sentinel is already visible at mount, the observer fires immediately and
 *      the gate opens with NO SPECIAL CASE. The naive `scrollTop > 0 && …`
 *      variant deadlocks forever there, and that is the bug that ships.
 *
 * The latch is one-way. Collapsing a section after reading must not revoke the
 * gate — the reader has still read it.
 */
export function ConsentDocument({
  bundle,
  onAcceptedChange,
  dense = false,
  className,
}: ConsentDocumentProps) {
  const { t } = useLingui()
  const docs = documentsInBundle(bundle)

  const scrollerRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [reachedEnd, setReachedEnd] = useState(false)
  const [checked, setChecked] = useState(false)
  const [nudge, setNudge] = useState('')
  const checkboxId = useId()

  const accepted = reachedEnd && checked

  useEffect(() => {
    onAcceptedChange(accepted)
  }, [accepted, onAcceptedChange])

  useEffect(() => {
    const root = scrollerRef.current
    const target = sentinelRef.current
    if (!root || !target) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setReachedEnd(true)
      },
      { root, threshold: 1 }
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [])

  const jumpToEnd = useCallback(() => {
    sentinelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    // Also latches on focus, so a screen-reader user who lands here without a
    // visual scroll event still opens the gate.
    sentinelRef.current?.focus()
  }, [])

  return (
    <div className={cn('space-y-4', className)}>
      <AuthoritativeLanguageNotice />

      {/* A scroll gate is genuinely impassable for someone whose reading cursor
          does not move the container — VoiceOver users, most obviously. This
          keeps the gate's intent (a deliberate act at the end of the document)
          without making it a dead end. */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-caption text-ktip-sand-500">
          <Trans>Scroll to the end to continue.</Trans>
        </p>
        <button
          type="button"
          onClick={jumpToEnd}
          className="inline-flex shrink-0 items-center gap-1.5 text-caption font-semibold text-ktip-ocean-700 hover:opacity-80"
        >
          <ArrowDown size={14} aria-hidden />
          <Trans>Jump to the end</Trans>
        </button>
      </div>

      <div
        ref={scrollerRef}
        // tabIndex so the region is PageDown-scrollable even when nothing
        // focusable is in view. svh, not vh, for the mobile-chrome reason the
        // rest of the codebase uses it.
        tabIndex={0}
        role="region"
        aria-label={t`Agreement text`}
        className={cn(
          'overflow-y-auto rounded-surface border border-ktip-sand-200 bg-ktip-cream p-5',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ktip-ocean-500/40',
          dense ? 'max-h-[48svh]' : 'max-h-[60svh]'
        )}
      >
        <div className="space-y-8">
          {docs.map((doc) => (
            <ConsentDocumentBody key={doc.key} doc={doc} />
          ))}
        </div>

        {/* The sentinel. `threshold: 1` means the whole of it must be visible,
            and it carries a visible line so reaching it reads as an ending
            rather than as blank space. */}
        <div
          ref={sentinelRef}
          tabIndex={-1}
          onFocus={() => setReachedEnd(true)}
          className="mt-8 border-t border-ktip-sand-200 pt-4 focus:outline-none"
        >
          <p className="text-caption text-ktip-sand-500">
            <Trans>You have reached the end of the agreement.</Trans>
          </p>
        </div>
      </div>

      <label
        htmlFor={checkboxId}
        className={cn(
          'flex cursor-pointer items-start gap-3 rounded-surface border p-4 transition-colors',
          reachedEnd
            ? 'border-ktip-sand-200 hover:bg-ktip-sand-50'
            : 'border-ktip-sand-200 opacity-60'
        )}
      >
        <input
          id={checkboxId}
          type="checkbox"
          checked={checked}
          onChange={(e) => {
            if (!reachedEnd) {
              // Ticking before reading is the other way into the same nudge.
              setNudge(t`Please scroll to the end of the agreement first.`)
              jumpToEnd()
              return
            }
            setNudge('')
            setChecked(e.target.checked)
          }}
          className="mt-0.5 h-4 w-4 rounded border-ktip-sand-300 text-ktip-ocean-600 focus:ring-ktip-ocean-500"
        />
        <span className="text-body text-ktip-sand-700">
          {bundle === 'account' ? (
            <Trans>
              I have read and agree to the documents above, and I confirm the details I have given
              are accurate.
            </Trans>
          ) : (
            <Trans>I have read and agree to the documents above.</Trans>
          )}
        </span>
      </label>

      {/* Announced rather than only shown, because the person most likely to hit
          the gate unexpectedly is the one who cannot see the disabled styling. */}
      <p role="status" aria-live="polite" className="min-h-5 text-caption text-ktip-sun-800">
        {nudge}
      </p>

      {accepted && (
        <p className="flex items-center gap-1.5 text-caption text-ktip-tropical-700">
          <Check size={14} aria-hidden />
          <Trans>Ready to continue.</Trans>
        </p>
      )}
    </div>
  )
}

/** One document inside the panel: a heading, then its sections as disclosures. */
function ConsentDocumentBody({ doc }: { doc: LegalDocument }) {
  const { i18n } = useLingui()

  return (
    <article>
      <header className="mb-3 border-b border-ktip-sand-200 pb-2">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-display text-body-lg font-bold text-ktip-sand-900">
            {resolveLegal(i18n, doc.title)}
          </h3>
          <Link
            to={legalPath(doc.key)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1 text-caption font-semibold text-ktip-ocean-700 hover:opacity-80"
          >
            <Trans>Open in a new tab</Trans>
            <ExternalLink size={12} aria-hidden />
          </Link>
        </div>
        <p className="mt-1 text-caption text-ktip-sand-500">
          <Trans>Version {doc.version}</Trans>
          <span aria-hidden className="mx-2 text-ktip-sand-300">
            ·
          </span>
          {resolveLegal(i18n, doc.summary)}
        </p>
      </header>

      <div className="space-y-1">
        {doc.sections.map((section) => (
          <ConsentSection key={section.id} section={section} />
        ))}
      </div>
    </article>
  )
}

/**
 * A collapsible section.
 *
 * `keepMounted` matters twice here, and neither reason is animation polish.
 * First, the sentinel's position stays stable no matter which sections are
 * open, so the observer is not re-triggered by a collapse above it. Second, the
 * closed state is `grid-template-rows: 0fr` with `overflow: hidden` — not
 * `display: none` — so the full text stays in the accessibility tree and a
 * screen reader reads the whole agreement linearly regardless of what is
 * visually folded.
 *
 * Everything starts open. Collapsing is an opt-in tidy-up for a reader who has
 * finished a section, never the state they arrive in — nobody should have to
 * click fourteen times to read what they are agreeing to.
 */
function ConsentSection({ section }: { section: LegalSection }) {
  const { i18n } = useLingui()
  const [open, setOpen] = useState(true)
  const { state, settled } = useDisclosureAnimation(open, { keepMounted: true })

  return (
    <section className="rounded-control border border-transparent">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="group flex w-full items-center gap-2 rounded-control px-2 py-2 text-left hover:bg-ktip-sand-50"
      >
        <ChevronDown
          size={16}
          aria-hidden
          className={cn(
            'shrink-0 text-ktip-sand-400 transition-transform duration-200',
            open ? 'rotate-0' : '-rotate-90'
          )}
        />
        <span className="text-body font-semibold text-ktip-sand-900 group-hover:text-ktip-ocean-700">
          {resolveLegal(i18n, section.heading)}
        </span>
      </button>

      <div className="disclosure-collapse" data-state={state} data-settled={settled}>
        <div>
          <div className="px-2 pb-4 pt-1">
            {section.summary && (
              <p className="mb-3 text-caption text-ktip-sand-500">
                {resolveLegal(i18n, section.summary)}
              </p>
            )}
            <LegalBody blocks={section.body} />
          </div>
        </div>
      </div>
    </section>
  )
}
