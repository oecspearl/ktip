import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'

/**
 * CV design registry — pure data, no React.
 *
 * `resumes.design` names one of these (migration 078). A design is purely
 * presentational: it never changes the document shape in `resumes.data`, so
 * switching design can never lose a section.
 *
 * This module deliberately holds no component references. `src/types/resume.ts`
 * is imported by the edge routes under api/ for its runtime values, and the
 * pressure to import DEFAULT_TEMPLATE from api/ (which hardcodes 'viridion' in
 * four places) is real — the moment that happens, a ComponentType here would
 * drag react and every sheet .tsx into a server bundle that nothing
 * type-checks. The component map lives next to the components instead, in
 * src/components/resume/sheets/index.ts, and a test asserts the two agree.
 *
 * On the two accent colours: the source template used a single accent for both
 * fills and heading text. That does not survive contact with the OECS palette.
 * Brand green (#97D700) on white is about 1.8:1, which is fine for a circle
 * outline or a rule and unreadable as text — index.css says so explicitly
 * ("NEVER use 300–500 as text on light bg; green fills take navy text; green
 * text uses 700+"). So fills and text are separate values, and WCAG 2.1 AA
 * survives the printed page as well as the screen.
 */

/** Which edge of the paper a full-height colour strip bleeds off, if any. */
export type BleedSide = 'none' | 'left' | 'right'

export interface ResumeDesign {
  id: string
  label: MessageDescriptor
  description: MessageDescriptor
  /** Rules, circles, timeline dots — decoration, no contrast requirement. */
  accent: string
  /** Headings and links on white. Must clear 4.5:1. */
  accentText: string
  /** The dark panel on the sheet, and the colour of the printed bleed strip. */
  sidebar: string
  /**
   * A filled panel that runs the full height of the page needs a matching
   * bleed strip behind it (see the print block in index.css), and that trick
   * relies on Chrome repeating fixed boxes on every printed page — Firefox
   * paints it once. So only one design carries a bleeding rail; the other two
   * are drawn with borders instead, which paginates identically everywhere and
   * survives a print run with "Background graphics" turned off.
   */
  bleed: BleedSide
  /** Width of the bleed strip. Must equal the sheet's own panel width. */
  bleedWidth: string
}

export const RESUME_DESIGNS: Record<string, ResumeDesign> = {
  signature: {
    id: 'signature',
    label: msg`Signature`,
    description:
      msg`Two-column A4 with a navy sidebar, your photo, date-left timelines and skill circles.`,
    accent: '#97D700', // brand green, Pantone 375 — fills only
    accentText: '#5E8A00', // tropical-700, the minimum green that reads on white
    sidebar: '#041E42', // brand navy, Pantone 282
    bleed: 'left',
    bleedWidth: '74mm',
  },
  classic: {
    id: 'classic',
    label: msg`Classic`,
    description:
      msg`Single column, centred header, hairline rules. No photo, no filled panels — the safest thing to email an employer.`,
    accent: '#041E42', // navy: rules and dots, drawn as borders
    accentText: '#041E42', // ocean-700 on white, 14:1
    sidebar: '#041E42', // unused for paint; kept so sheetSidebar never returns undefined
    bleed: 'none',
    bleedWidth: '0mm',
  },
  compact: {
    id: 'compact',
    label: msg`Compact`,
    description:
      msg`Dense two-column at 9pt with a narrow facts column. Fits a long history onto one page.`,
    accent: '#97D700',
    accentText: '#163A63', // ocean-600, 8.6:1 — compact sets headings smaller
    sidebar: '#041E42',
    bleed: 'none',
    bleedWidth: '0mm',
  },
  atlas: {
    id: 'atlas',
    label: msg`Atlas`,
    description:
      msg`Mirror of Signature: navy rail down the right, monogram mark, date-left timelines.`,
    accent: '#97D700',
    accentText: '#5E8A00',
    sidebar: '#041E42',
    // The only design that bleeds right. Same Chrome-repeats-fixed-boxes caveat
    // as Signature (see BleedSide above) — the width here and the rail column in
    // AtlasSheet are one number in two places and must not drift.
    bleed: 'right',
    bleedWidth: '68mm',
  },
  ledger: {
    id: 'ledger',
    label: msg`Ledger`,
    description:
      msg`Editorial single column with headings set in a left gutter. Wide margins, hairline rules.`,
    accent: '#041E42',
    accentText: '#163A63',
    sidebar: '#041E42',
    bleed: 'none',
    bleedWidth: '0mm',
  },
  meridian: {
    id: 'meridian',
    label: msg`Meridian`,
    description:
      msg`Centred masthead over two equal columns split by a hairline. Symmetrical and formal.`,
    accent: '#2A5788', // ocean-500 — rules and dots only
    accentText: '#163A63', // ocean-600 on white, 8.6:1
    sidebar: '#041E42',
    bleed: 'none',
    bleedWidth: '0mm',
  },
  slate: {
    id: 'slate',
    label: msg`Slate`,
    description:
      msg`Numbered sections under a heavy double rule. Ink only — no fills, prints anywhere.`,
    accent: '#171717',
    accentText: '#041E42',
    sidebar: '#041E42',
    bleed: 'none',
    bleedWidth: '0mm',
  },
  marquee: {
    id: 'marquee',
    label: msg`Marquee`,
    description:
      msg`Oversized name over a gold bar and a three-up facts strip. Magazine cover, one column.`,
    // Brand yellow is 1.7:1 on white. It is a bar and a rule here and never
    // carries a letter of text — accentText is navy for exactly that reason.
    accent: '#FFC72C', // Pantone 123
    accentText: '#041E42',
    sidebar: '#041E42',
    bleed: 'none',
    bleedWidth: '0mm',
  },
}

