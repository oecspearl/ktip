import { useId, useState, type ReactNode } from 'react'
import { Table2, BarChart3 } from 'lucide-react'
import type { MeasuredList } from '../../lib/measured'
import { ChartUnavailable } from '../admin/analytics/ChartUnavailable'

/** A column of the table view. `format` defaults to String(). */
export interface ChartColumn<T> {
  key: keyof T & string
  label: string
  align?: 'left' | 'right'
  format?: (value: T[keyof T], row: T) => string
}

/** What a chart can be fed: a readable list, or a reason there is none yet. */
export type ChartInput<T> = MeasuredList<T> | { state: 'not-instrumented'; phase?: 1 | 2 | 3 }

export interface LegendItem {
  label: string
  color: string
}

interface ChartFrameProps<T> {
  title: string
  subtitle?: string
  /** The data, in the same Measured contract every tile on the console uses. */
  input: ChartInput<T>
  /** Columns for the table view. Required: a chart without one is colour-alone. */
  columns: ReadonlyArray<ChartColumn<T>>
  /** Shown for two or more series; a single series is named by the title. */
  legend?: ReadonlyArray<LegendItem>
  onRetry?: () => void
  /** Copy for a truthful empty list. Defaults to the period wording. */
  emptyText?: string
  /** Something to the right of the title: a period, an export button. */
  action?: ReactNode
  children: (items: T[]) => ReactNode
}

/**
 * The card every chart on the analytics hub lives in.
 *
 * Three jobs, and the first is the one that matters:
 *
 *   1. Keep the three states of src/lib/measured.ts apart. A refused query is
 *      amber with its reason and a retry; a Phase 2/3 collector is a muted
 *      "not yet measured"; an empty list is the italic line. None of them is
 *      a flat line at zero, which is the one rendering a reader believes.
 *   2. Ship the table view. Colour is never the only encoding: the same rows
 *      the marks were drawn from are one click away, and screen readers get
 *      them through the img role's label.
 *   3. Carry the legend for >= 2 series, so identity is text as well as hue.
 *
 * English, not lingui — this only renders inside src/pages/admin/, which
 * scripts/i18n/config.mjs excludes.
 */
export function ChartFrame<T>({
  title,
  subtitle,
  input,
  columns,
  legend,
  onRetry,
  emptyText = 'No data for this period',
  action,
  children,
}: ChartFrameProps<T>) {
  const [view, setView] = useState<'chart' | 'table'>('chart')
  const titleId = useId()
  const readable = input.state === 'ok'
  const items = readable ? input.items : []

  return (
    <section
      aria-labelledby={titleId}
      className={`neu-surface rounded-2xl border border-ktip-sand-200 bg-ktip-cream p-4 shadow-neu-sm ${
        input.state === 'not-instrumented' ? 'border-dashed' : ''
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={titleId} className="text-sm font-semibold leading-tight text-ktip-sand-900">
            {title}
          </h3>
          {subtitle && <p className="mt-0.5 text-xs text-ktip-sand-500">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {action}
          {readable && items.length > 0 && (
            <button
              type="button"
              onClick={() => setView(view === 'chart' ? 'table' : 'chart')}
              aria-pressed={view === 'table'}
              title={view === 'chart' ? 'Show as table' : 'Show as chart'}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-ktip-sand-600 transition-colors hover:bg-ktip-sand-100 hover:text-ktip-sand-900"
            >
              {view === 'chart' ? <Table2 size={14} /> : <BarChart3 size={14} />}
              {view === 'chart' ? 'Table' : 'Chart'}
            </button>
          )}
        </div>
      </div>

      {input.state === 'unavailable' && <ChartUnavailable reason={input.reason} onRetry={onRetry} />}

      {input.state === 'not-instrumented' && (
        <p className="py-6 text-center text-sm text-ktip-sand-500">
          Not yet measured{input.phase ? ` — phase ${input.phase}` : ''}
        </p>
      )}

      {readable && items.length === 0 && (
        <p className="py-6 text-center text-sm italic text-ktip-sand-500">{emptyText}</p>
      )}

      {readable && items.length > 0 && view === 'chart' && (
        <div role="img" aria-label={`${title}. Switch to the table view for the values.`}>
          {children(items)}
        </div>
      )}

      {readable && items.length > 0 && view === 'table' && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs tabular-nums">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    className={`border-b border-ktip-sand-200 py-1.5 pr-3 font-semibold text-ktip-sand-600 ${
                      column.align === 'right' ? 'text-right' : 'text-left'
                    }`}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((row, i) => (
                <tr key={i}>
                  {columns.map((column) => {
                    const raw = row[column.key]
                    const text = column.format ? column.format(raw, row) : String(raw ?? '—')
                    return (
                      <td
                        key={column.key}
                        className={`border-b border-ktip-sand-100 py-1.5 pr-3 text-ktip-sand-800 ${
                          column.align === 'right' ? 'text-right' : 'text-left'
                        }`}
                      >
                        {text}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {legend && legend.length >= 2 && readable && items.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ktip-sand-700">
          {legend.map((item) => (
            <li key={item.label} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: item.color }}
              />
              {item.label}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
