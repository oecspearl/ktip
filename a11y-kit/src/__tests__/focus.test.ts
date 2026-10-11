import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { landOnHash } from '../core/focus'

describe('landOnHash', () => {
  const scrolled: Element[] = []

  beforeEach(() => {
    // jsdom has no scrolling; record who asked for it
    Element.prototype.scrollIntoView = vi.fn(function (this: Element) {
      scrolled.push(this)
    })
  })
  afterEach(() => {
    document.body.innerHTML = ''
    scrolled.length = 0
  })

  const flush = () => new Promise((r) => setTimeout(r, 0))

  it('scrolls to a target that is already there', () => {
    document.body.innerHTML = '<section id="accessibility"></section>'
    landOnHash('#accessibility')
    expect(scrolled.map((el) => el.id)).toEqual(['accessibility'])
  })

  it('waits for a target that renders later', async () => {
    landOnHash('#accessibility')
    expect(scrolled).toHaveLength(0)
    const late = document.createElement('section')
    late.id = 'accessibility'
    document.body.appendChild(late)
    await flush()
    expect(scrolled).toEqual([late])
  })

  it('moves focus only when asked, without a second scroll', () => {
    document.body.innerHTML = '<section id="a"></section><section id="b"></section>'
    landOnHash('#a')
    expect(document.activeElement).toBe(document.body)
    landOnHash('#b', { focus: true })
    expect(document.activeElement?.id).toBe('b')
    expect(document.getElementById('b')?.getAttribute('tabindex')).toBe('-1')
    expect(scrolled.map((el) => el.id)).toEqual(['a', 'b'])
  })

  it('lands again when a layout resets the page to the top, until the person takes over', () => {
    document.body.innerHTML = '<section id="far"></section>'
    const el = document.getElementById('far')!
    el.getBoundingClientRect = () => ({ top: 4000 }) as DOMRect
    landOnHash('#far')
    window.dispatchEvent(new Event('scroll'))
    expect(scrolled).toHaveLength(2)
    window.dispatchEvent(new Event('wheel'))
    window.dispatchEvent(new Event('scroll'))
    expect(scrolled).toHaveLength(2)
  })

  it('stops waiting once cancelled', async () => {
    const cancel = landOnHash('#later')
    cancel()
    document.body.innerHTML = '<section id="later"></section>'
    await flush()
    expect(scrolled).toHaveLength(0)
  })

  it('decodes the fragment and ignores one that names nothing', () => {
    document.body.innerHTML = '<section id="café"></section>'
    landOnHash('#caf%C3%A9')
    expect(scrolled).toHaveLength(1)
    expect(() => landOnHash('#%E0%A4%A')).not.toThrow()
    expect(() => landOnHash('#')).not.toThrow()
    expect(scrolled).toHaveLength(1)
  })
})
