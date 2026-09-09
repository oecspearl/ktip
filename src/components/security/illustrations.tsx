import type { StepIllustration } from '../../lib/authenticator-apps'

/**
 * Five text-free drawings for the authenticator walkthrough (150).
 *
 * One per generic action — get the app, tap plus, scan or type the key, read
 * the six digits — rather than a screenshot per app. Strokes are currentColor
 * so the surrounding text colour sets the ink; fills are the same colour at
 * low opacity so they follow the theme without a palette of their own. All
 * decorative: the step text beside each one says the same thing in words.
 */

interface IllustrationProps {
  className?: string
}

const frame = 'h-full w-full'

/** A phone with a store badge and a download arrow. */
export function StoreIllustration({ className }: IllustrationProps) {
  return (
    <svg viewBox="0 0 120 80" className={className ?? frame} aria-hidden="true" fill="none">
      <rect x="40" y="6" width="40" height="68" rx="7" stroke="currentColor" strokeWidth="2.5" fill="currentColor" fillOpacity="0.06" />
      <rect x="45" y="13" width="30" height="50" rx="3" fill="currentColor" fillOpacity="0.08" />
      <circle cx="60" cy="68" r="2" fill="currentColor" />
      <rect x="50" y="24" width="20" height="20" rx="5" fill="currentColor" fillOpacity="0.18" />
      <path d="M60 28v10m0 0-4-4m4 4 4-4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M53 50h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

/** A screen with a list and a big plus button. */
export function AddAccountIllustration({ className }: IllustrationProps) {
  return (
    <svg viewBox="0 0 120 80" className={className ?? frame} aria-hidden="true" fill="none">
      <rect x="40" y="6" width="40" height="68" rx="7" stroke="currentColor" strokeWidth="2.5" fill="currentColor" fillOpacity="0.06" />
      <rect x="46" y="16" width="28" height="6" rx="2" fill="currentColor" fillOpacity="0.18" />
      <rect x="46" y="26" width="28" height="6" rx="2" fill="currentColor" fillOpacity="0.18" />
      <rect x="46" y="36" width="20" height="6" rx="2" fill="currentColor" fillOpacity="0.18" />
      <circle cx="68" cy="58" r="9" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="2.5" />
      <path d="M68 53v10M63 58h10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

/** A QR code inside a viewfinder. */
export function ScanIllustration({ className }: IllustrationProps) {
  return (
    <svg viewBox="0 0 120 80" className={className ?? frame} aria-hidden="true" fill="none">
      <path d="M36 22v-8a4 4 0 0 1 4-4h8M72 10h8a4 4 0 0 1 4 4v8M84 58v8a4 4 0 0 1-4 4h-8M48 70h-8a4 4 0 0 1-4-4v-8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <rect x="48" y="22" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="2" />
      <rect x="62" y="22" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="2" />
      <rect x="48" y="48" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="2" />
      <rect x="51" y="25" width="4" height="4" fill="currentColor" />
      <rect x="65" y="25" width="4" height="4" fill="currentColor" />
      <rect x="51" y="51" width="4" height="4" fill="currentColor" />
      <path d="M62 48h3v3h-3zM68 48h4v4h-4zM62 54h4v4h-4zM68 55h4v3h-4zM49 36h3v3h-3zM55 36h4v4h-4zM63 37h3v3h-3zM69 36h3v3h-3z" fill="currentColor" fillOpacity="0.7" />
      <path d="M30 40h60" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.45" strokeDasharray="3 4" />
    </svg>
  )
}

/** A key beside a field of grouped characters — the manual setup key. */
export function SetupKeyIllustration({ className }: IllustrationProps) {
  return (
    <svg viewBox="0 0 120 80" className={className ?? frame} aria-hidden="true" fill="none">
      <rect x="22" y="30" width="76" height="22" rx="6" stroke="currentColor" strokeWidth="2.5" fill="currentColor" fillOpacity="0.06" />
      <rect x="30" y="38" width="10" height="6" rx="1.5" fill="currentColor" fillOpacity="0.5" />
      <rect x="44" y="38" width="10" height="6" rx="1.5" fill="currentColor" fillOpacity="0.5" />
      <rect x="58" y="38" width="10" height="6" rx="1.5" fill="currentColor" fillOpacity="0.5" />
      <rect x="72" y="38" width="10" height="6" rx="1.5" fill="currentColor" fillOpacity="0.5" />
      <circle cx="30" cy="15" r="6" stroke="currentColor" strokeWidth="2.5" fill="currentColor" fillOpacity="0.15" />
      <path d="M35 19l12 10M43 26l3-3M47 30l3-3" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M86 64l3-4M80 66l1-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.5" />
    </svg>
  )
}

/** Six digit cells, the middle ones filled, and a tiny countdown ring. */
export function CodeIllustration({ className }: IllustrationProps) {
  return (
    <svg viewBox="0 0 120 80" className={className ?? frame} aria-hidden="true" fill="none">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <rect
          key={i}
          x={14 + i * 16}
          y="28"
          width="12"
          height="18"
          rx="3"
          stroke="currentColor"
          strokeWidth="2.5"
          fill="currentColor"
          fillOpacity={i < 4 ? 0.22 : 0.06}
        />
      ))}
      {[0, 1, 2, 3].map((i) => (
        <rect key={`d${i}`} x={18 + i * 16} y="34" width="4" height="6" rx="1" fill="currentColor" />
      ))}
      <circle cx="98" cy="62" r="8" stroke="currentColor" strokeWidth="2" strokeOpacity="0.35" />
      <path d="M98 54a8 8 0 0 1 8 8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M98 62v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

const BY_KEY = {
  store: StoreIllustration,
  add: AddAccountIllustration,
  scan: ScanIllustration,
  key: SetupKeyIllustration,
  code: CodeIllustration,
} as const

/** The drawing a walkthrough step asked for. */
export function StepDrawing({ kind, className }: { kind: StepIllustration; className?: string }) {
  const Drawing = BY_KEY[kind]
  return <Drawing className={className} />
}
