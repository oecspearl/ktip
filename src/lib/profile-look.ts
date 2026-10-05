/**
 * Profile look (migration 169) — how a member's page is dressed.
 *
 * One JSONB spec on the profile row, client-owned like avatar_style (148) and
 * banner (104), so the parser degrades anything malformed to the default look
 * rather than letting a half-written value break the page.
 *
 *   photo   'color' | 'bw'       the portrait (and background) in colour or
 *                                black & white — a CSS filter, never a re-upload
 *   tone    'mono' | 'colour'    warm greys, or greys tinted with the accent
 *   accent  '#rrggbb'            the one colour the page uses
 *   align   'auto' | 'left' | 'center' | 'right'
 *                                where the portrait stands. Auto follows the
 *                                cut-out's own `side` (where the head is in the
 *                                photo), then falls back to the right.
 *
 * Presentation only, so it is a teaser field: a private member's page still
 * wears their look.
 */

import type { AvatarStyle } from './avatar-backdrop'
import type { SubjectSide } from './portrait-mask'

export type PhotoStyle = 'color' | 'bw'
export type PageTone = 'mono' | 'colour'
export type LookAlign = 'auto' | SubjectSide

export interface ProfileLook {
  photo: PhotoStyle
  tone: PageTone
  accent: string
  align: LookAlign
}

export interface AccentPreset {
  /** Deliberately untranslated — these are colour names on a swatch's title. */
  name: string
  hex: string
}

/** The swatches the editor offers. Brass is the default. */
export const ACCENT_PRESETS: AccentPreset[] = [
  { name: 'Brass', hex: '#B08D57' },
  { name: 'Ink', hex: '#111110' },
  { name: 'Slate', hex: '#5E7A8C' },
  { name: 'Clay', hex: '#8C5E4F' },
  { name: 'KTIP green', hex: '#97D700' },
  { name: 'KTIP navy', hex: '#041E42' },
]

export const DEFAULT_LOOK: ProfileLook = {
  photo: 'color',
  tone: 'mono',
  accent: ACCENT_PRESETS[0].hex,
  align: 'auto',
}

const HEX = /^#[0-9a-f]{6}$/i
const ALIGNS = new Set<string>(['auto', 'left', 'center', 'right'])

/** Parse whatever profiles.profile_look holds. Each field falls back on its own. */
export function parseProfileLook(value: unknown): ProfileLook {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return DEFAULT_LOOK
  const v = value as Record<string, unknown>
  return {
    photo: v.photo === 'bw' ? 'bw' : 'color',
    tone: v.tone === 'colour' ? 'colour' : 'mono',
    accent: typeof v.accent === 'string' && HEX.test(v.accent) ? v.accent.toUpperCase() : DEFAULT_LOOK.accent,
    align: typeof v.align === 'string' && ALIGNS.has(v.align) ? (v.align as LookAlign) : 'auto',
  }
}

/**
 * Where the portrait stands. An explicit choice wins; `auto` asks the cut-out
 * where the head sits, and a plain photo (no cut-out, so no side) stands right.
 */
export function resolveAlign(look: ProfileLook, style: AvatarStyle): SubjectSide {
  if (look.align !== 'auto') return look.align
  return style.kind === 'photo' ? 'right' : style.side
}

// --------------------------------------------------------------------------
// Contrast
// --------------------------------------------------------------------------

function rgbOf(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function channel(c: number): number {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

function luminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function contrastRatio(a: string, b: string): number {
  const x = luminance(rgbOf(a))
  const y = luminance(rgbOf(b))
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

/**
 * The darkest card the accent is ever printed on: the black "Open to" card,
 * the featured achievement and the footer, in dark mode, tinted. Measured
 * against this, a passing accent passes everywhere it is used as text.
 */
const DARK_CARD = '#2A2A27'

/**
 * The accent as it is drawn on dark cards: the member's colour, lifted toward
 * white until it reads at 4.5:1. Brass passes untouched; KTIP navy or ink
 * would vanish on black and come back as a light tint of themselves.
 */
export function accentOnDark(hex: string): string {
  const base = rgbOf(HEX.test(hex) ? hex : DEFAULT_LOOK.accent)
  let rgb = base
  for (let t = 0; t <= 1.0001; t += 0.05) {
    rgb = base.map((v) => Math.round(v + (255 - v) * t)) as [number, number, number]
    const out = `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase()
    if (contrastRatio(out, DARK_CARD) >= 4.5) return out
  }
  return '#FFFFFF'
}

/**
 * What the editorial root needs: data attributes the stylesheet keys on, and
 * the two accent variables. Spread onto the `.pf` element.
 */
export function lookAttributes(look: ProfileLook): {
  'data-photo': PhotoStyle
  'data-tone': PageTone
  style: Record<string, string>
} {
  return {
    'data-photo': look.photo,
    'data-tone': look.tone,
    style: { '--accent': look.accent, '--accent-dark': accentOnDark(look.accent) },
  }
}
