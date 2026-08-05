import type { ComponentType } from 'react'
import { DEFAULT_DESIGN } from '../../../lib/resume-designs'
import type { SheetProps } from './SheetFrame'
import { SignatureSheet } from './SignatureSheet'
import { ClassicSheet } from './ClassicSheet'
import { CompactSheet } from './CompactSheet'
import { AtlasSheet } from './AtlasSheet'
import { LedgerSheet } from './LedgerSheet'
import { MeridianSheet } from './MeridianSheet'
import { SlateSheet } from './SlateSheet'
import { MarqueeSheet } from './MarqueeSheet'

/**
 * design id → the component that draws it.
 *
 * Kept apart from RESUME_DESIGNS (src/lib/resume-designs.ts) so that registry
 * stays free of React and safe for the edge routes under api/ to import. The
 * cost is two edits to add a design; the payment is resume-designs.test.ts,
 * which fails loudly when only one of them is done.
 */
export const SHEET_COMPONENTS: Record<string, ComponentType<SheetProps>> = {
  signature: SignatureSheet,
  classic: ClassicSheet,
  compact: CompactSheet,
  atlas: AtlasSheet,
  ledger: LedgerSheet,
  meridian: MeridianSheet,
  slate: SlateSheet,
  marquee: MarqueeSheet,
}

export function sheetFor(designId: string): ComponentType<SheetProps> {
  return SHEET_COMPONENTS[designId] ?? SHEET_COMPONENTS[DEFAULT_DESIGN]
}

export type { SheetProps }
export { SHEET_WIDTH, PAGE_BODY } from './SheetFrame'
