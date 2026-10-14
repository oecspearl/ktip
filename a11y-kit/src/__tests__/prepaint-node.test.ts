// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { a11yPrepaint, buildPrepaintScript } from '../vite/prepaint-plugin'

// The plugin only ever runs in Node, inside the host's vite.config. This is
// the path that reads paint.js from disk.
describe('a11yPrepaint', () => {
  it('reads paint.js and inlines it with the resolved config', () => {
    const script = buildPrepaintScript({ storageKey: 'node_a11y' })
    expect(script).toContain('function paint(')
    expect(script).toContain('"storageKey":"node_a11y"')
  })

  it('injects one script into the head', () => {
    const plugin = a11yPrepaint({})
    const tags = (plugin.transformIndexHtml as () => { tag: string; injectTo: string }[])()
    expect(tags).toHaveLength(1)
    expect(tags[0].tag).toBe('script')
    expect(tags[0].injectTo).toBe('head')
  })
})
