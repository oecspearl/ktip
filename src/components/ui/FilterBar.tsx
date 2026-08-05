import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { SlidersHorizontal, X } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { useDisclosureAnimation } from './useDisclosureAnimation'

/**
 * The control bar above a list page — filters, result count, tools, primary CTA.
 *
 * Events, Projects and Grants each hand-rolled the same skeleton: one
 * `flex flex-wrap` row with the dropdowns on the left and an `ml-auto` cluster
 * on the right. On a desktop that reads as one bar. On a phone it does not:
 * `ml-auto` still applies once the cluster has wrapped onto its own line, so
 * the tools and the Create button end up right-aligned under a left-aligned row
 * of dropdowns, with the result count stranded between them and the CTA pushed
 * past the viewport edge. Three copies of that, drifting apart.
 *
 * So the bar is one component with two layouts rather than one layout that
 * wraps. Above `sm` it is the row it always was. Below `sm` the filters move
 * into a sheet behind a single trigger, which is the only way to fit filters,
 * search, a view toggle and a CTA on a 393px screen without either hiding the
 * CTA or wrapping to four ragged rows.
 *
 * What stays visible on a phone is deliberate: the trigger carries a count, so
 * a narrowed list never looks like the whole list, and the result count sits on
 * its own line directly under the bar where it reads as a caption for the
 * results rather than as another control.
 */
interface FilterBarProps {
  /**
   * The filter controls. Inline above `sm`, inside the sheet below it — the
   * same elements either way, so their state cannot fork between layouts.
   */
  filters: ReactNode
  /** How many filters are currently narrowing the list; drives the badge. */
  activeCount?: number
  /** The "Found 12 projects" line. */
  count?: ReactNode
  /** Search, view toggles — small enough to stay in the bar at every width. */
  actions?: ReactNode
  /** Primary action. Give its label `hidden sm:inline` so it goes icon-only. */
  cta?: ReactNode
  /** Rendered as "Clear all filters" under the bar when filters are active. */
  onClear?: () => void
  /** Accessible name for the sheet, e.g. "Filter events". */
  sheetTitle: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function FilterBar({
  filters,
  activeCount = 0,
  count,
  actions,
  cta,
  onClear,
  sheetTitle,
  open,
  onOpenChange,
}: FilterBarProps) {
  const { t } = useLingui()

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        {/* Phone: one trigger standing in for the whole filter set. */}
        <button
          type="button"
          onClick={() => onOpenChange(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          className="sm:hidden flex items-center gap-2 rounded-control border border-ktip-sand-300 bg-ktip-cream px-3 py-2 text-label text-ktip-sand-800 transition-colors hover:bg-ktip-sand-50"
        >
          <SlidersHorizontal size={16} />
          <Trans>Filters</Trans>
          {activeCount > 0 && (
            <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-ktip-ocean-600 px-1.5 py-0.5 text-micro font-bold tabular-nums text-white">
              {activeCount}
            </span>
          )}
        </button>

        {/* Tablet and up: the controls themselves, where they always were. */}
        <div className="hidden sm:flex sm:flex-wrap sm:items-center sm:gap-3">{filters}</div>

        {/* `order-last w-full` is what un-strands the count on a phone: it drops
            to its own full-width line UNDER the bar instead of being wedged
            between the filters and the tools by ordinary wrapping. */}
        {count && (
          <div className="order-last w-full text-caption text-ktip-sand-500 sm:order-none sm:w-auto">
            {count}
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          {actions}
          {cta}
        </div>
      </div>

      {onClear && activeCount > 0 && (
        <button
          onClick={onClear}
          className="mt-2 text-caption text-ktip-ocean-600 transition-colors hover:text-ktip-ocean-700 hover:underline"
        >
          <Trans>Clear all filters</Trans>
        </button>
      )}

      <FilterSheet
        open={open}
        onClose={() => onOpenChange(false)}
        title={sheetTitle}
        activeCount={activeCount}
        onClear={onClear}
        applyLabel={t`Show results`}
      >
        {/* Stacked and full-width here, not the inline row above: a sheet has
            the whole screen width, and dropdowns that fill it are easier to hit
            than ones sized to their label. */}
        <div className="flex flex-col gap-4 [&_button]:w-full [&>*]:w-full">{filters}</div>
      </FilterSheet>
    </>
  )
}

/**
 * A panel that rises from the bottom edge, phone-only.
 *
 * Bottom-anchored rather than centred like `Modal`: the trigger is in a bar the
 * thumb is already near, and a dialog that opens where the hand already is
 * costs no reach. It is also why `Modal` is not reused — that one centres, and
 * unmounts instantly on close, so it has no exit to animate.
 */
function FilterSheet({
  open,
  onClose,
  title,
  activeCount,
  onClear,
  applyLabel,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  activeCount: number
  onClear?: () => void
  applyLabel: string
  children: ReactNode
}) {
  const { mounted, state } = useDisclosureAnimation(open, { enterMs: 260, exitMs: 200 })

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!mounted) return null

  return createPortal(
    <div
      data-capture-hide
      data-state={state}
      className="filter-sheet-root fixed inset-0 z-modal sm:hidden"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="filter-sheet-scrim absolute inset-0 bg-black/50" onClick={onClose} />

      {/* A fixed height, not `max-h`: hugging its content made the panel a
          different size on every page and left the dropdowns inside it opening
          into a box barely taller than themselves, so their option lists were
          clipped by this element's own scroll container. Rising to a consistent
          height gives every filter room to open below itself, and makes the
          gesture the same one each time.

          Three rows rather than one scroller with sticky ends: only the middle
          scrolls, so the title and the buttons cannot drift or overlap content
          passing under them. */}
      <div className="filter-sheet-panel absolute inset-x-0 bottom-0 flex h-[88svh] flex-col neu-surface rounded-t-surface-lg bg-ktip-cream shadow-hard">
        {/* Grab handle — the affordance that says this came from the edge and
            can go back to it, even though only the buttons dismiss it. */}
        <div className="shrink-0 pt-3">
          <div aria-hidden className="mx-auto h-1 w-10 rounded-full bg-ktip-sand-300" />
          <div className="flex items-center justify-between px-card-pad pb-3 pt-3">
            <h2 className="text-title-sm font-display font-bold text-ktip-sand-900">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-control p-1 transition-colors hover:bg-ktip-sand-100"
              aria-label={applyLabel}
            >
              <X size={22} className="text-ktip-sand-400" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-card-pad pb-2">{children}</div>

        {/* Pinned to the bottom edge so the primary way out is under the thumb
            however long the filter list grows. */}
        <div className="flex shrink-0 gap-2 border-t border-ktip-sand-100 bg-ktip-cream px-card-pad py-3">
          {onClear && (
            <button
              type="button"
              onClick={onClear}
              disabled={activeCount === 0}
              className="flex-1 rounded-neu-sm px-4 py-3 text-label font-medium text-ktip-sand-700 shadow-neu-sm transition-all active:translate-y-px active:shadow-neu-sm-inset disabled:opacity-40"
            >
              <Trans>Clear</Trans>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="btn-brand flex-1 rounded-neu-sm px-4 py-3 text-label font-medium"
          >
            {applyLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
