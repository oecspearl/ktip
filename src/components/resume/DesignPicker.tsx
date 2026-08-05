import { Check } from 'lucide-react'
import { RESUME_DESIGNS, type ResumeDesign } from '../../lib/resume-designs'
import { sheetFor } from './sheets'
import type { ResumeData, ResumeTheme } from '../../types/resume'
import { cn } from '../../lib/utils'
import { Trans, useLingui } from '@lingui/react/macro'

/**
 * Design chooser.
 *
 * Each card renders the real sheet component with the member's own document,
 * scaled right down — a thumbnail cannot drift from the thing it depicts if it
 * IS the thing it depicts. The `thumbnail` flag strips the print identity (the
 * id and the `.resume-sheet` class), without which every candidate would be
 * pinned to the page origin by the print rules and all of them would print on
 * top of each other; `.resume-picker` is hidden at print time as well, belt and
 * braces.
 */

/**
 * Enough to read the layout, small enough that two fit side by side in the
 * rail beside the page. The rail is the primary placement now — it was 0.17
 * when the picker sat above a full-width preview.
 */
const THUMB_SCALE = 0.145
const A4_WIDTH_PX = (210 * 96) / 25.4
/** One page only — the thumbnail is about layout, not length. */
const A4_BODY_PX = (277 * 96) / 25.4

export function DesignPicker({
  data,
  avatarUrl,
  current,
  onPick,
  busy,
  theme = 'color',
}: {
  data: ResumeData
  avatarUrl: string | null
  current: ResumeDesign
  onPick: (id: string) => void
  busy?: boolean
  /**
   * Follows the preview's ink so a thumbnail never advertises a colour rail
   * that the page beside it is printing in black.
   */
  theme?: ResumeTheme
}) {
  const { t, i18n } = useLingui()
  return (
    <div className="resume-picker print:hidden">
      <h2 className="font-display text-sm font-bold uppercase tracking-[0.14em] text-ktip-sand-500">
        <Trans>Design</Trans>
      </h2>
      <p className="mt-1 text-xs text-ktip-sand-500">
        <Trans>Changes how your CV is drawn and printed. Your content never changes.</Trans>
      </p>

      {/* Two across at every width. In the rail that is the rail's width; below
          the page on a phone it is the same two, which keeps the thumbnails
          large enough to tell a layout from a layout. */}
      <div className="mt-3 grid grid-cols-2 gap-3">
        {Object.values(RESUME_DESIGNS).map((design) => {
          const Sheet = sheetFor(design.id)
          const selected = design.id === current.id
          const label = design.label
          const description = design.description
          return (
            <button
              key={design.id}
              type="button"
              onClick={() => onPick(design.id)}
              disabled={busy || selected}
              aria-pressed={selected}
              aria-label={t`${label} design — ${description}`}
              className={cn(
                'group relative overflow-hidden rounded-xl border-2 p-2 text-left transition-colors',
                'disabled:cursor-default',
                selected
                  ? 'border-ktip-ocean-600 bg-ktip-ocean-50/60'
                  : 'border-ktip-sand-200 hover:border-ktip-ocean-300'
              )}
            >
              {/* Fixed box; the sheet inside is scaled, and a transform does not
                  shrink the layout box it came from. */}
              <div
                aria-hidden
                className="relative overflow-hidden rounded-md bg-white shadow-sm ring-1 ring-black/10"
                style={{
                  width: `${A4_WIDTH_PX * THUMB_SCALE}px`,
                  height: `${A4_BODY_PX * THUMB_SCALE}px`,
                }}
              >
                <div
                  className="absolute left-0 top-0 w-[210mm]"
                  style={{ transform: `scale(${THUMB_SCALE})`, transformOrigin: 'top left' }}
                >
                  <Sheet
                    data={data}
                    avatarUrl={avatarUrl}
                    theme={theme}
                    design={design}
                    thumbnail
                  />
                </div>
              </div>

              <div className="mt-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ktip-sand-900">
                    {i18n._(design.label)}
                  </p>
                  {/* Clamped: the rail is 288px wide and a four-line blurb
                      under every tile turns the list into a wall of text. The
                      full sentence stays in the aria-label above. */}
                  <p className="mt-0.5 line-clamp-3 text-[11px] leading-snug text-ktip-sand-500">
                    {i18n._(design.description)}
                  </p>
                </div>
                {selected && (
                  <span className="mt-0.5 shrink-0 rounded-full bg-ktip-ocean-600 dark:bg-ktip-ocean-200 p-1 text-white">
                    <Check size={11} />
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
