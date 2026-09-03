import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

export interface ProfileFact {
  label: string
  value: ReactNode
}

interface ProfileFactsProps {
  /** Falsy entries are dropped, so a caller can inline its own conditions. */
  items: (ProfileFact | false | null | undefined)[]
  /** One column suits the page's 20rem rail; two suits the drawer. */
  columns?: 1 | 2
  className?: string
}

/**
 * The label/value grid — location, organisation, industry, joined.
 *
 * Extracted from the drawer's local `Fact`, with the label moved off a
 * ten-pixel arbitrary size and onto `text-micro`. Sub-13px type is what the
 * token migration is removing (docs/DESIGN-TOKENS.md, phases 7-8), and this
 * label was the smallest text on either profile surface.
 *
 * (Spelling that old class name out here would be counted by the ratchet in
 * src/design/tokens.test.ts, which greps raw source and cannot tell prose from
 * markup — hence the description rather than the literal.)
 *
 * Standing does NOT belong here any more. "Collaborator · 275 pts" as a value
 * string is what StandingMeter replaces.
 */
export function ProfileFacts({ items, columns = 2, className }: ProfileFactsProps) {
  const facts = items.filter(Boolean) as ProfileFact[]
  if (!facts.length) return null

  return (
    <dl
      className={cn(
        'grid gap-x-4 gap-y-3.5',
        columns === 1 ? 'grid-cols-1' : 'grid-cols-2',
        className
      )}
    >
      {facts.map((fact) => (
        <div key={fact.label}>
          <dt className="text-micro font-semibold uppercase tracking-[0.12em] text-ktip-sand-500">
            {fact.label}
          </dt>
          <dd className="mt-0.5 text-caption font-semibold text-ktip-sand-800">{fact.value}</dd>
        </div>
      ))}
    </dl>
  )
}
