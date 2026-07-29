/**
 * CV template registry.
 *
 * `resumes.template` names one of these. Today there is one, ported from an
 * existing portfolio résumé; the registry exists so the second is a new entry
 * rather than a fork of the components.
 *
 * A template is purely presentational — it never changes the document shape in
 * `resumes.data`, so switching templates can never lose a section.
 *
 * On the two accent colours: the source template used a single accent for both
 * fills and heading text. That does not survive contact with the OECS palette.
 * Brand green (#97D700) on white is about 1.8:1, which is fine for a circle
 * outline or a rule and unreadable as text — index.css says so explicitly
 * ("NEVER use 300–500 as text on light bg; green fills take navy text; green
 * text uses 700+"). So fills and text are separate values, and WCAG 2.1 AA
 * survives the printed page as well as the screen.
 */

export interface ResumeTemplate {
  id: string
  label: string
  description: string
  /** Rules, circles, timeline dots — decoration, no contrast requirement. */
  accent: string
  /** Headings and links on white. Must clear 4.5:1. */
  accentText: string
  /** The dark sidebar strip on the printed sheet, and the print bleed colour. */
  sidebar: string
}

export const RESUME_TEMPLATES: Record<string, ResumeTemplate> = {
  viridion: {
    id: 'viridion',
    label: 'OECS Standard',
    description: 'Two-column A4 with a dark sidebar, date-left timelines and skill circles.',
    accent: '#97D700', // brand green, Pantone 375 — fills only
    accentText: '#5E8A00', // tropical-700, the minimum green that reads on white
    sidebar: '#041E42', // brand navy, Pantone 282
  },
}

export const DEFAULT_TEMPLATE = 'viridion'

export function resolveTemplate(id: string | null | undefined): ResumeTemplate {
  return RESUME_TEMPLATES[id ?? ''] ?? RESUME_TEMPLATES[DEFAULT_TEMPLATE]
}

/**
 * The sidebar colour actually used for a given theme.
 *
 * Two places need this and they MUST agree: the sheet paints the panel inside
 * its own layout, while the printed full-height bleed is a fixed pseudo-element
 * on `body` (see the résumé block in index.css) that cannot read a variable set
 * on a descendant. CvPage publishes the result as `--resume-sidebar` on the
 * document root. If these two ever disagree the printed page shows a visible
 * seam where the panel ends and the bleed continues.
 *
 * Mono ignores the template's colour on purpose: "B&W" that prints a navy strip
 * is not B&W, and the mono sheet exists to survive a photocopier.
 */
export function sheetSidebar(theme: 'mono' | 'color', template: ResumeTemplate): string {
  return theme === 'color' ? template.sidebar : '#171717'
}
