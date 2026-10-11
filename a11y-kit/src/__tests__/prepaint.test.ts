import { afterEach, describe, expect, it } from 'vitest'
import { resolveConfig, type A11yKitConfig } from '../core/config'
import { paint, sanitize } from '../core/paint'
import paintSource from '../core/paint.js?raw'
import { buildPrepaintScript } from '../vite/prepaint-plugin'

const config: A11yKitConfig = {
  storageKey: 'pp_a11y',
  fonts: [{ id: 'lexend', label: 'Lexend', href: 'https://fonts.example/lexend.css' }],
}

afterEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('style')
  document.documentElement.className = ''
  document.documentElement.removeAttribute('data-a11y-spacing')
  document.head.querySelectorAll('link[data-a11y-font]').forEach((l) => l.remove())
})

describe('buildPrepaintScript', () => {
  it('paints exactly what the runtime paints', () => {
    const settings = { fontScale: 1.2, contrast: 'more', font: 'lexend', spacing: 1, pageContrast: 1.2, bigTargets: true }
    localStorage.setItem('pp_a11y', JSON.stringify({ v: 2, updatedAt: 1, owner: null, settings, device: {} }))

    new Function(buildPrepaintScript(config, paintSource))()
    const inline = {
      style: document.documentElement.getAttribute('style'),
      cls: document.documentElement.className,
      spacing: document.documentElement.getAttribute('data-a11y-spacing'),
      fonts: document.head.querySelectorAll('link[data-a11y-font="lexend"]').length,
    }

    const expected = document.createElement('html')
    expected.appendChild(document.createElement('head'))
    const cfg = resolveConfig(config)
    paint(sanitize(settings, cfg), cfg, expected, window)

    expect(inline.style).toBe(expected.getAttribute('style'))
    expect(inline.cls).toBe(expected.className)
    expect(inline.spacing).toBe('1')
    expect(inline.fonts).toBe(1)
  })

  it('does nothing and throws nothing with empty or broken storage', () => {
    localStorage.setItem('pp_a11y', '{broken')
    expect(() => new Function(buildPrepaintScript(config, paintSource))()).not.toThrow()
    expect(document.documentElement.style.fontSize).toBe('')
  })

  it('ships no export keywords or block comments', () => {
    const script = buildPrepaintScript(config, paintSource)
    expect(script).not.toMatch(/^export /m)
    expect(script).not.toContain('/*')
  })
})
