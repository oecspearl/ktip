/**
 * Pop-out portrait: the member's avatar rising past a gradient backdrop panel
 * so the head breaks the frame.
 *
 * The source template shipped a hand-cut background-removed PNG. KTIP has no
 * such asset per member — it has whatever avatar they uploaded, on whatever
 * background. So the photo is masked into a circle that overlaps the panel,
 * which reads as deliberate framing rather than as a cutout that failed. With
 * no avatar at all it falls back to initials, which is what the rest of the app
 * does.
 *
 * Two skins, matching the sheet's two themes:
 *  • mono  — B&W: gray panel, grayscale photo.
 *  • color — brand: accent panel, full colour.
 *
 * There was a third, 'screen', for the separate on-screen résumé that the
 * WYSIWYG sheet replaced. Dropped with it: the sheet is now what is on screen.
 */

import { useState } from 'react'
import { useLingui } from '@lingui/react/macro'

export type PortraitTheme = 'mono' | 'color'

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '—'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function ResumePortrait({
  name,
  avatarUrl,
  theme,
  accent,
  className = '',
}: {
  name: string
  avatarUrl: string | null
  theme: PortraitTheme
  accent: string
  className?: string
}) {
  // A stale or private avatar URL is common — the account keeps the column after
  // the object is gone, and `crossOrigin` makes a bucket without CORS headers
  // fail too. Untreated, the browser paints the alt text across the panel, which
  // is what a CV must never do. Fall back to initials the moment it fails.
  const { t } = useLingui()
  const [broken, setBroken] = useState(false)
  const showPhoto = !!avatarUrl && !broken

  const panelStyle =
    theme === 'mono'
      ? { background: 'linear-gradient(to bottom, #d4d4d4, #a3a3a3)' }
      : { background: `linear-gradient(to bottom, ${accent}, ${accent}99)` }

  return (
    <div className={`relative ${className}`}>
      <div aria-hidden className="absolute inset-x-0 bottom-0 top-[24%]" style={panelStyle} />

      <div className="absolute inset-0 flex items-end justify-center pb-2">
        {showPhoto ? (
          <img
            src={avatarUrl!}
            alt={t`${name} — portrait`}
            onError={() => setBroken(true)}
            // eager + high priority: on the printed sheet a lazily-loaded image
            // is an image the print engine may capture before it arrives.
            loading="eager"
            fetchPriority="high"
            crossOrigin="anonymous"
            className={`aspect-square h-[78%] w-auto rounded-full border-4 border-white object-cover shadow-[0_10px_18px_rgba(0,0,0,0.35)] ${
              theme === 'mono' ? 'grayscale' : ''
            }`}
          />
        ) : (
          <div
            aria-hidden
            className="grid aspect-square h-[78%] place-items-center rounded-full border-4 border-white bg-white/90 shadow-[0_10px_18px_rgba(0,0,0,0.35)]"
          >
            <span
              className="font-display text-[28pt] font-bold leading-none"
              style={{ color: theme === 'mono' ? '#171717' : accent }}
            >
              {initials(name)}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
