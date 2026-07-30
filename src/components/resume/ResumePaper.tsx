import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Maximize2, Minimize2 } from 'lucide-react'

/**
 * The desk the A4 sheet sits on.
 *
 * The sheet is a true 210mm-wide block, which is wider than most content
 * columns, so on screen it is scaled down with a transform. A transform and not
 * `zoom`: zoom re-runs layout at the scaled size, so line breaks — and
 * therefore page breaks — would differ between the screen and the print pass,
 * which is the one thing this whole arrangement exists to prevent. A transform
 * rasterises an identical layout.
 *
 * DO NOT add `will-change`, `filter`, `backdrop-filter`, `perspective`,
 * `contain` or `container-type` to either wrapper. Each of them makes the
 * element a containing block for fixed and absolutely positioned descendants
 * even when the transform is none — and the print rules pin `.resume-sheet`
 * with `position: absolute; top: 0` expecting to resolve against the page, not
 * against this shell. The print block neutralises the transform, the height and
 * the overflow (see index.css); it cannot neutralise those.
 *
 * Two zoom levels, PDF-viewer convention:
 *  • Fit  — scaled to the column. Default on a wide screen.
 *  • 100% — a real 210mm page, panned horizontally. Default on a phone, and
 *    the reason browser zoom still works: at Fit, zooming in shrinks the
 *    computed scale by exactly as much as it magnifies, so the text never gets
 *    bigger (WCAG 1.4.4). At 100% it behaves like any other page.
 */

/** 210mm in CSS pixels. Fixed by spec (96dpi), so no probe element needed. */
const A4_WIDTH_PX = (210 * 96) / 25.4

export function ResumePaper({ children }: { children: ReactNode }) {
  const deskRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<'fit' | 'full'>(() =>
    typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches ? 'fit' : 'full'
  )
  const [deskWidth, setDeskWidth] = useState(0)
  const [sheetHeight, setSheetHeight] = useState(0)

  // ResizeObserver reports the LAYOUT box, which a transform does not affect —
  // so the scaled sheet still reports its true unscaled height and there is no
  // feedback loop between the measurement and the scale derived from it.
  useEffect(() => {
    const desk = deskRef.current
    const sheet = sheetRef.current
    if (!desk || !sheet) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // contentRect for the desk — its own padding is not room the sheet has.
        if (entry.target === desk) setDeskWidth(entry.contentRect.width)
        else setSheetHeight(entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height)
      }
    })
    observer.observe(desk)
    observer.observe(sheet)
    return () => observer.disconnect()
  }, [])

  // Clamped at 1: scaling a document UP past its real size makes "100%"
  // meaningless and softens every hairline rule.
  const scale = mode === 'fit' && deskWidth > 0 ? Math.min(1, deskWidth / A4_WIDTH_PX) : 1

  return (
    <div className="print:contents">
      <div className="mb-3 flex items-center justify-end gap-2 print:hidden">
        <button
          type="button"
          onClick={() => setMode(mode === 'fit' ? 'full' : 'fit')}
          className="inline-flex items-center gap-1.5 rounded-lg border border-ktip-sand-200 px-3 py-1.5 text-xs font-semibold text-ktip-sand-600 transition-colors hover:border-ktip-ocean-300 hover:text-ktip-ocean-700 dark:border-ktip-sand-700 dark:text-ktip-sand-300"
        >
          {mode === 'fit' ? <Maximize2 size={13} /> : <Minimize2 size={13} />}
          {mode === 'fit' ? 'Actual size' : 'Fit to width'}
        </button>
      </div>

      {/* The desk. Dark in both themes so the white page reads as paper rather
          than as the page background having failed to load. */}
      <div
        ref={deskRef}
        className="resume-desk overflow-x-auto rounded-xl bg-neutral-800 p-3 shadow-inner dark:bg-neutral-950 sm:p-6"
      >
        <div
          className="resume-fit mx-auto"
          style={{
            width: scale < 1 ? `${A4_WIDTH_PX * scale}px` : undefined,
            height: sheetHeight > 0 ? `${sheetHeight * scale}px` : undefined,
          }}
        >
          <div
            ref={sheetRef}
            className="resume-scale w-[210mm] shadow-2xl shadow-black/60"
            style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
