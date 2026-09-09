import { describe, expect, it } from 'vitest'
import { escapeHtml, renderEmail } from '../../../api/_lib/email-layout'

describe('renderEmail', () => {
  it('escapes the title, eyebrow and call to action, and keeps the body as given', () => {
    const html = renderEmail({
      title: 'Report for <August> & co',
      eyebrow: 'KTIP <test>',
      bodyHtml: '<p>already <strong>safe</strong></p>',
      cta: { label: 'Open "it"', url: 'https://example.org/a?b=1&c=2' },
    })
    expect(html).toContain('Report for &lt;August&gt; &amp; co')
    expect(html).toContain('KTIP &lt;test&gt;')
    expect(html).toContain('<p>already <strong>safe</strong></p>')
    expect(html).toContain('href="https://example.org/a?b=1&amp;c=2"')
    expect(html).toContain('Open &quot;it&quot;')
  })

  it('omits the button and footer when not asked for', () => {
    const html = renderEmail({ title: 'Plain', bodyHtml: '<p>x</p>' })
    expect(html).not.toContain('<a href')
    expect(html).toContain('>KTIP<')
  })

  it('escapeHtml covers the four characters that matter in attributes and text', () => {
    expect(escapeHtml(`<a href="x">&</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;')
  })
})
