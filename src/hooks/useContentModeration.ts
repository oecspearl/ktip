import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLingui } from '@lingui/react/macro'
import { useModerationRules } from './useModerationRules'
import { mergeRanges, scanText, type MergedRange } from '../lib/moderation/scan'
import { blockingSeverity, isBlocking } from '../lib/moderation/policy'
import { normalizeForMatching } from '../lib/moderation/normalize'
import { AI_MIN_CHARS, runModerationGate } from '../lib/moderation/gate'
import {
  EMPTY_SCAN,
  maxSeverity,
  type ModerationSurface,
  type ScanMatch,
  type ScanResult,
  type Severity,
} from '../lib/moderation/types'

/**
 * The composer-side content filter.
 *
 * Everything here is UX. scan_content() inside the BEFORE INSERT trigger is
 * what actually decides whether a row is visible; this exists so a member
 * learns that while they are typing rather than by watching their post
 * silently fail to appear.
 *
 * Two consequences of that ordering, both deliberate:
 *   * It never blocks on something the server would accept. Obfuscated
 *     matches (`via: 'normalized'`) warn and nothing more — see policy.ts.
 *   * A failure to load the rules is not an error state. No rules means no
 *     matches, and every form behaves exactly as it did before.
 */

/** Scan this long after the last keystroke. Below one frame of typing rhythm. */
const SCAN_DEBOUNCE_MS = 150
/** Open the warning this long after typing stops — mid-word is too eager. */
const WARN_DEBOUNCE_MS = 600
/** Never warn on a half-typed word. */
const MIN_CHARS_TO_WARN = 3

export interface ModerationFieldSpec {
  /** MUST match the key this form uses in its own `errors` record. */
  name: string
  value: string
  /** Human label, shown in the modal and read by the live region. */
  label?: string
  /** 'html' is stripped before scanning; rich-text ranges come from the editor. */
  format?: 'text' | 'html'
  /** Include in the pre-submit AI gate. Wired in a later phase. */
  ai?: boolean
}

export interface FieldModeration {
  severity: Severity | null
  advisorySeverity: Severity | null
  matches: ScanMatch[]
  /** Blocks submit on this surface. Drives the mark colour and the button. */
  blocked: boolean
  overlay: {
    ranges: MergedRange[]
    onRemoveRange: (range: { start: number; end: number }) => void
  }
  /** The flagged substrings, de-duplicated, for the chip row and the live region. */
  flaggedTerms: string[]
}

export interface WarningState {
  severity: Severity
  reason: 'typing' | 'submit' | 'ai'
  terms: string[]
  fieldLabels: string[]
  /** Splices every flagged run out of every field. */
  onRemoveAll?: () => void
  /** The model's one-sentence explanation, when reason === 'ai'. */
  message?: string
}

export type ModerationGateResult =
  | { ok: true }
  | { ok: false; reason: 'local'; severity: Severity; errors: Record<string, string> }
  | {
      ok: false
      reason: 'ai_block' | 'ai_warn'
      message: string
      errors: Record<string, string>
    }

export interface UseContentModerationResult {
  fields: Record<string, FieldModeration>
  severity: Severity | null
  blocked: boolean
  errors: Record<string, string>
  warning: WarningState | null
  dismissWarning: () => void
  checkBeforeSubmit: () => Promise<ModerationGateResult>
  checking: boolean
}

export interface UseContentModerationOptions {
  surface: ModerationSurface
  /** Per-field setter, so the popover's Remove can rewrite the value. */
  onChange: (fieldName: string, next: string) => void
  enabled?: boolean
}

const EMPTY_FIELD: FieldModeration = {
  severity: null,
  advisorySeverity: null,
  matches: [],
  blocked: false,
  overlay: { ranges: [], onRemoveRange: () => {} },
  flaggedTerms: [],
}

/** Strip tags before scanning HTML. Positions from this are not editor positions. */
function plainText(value: string, format: ModerationFieldSpec['format']): string {
  if (format !== 'html') return value
  if (typeof document === 'undefined') return value.replace(/<[^>]*>/g, ' ')
  const el = document.createElement('div')
  el.innerHTML = value
  return el.textContent ?? ''
}

/**
 * Stable across retyping the same word, distinct across different words and
 * different rules. Normalized so `B.A.D` does not re-open a popup the member
 * already dismissed for `bad`.
 */
function signatureOf(match: ScanMatch, text: string): string {
  return `${match.ruleId}:${normalizeForMatching(text.slice(match.start, match.end)).text}`
}

