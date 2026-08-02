import { describe, it, expect } from 'vitest'
import { hasLink, internalPath, linkify, trimUrlTail } from './linkify'

describe('trimUrlTail', () => {
  it('drops the punctuation the sentence contributed', () => {
    expect(trimUrlTail('https://oecsinnovation.org/events.')).toBe('https://oecsinnovation.org/events')
    expect(trimUrlTail('https://oecsinnovation.org/events,')).toBe('https://oecsinnovation.org/events')
    expect(trimUrlTail('https://oecsinnovation.org/events?!')).toBe('https://oecsinnovation.org/events')
  })

  it('keeps brackets the URL itself opened', () => {
    expect(trimUrlTail('https://en.wikipedia.org/wiki/Ruby_(gem)')).toBe(
      'https://en.wikipedia.org/wiki/Ruby_(gem)'
    )
  })

  it('drops a closing bracket the URL never opened', () => {
    expect(trimUrlTail('https://oecsinnovation.org/grants)')).toBe('https://oecsinnovation.org/grants')
  })
})

describe('linkify', () => {
  it('leaves plain text alone', () => {
    expect(linkify('see you at the venue')).toEqual([{ kind: 'text', text: 'see you at the venue' }])
    expect(linkify('')).toEqual([])
  })

  it('reproduces the input exactly when the tokens are joined', () => {
    const input = 'Accept it here: https://oecsinnovation.org/invitations and then ping me.'
    expect(
      linkify(input)
        .map((t) => t.text)
        .join('')
    ).toBe(input)
  })

  it('finds every link in a multi-line invitation', () => {
    const input = [
      'Delon Pierre invited you to collaborate on the whiteboard "Untitled Whiteboard" (view only).',
      '',
      'Accept the invitation: https://oecsinnovation.org/invitations',
      'https://oecsinnovation.org/collaborate/whiteboard/530278b2-95d1-4aa1-bfb0-a1722db2e5b3',
    ].join('\n')

    const links = linkify(input).filter((t) => t.kind === 'link')
    expect(links).toHaveLength(2)
    expect(links[0]).toMatchObject({
      href: 'https://oecsinnovation.org/invitations',
      internal: '/invitations',
    })
    expect(links[1]).toMatchObject({
      internal: '/collaborate/whiteboard/530278b2-95d1-4aa1-bfb0-a1722db2e5b3',
    })
  })

  it('gives a bare www. link a scheme without rewriting what is shown', () => {
    const [link] = linkify('try www.oecs.int for the treaty').filter((t) => t.kind === 'link')
    expect(link).toMatchObject({
      text: 'www.oecs.int',
      href: 'https://www.oecs.int',
      internal: null,
    })
  })

  it('treats an outside link as external', () => {
    const [link] = linkify('https://github.com/anthropics').filter((t) => t.kind === 'link')
    expect(link).toMatchObject({ href: 'https://github.com/anthropics', internal: null })
  })

  it('ignores schemes that are not http(s)', () => {
    expect(hasLink('javascript:alert(1)')).toBe(false)
    expect(hasLink('mailto:someone@oecs.int')).toBe(false)
  })

  it('keeps the query and hash on an internal link', () => {
    const [link] = linkify('https://oecsinnovation.org/events?tab=past#top').filter(
      (t) => t.kind === 'link'
    )
    expect(link).toMatchObject({ internal: '/events?tab=past#top' })
  })
})

describe('internalPath', () => {
  it('routes the current origin internally, whatever it is', () => {
    // jsdom serves the suite from localhost; a link back to it is still ours.
    expect(internalPath(`${window.location.origin}/messages`)).toBe('/messages')
  })

  it('refuses anything unparseable', () => {
    expect(internalPath('not a url')).toBeNull()
  })
})
