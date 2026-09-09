import type { TooltipContentProps } from 'recharts'

export interface ChartTooltipProps {
  /** Formats a value for the row; defaults to a locale number plus `unit`. */
  format?: (value: number) => string
  unit?: string
}

type Row = { name?: string | number; value?: unknown; color?: string }

/**
 * The hover readout shared by every chart form.
 *
 * Recharts' default tooltip paints white-on-white at night and colours its
 * text with the series hue. This one wears the ink tokens: a coloured chip
 * carries identity, the text stays readable, and it follows the theme because
 * its classes go through the inverting ramps.
 */
export function ChartTooltip({
  active,
  payload,
  label,
  format,
  unit = '',
}: Partial<TooltipContentProps> & ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  const rows = payload as ReadonlyArray<Row>
  const show = (value: unknown) => {
    const n = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(n)) return '—'
    return format ? format(n) : `${n.toLocaleString()}${unit}`
  }

  return (
    <div className="rounded-md border border-ktip-sand-200 bg-ktip-cream px-2.5 py-1.5 text-xs shadow-neu-sm tabular-nums">
      {label !== undefined && label !== '' && (
        <p className="mb-0.5 font-semibold text-ktip-sand-900">{String(label)}</p>
      )}
      {rows.map((row, i) => (
        <p key={i} className="flex items-center gap-1.5 text-ktip-sand-700">
          {row.color && (
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 rounded-sm"
              style={{ backgroundColor: row.color }}
            />
          )}
          {row.name !== undefined && <span>{String(row.name)}</span>}
          <span className="ml-auto pl-3 font-semibold text-ktip-sand-900">{show(row.value)}</span>
        </p>
      ))}
    </div>
  )
}