export function useContentModeration(
  specs: ModerationFieldSpec[],
  options: UseContentModerationOptions
): UseContentModerationResult {
  const { t } = useLingui()
  const { rules } = useModerationRules()
  const { surface, onChange, enabled = true } = options

  const specsRef = useRef(specs)
  specsRef.current = specs

  // Debounced copies of the field values. Scanning on every keystroke would
  // rebuild the mark set mid-word; 150 ms is below the point where the
  // highlight feels late but above per-character churn.
  const liveKey = JSON.stringify(specs.map((s) => s.value))
  const [settled, setSettled] = useState<string[]>(() => specs.map((s) => s.value))
  useEffect(() => {
    const id = setTimeout(() => setSettled(specsRef.current.map((s) => s.value)), SCAN_DEBOUNCE_MS)
    return () => clearTimeout(id)
    // Keyed on the serialised values: the array itself is new on every render.
  }, [liveKey])

  const scans = useMemo(() => {
    const out: Record<string, ScanResult> = {}
    if (!enabled || rules.length === 0) {
      for (const spec of specsRef.current) out[spec.name] = EMPTY_SCAN
      return out
    }
    specsRef.current.forEach((spec, i) => {
      out[spec.name] = scanText(plainText(settled[i] ?? '', spec.format), rules)
    })
    return out
    // `settled` carries the values; specs identity changes every render.
  }, [settled, rules, enabled])

  const removeRange = useCallback(
    (name: string, range: { start: number; end: number }) => {
      const spec = specsRef.current.find((s) => s.name === name)
      if (!spec) return
      const value = spec.value
      let { start, end } = range
      // Collapse the double space a mid-sentence deletion would leave behind.
      if (value[start - 1] === ' ' && value[end] === ' ') end += 1
      onChange(name, value.slice(0, start) + value.slice(end))
    },
    [onChange]
  )

  const fields = useMemo(() => {
    const out: Record<string, FieldModeration> = {}
    for (const spec of specs) {
      const scan = scans[spec.name] ?? EMPTY_SCAN
      // Rich text owns its own positions inside the editor, so the overlay
      // ranges computed from stripped HTML would land in the wrong place.
      const ranges = spec.format === 'html' ? [] : mergeRanges(scan.matches)
      out[spec.name] = {
        severity: scan.severity,
        advisorySeverity: scan.advisorySeverity,
        matches: scan.matches,
        blocked: isBlocking(scan, surface),
        overlay: {
          ranges,
          onRemoveRange: (range) => removeRange(spec.name, range),
        },
        flaggedTerms: [
          ...new Set(scan.matches.map((m) => spec.value.slice(m.start, m.end).trim())),
        ].filter(Boolean),
      }
    }
    return out
  }, [specs, scans, surface, removeRange])

  const blocked = Object.values(fields).some((f) => f.blocked)
  const severity = Object.values(fields).reduce<Severity | null>(
    (acc, f) => maxSeverity(acc, f.advisorySeverity),
    null
  )

  const errors = useMemo(() => {
    const out: Record<string, string> = {}
    for (const spec of specs) {
      if (fields[spec.name]?.blocked) {
        out[spec.name] = t`This can't be posted until the highlighted text is removed.`
      }
    }
    return out
  }, [specs, fields, t])

  const removeAll = useCallback(() => {
    for (const spec of specsRef.current) {
      const scan = scans[spec.name]
      if (!scan || scan.matches.length === 0 || spec.format === 'html') continue
      // Right to left, so an earlier splice cannot invalidate a later offset.
      let next = spec.value
      for (const range of [...mergeRanges(scan.matches)].reverse()) {
        next = next.slice(0, range.start) + next.slice(range.end)
      }
      onChange(spec.name, next)
    }
  }, [scans, onChange])

  // --- the warning -------------------------------------------------------
  const acknowledged = useRef(new Set<string>())
  const [warning, setWarning] = useState<WarningState | null>(null)

  const currentSignatures = useCallback(() => {
    const out: string[] = []
    for (const spec of specsRef.current) {
      const scan = scans[spec.name]
      if (!scan) continue
      const text = plainText(spec.value, spec.format)
      for (const m of scan.matches) out.push(signatureOf(m, text))
    }
    return out
  }, [scans])

  useEffect(() => {
    if (!enabled) return
    const id = setTimeout(() => {
      const specsNow = specsRef.current
      const anyMatch = specsNow.some((s) => (scans[s.name]?.matches.length ?? 0) > 0)
      if (!anyMatch) return
      if (specsNow.every((s) => s.value.trim().length < MIN_CHARS_TO_WARN)) return

      const fresh = currentSignatures().filter((sig) => !acknowledged.current.has(sig))
      if (fresh.length === 0) return

      const worst = specsNow.reduce<Severity | null>(
        (acc, s) => maxSeverity(acc, scans[s.name]?.advisorySeverity ?? null),
        null
      )
      if (!worst) return

      setWarning({
        severity: worst,
        reason: 'typing',
        terms: [...new Set(specsNow.flatMap((s) => fieldTerms(s, scans[s.name])))],
        fieldLabels: specsNow
          .filter((s) => (scans[s.name]?.matches.length ?? 0) > 0)
          .map((s) => s.label ?? s.name),
        onRemoveAll: removeAll,
      })
    }, WARN_DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [scans, enabled, currentSignatures, removeAll])

  /**
   * Acknowledges every signature currently on screen and closes. Deliberately
   * does NOT clear the marks or the block: dismissing the explanation is not
   * the same as fixing the text, and the requirement is that the strikethrough
   * survives the popup.
   */
  const dismissWarning = useCallback(() => {
    for (const sig of currentSignatures()) acknowledged.current.add(sig)
    setWarning(null)
  }, [currentSignatures])

  const [checking, setChecking] = useState(false)
  /** AI warnings are acknowledged per exact draft, so the second press goes through. */
  const aiAcknowledged = useRef(new Set<string>())

  /**
   * The model call. Only fields marked `ai`, and only when there is enough
   * text to be worth it — a three-word event title tells a classifier nothing
   * and still costs a request.
   */
  const runGate = useCallback(
    async (specsNow: ModerationFieldSpec[]): Promise<ModerationGateResult> => {
      const aiFields = specsNow
        .filter((s) => s.ai)
        .map((s) => ({ name: s.name, text: plainText(s.value, s.format) }))
      const total = aiFields.reduce((sum, f) => sum + f.text.trim().length, 0)
      if (aiFields.length === 0 || total < AI_MIN_CHARS) return { ok: true }

      setChecking(true)
      let verdict
      try {
        verdict = await runModerationGate({ surface, fields: aiFields })
      } finally {
        setChecking(false)
      }

      if (verdict.decision === 'allow') return { ok: true }

      const message = verdict.reason ?? t`This needs another look before it goes up.`
      const affected = specsNow.filter((s) => s.ai && verdict.fields[s.name]?.severity)
      const fieldErrors: Record<string, string> = {}
      for (const spec of affected.length > 0 ? affected : specsNow.filter((s) => s.ai)) {
        fieldErrors[spec.name] = message
      }

      if (verdict.decision === 'warn') {
        // Shown once, then trusted. A member who has read the concern and still
        // means to post is not someone to keep stopping.
        const signature = JSON.stringify(aiFields)
        if (aiAcknowledged.current.has(signature)) return { ok: true }
        aiAcknowledged.current.add(signature)
        setWarning({
          severity: 'low',
          reason: 'ai',
          message,
          terms: [],
          fieldLabels: affected.map((s) => s.label ?? s.name),
        })
        return { ok: false, reason: 'ai_warn', message, errors: {} }
      }

      setWarning({
        severity: 'medium',
        reason: 'ai',
        message,
        terms: [],
        fieldLabels: affected.map((s) => s.label ?? s.name),
      })
      return { ok: false, reason: 'ai_block', message, errors: fieldErrors }
    },
    [surface, t]
  )

  const checkBeforeSubmit = useCallback(async (): Promise<ModerationGateResult> => {
    if (!enabled) return { ok: true }

    // Re-scan the CURRENT values, not the debounced ones: a member can press
    // submit inside the debounce window, and the stale scan would wave through
    // exactly the word they just typed.
    const specsNow = specsRef.current
    const fresh = specsNow.map((spec) => ({
      spec,
      scan: scanText(plainText(spec.value, spec.format), rules),
    }))

    const blocking = fresh.filter(({ scan }) => isBlocking(scan, surface))
    // Nothing local to stop it: hand the draft to the model for a second
    // opinion the word list cannot give — a paraphrase, an implied threat,
    // abuse in a dialect the list does not cover.
    if (blocking.length === 0) return runGate(specsNow)

    const worst = blocking.reduce<Severity | null>(
      (acc, { scan }) => maxSeverity(acc, blockingSeverity(scan, surface)),
      null
    )

    const fieldErrors: Record<string, string> = {}
    for (const { spec } of blocking) {
      fieldErrors[spec.name] = t`This can't be posted until the highlighted text is removed.`
    }

    // Forced open regardless of what has been acknowledged. A member who
    // dismissed the popup and then pressed a disabled-looking button otherwise
    // gets silence, which reads as the site being broken.
    setWarning({
      severity: worst ?? 'medium',
      reason: 'submit',
      terms: [...new Set(blocking.flatMap(({ spec, scan }) => fieldTerms(spec, scan)))],
      fieldLabels: blocking.map(({ spec }) => spec.label ?? spec.name),
      onRemoveAll: removeAll,
    })

    return { ok: false, reason: 'local', severity: worst ?? 'medium', errors: fieldErrors }
  }, [enabled, surface, t, removeAll, rules, runGate])

  return {
    fields: withDefaults(specs, fields),
    severity,
    blocked,
    errors,
    warning,
    dismissWarning,
    checkBeforeSubmit,
    checking,
  }
}

function fieldTerms(spec: ModerationFieldSpec, scan?: ScanResult): string[] {
  if (!scan) return []
  const text = plainText(spec.value, spec.format)
  return scan.matches.map((m) => text.slice(m.start, m.end).trim()).filter(Boolean)
}

function withDefaults(
  specs: ModerationFieldSpec[],
  fields: Record<string, FieldModeration>
): Record<string, FieldModeration> {
  const out: Record<string, FieldModeration> = {}
  for (const spec of specs) out[spec.name] = fields[spec.name] ?? EMPTY_FIELD
  return out
}
