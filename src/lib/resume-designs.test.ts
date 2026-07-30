import { describe, expect, it } from 'vitest'
import {
  bleedVars,
  DEFAULT_DESIGN,
  RESUME_DESIGNS,
  resolveDesign,
  sheetSidebar,
} from './resume-designs'
import { SHEET_COMPONENTS, sheetFor } from '../components/resume/sheets'

/**
 * The registry is split in two on purpose — the design data holds no React so
 * the edge routes under api/ can import it, and the component map lives beside
 * the components. The parity test below is what pays for that split: it is the
 * only thing standing between "added a design" and "added a design that renders
 * as Signature because the second edit was forgotten".
 */
describe('resume design registry', () => {
  it('has a component for every design and a design for every component', () => {
    expect(Object.keys(SHEET_COMPONENTS).sort()).toEqual(Object.keys(RESUME_DESIGNS).sort())
  })

  it('keys every entry by its own id', () => {
    for (const [key, design] of Object.entries(RESUME_DESIGNS)) {
      expect(design.id).toBe(key)
    }
  })

  it('ships the default', () => {
    expect(RESUME_DESIGNS[DEFAULT_DESIGN]).toBeDefined()
  })
})

describe('resolveDesign', () => {
  it('resolves each design by id', () => {
    for (const id of Object.keys(RESUME_DESIGNS)) {
      expect(resolveDesign(id).id).toBe(id)
    }
  })

  // Pre-078 rows named their single look by the template key, and a client can
  // be deployed against a database where the design column does not exist yet.
  it('maps the legacy viridion template to Signature', () => {
    expect(resolveDesign('viridion').id).toBe('signature')
  })

  it('falls back to the default for unknown, null and undefined', () => {
    expect(resolveDesign('brutalist').id).toBe(DEFAULT_DESIGN)
    expect(resolveDesign(null).id).toBe(DEFAULT_DESIGN)
    expect(resolveDesign(undefined).id).toBe(DEFAULT_DESIGN)
  })

  it('gives sheetFor the same fallback', () => {
    expect(sheetFor('brutalist')).toBe(SHEET_COMPONENTS[DEFAULT_DESIGN])
  })
})

describe('printed bleed strip', () => {
  const signature = RESUME_DESIGNS.signature

  it('matches the sheet panel colour, so the printed page shows no seam', () => {
    expect(bleedVars('color', signature)['--resume-sidebar']).toBe(sheetSidebar('color', signature))
    expect(bleedVars('mono', signature)['--resume-sidebar']).toBe(sheetSidebar('mono', signature))
  })

  it('keeps B&W actually black and white', () => {
    expect(bleedVars('mono', signature)['--resume-sidebar']).not.toBe(signature.sidebar)
  })

  it('anchors Signature to the left edge at its own panel width', () => {
    const vars = bleedVars('color', signature)
    expect(vars['--resume-bleed-left']).toBe('0')
    expect(vars['--resume-bleed-right']).toBe('auto')
    expect(vars['--resume-bleed-width']).toBe(signature.bleedWidth)
  })

  // A zero-width strip paints nothing. Any non-zero width here would print a
  // stripe down a design that has no sidebar to justify it.
  it('collapses to nothing for designs with no rail', () => {
    for (const design of Object.values(RESUME_DESIGNS)) {
      if (design.bleed !== 'none') continue
      const vars = bleedVars('color', design)
      expect(vars['--resume-bleed-width']).toBe('0mm')
      expect(vars['--resume-sidebar']).toBe('transparent')
    }
  })
})