export const DEFAULT_DESIGN = 'signature'

/**
 * Rows written before 078 carry design 'signature' by column default, but the
 * *template* value 'viridion' is what the pre-078 registry keyed its single
 * entry by — so anything that still passes a template id here resolves to the
 * design it used to mean. Also tolerates undefined, which is what a client
 * sees when it runs against a database where 078 has not been applied yet.
 */
export function resolveDesign(id: string | null | undefined): ResumeDesign {
  if (id === 'viridion') return RESUME_DESIGNS.signature
  return RESUME_DESIGNS[id ?? ''] ?? RESUME_DESIGNS[DEFAULT_DESIGN]
}

/**
 * The panel colour actually used for a given theme.
 *
 * Two places need this and they MUST agree: the sheet paints the panel inside
 * its own layout, while the printed full-height bleed is a fixed pseudo-element
 * on `body` (see the résumé block in index.css) that cannot read a variable set
 * on a descendant. The CV pages publish the result as `--resume-sidebar` on the
 * document root. If these two ever disagree the printed page shows a visible
 * seam where the panel ends and the bleed continues.
 *
 * Mono ignores the design's colour on purpose: "B&W" that prints a navy strip
 * is not B&W, and the mono sheet exists to survive a photocopier.
 */
export function sheetSidebar(theme: 'mono' | 'color', design: ResumeDesign): string {
  return theme === 'color' ? design.sidebar : '#171717'
}

/**
 * The custom properties the print block reads off :root. Returned as one object
 * so a design can never publish a colour without the geometry that positions
 * it — a 74mm strip at the wrong edge is a worse bug than no strip at all.
 *
 * A zero-width strip paints nothing, which is how the no-rail designs opt out.
 */
export function bleedVars(
  theme: 'mono' | 'color',
  design: ResumeDesign
): Record<'--resume-sidebar' | '--resume-bleed-width' | '--resume-bleed-left' | '--resume-bleed-right', string> {
  const off = design.bleed === 'none'
  return {
    '--resume-sidebar': off ? 'transparent' : sheetSidebar(theme, design),
    '--resume-bleed-width': off ? '0mm' : design.bleedWidth,
    '--resume-bleed-left': design.bleed === 'left' ? '0' : 'auto',
    '--resume-bleed-right': design.bleed === 'right' ? '0' : 'auto',
  }
}
