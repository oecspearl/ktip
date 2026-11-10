import type { ReactNode } from 'react'

export interface Fact {
  /** Stable key; the label is a translated node. */
  key: string
  label: ReactNode
  value: ReactNode
  /** Smaller second line under the value. */
  sub?: ReactNode
  /** Anything under that, such as a capacity bar. */
  extra?: ReactNode
}

/**
 * The row of key facts a detail page opens on, under the hero: when and where
 * for an event, amount and deadline for funding, stage and team for a project.
 *
 * Four cells, two by two on a phone and one row from `sm` up. The hairlines
 * between cells are the strip's own background showing through a 1px gap, so
 * they land right at every breakpoint without per-cell border rules. Give it
 * four facts: an odd count leaves an empty cell.
 */
export function FactStrip({
  facts,
  id = 'key-details',
  spy = 'Key details',
}: {
  facts: Fact[]
  id?: string
  /** Label for the page's section rail. */
  spy?: string
}) {
  return (
    <dl
      id={id}
      data-spy={spy}
      className="mb-6 grid scroll-mt-24 grid-cols-2 gap-px overflow-hidden rounded-xl border border-ktip-sand-200 bg-ktip-sand-200 sm:grid-cols-4"
    >
      {facts.map((fact) => (
        <div key={fact.key} className="min-w-0 bg-ktip-cream p-4">
          <dt className="text-xs font-bold uppercase tracking-wider text-ktip-sand-600">{fact.label}</dt>
          <dd className="mt-1 break-words font-bold tabular-nums text-ktip-sand-900">
            {fact.value}
            {fact.sub && <span className="block text-sm font-normal text-ktip-sand-600">{fact.sub}</span>}
            {fact.extra}
          </dd>
        </div>
      ))}
    </dl>
  )
}
