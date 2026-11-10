import { describe, expect, it } from 'vitest'
import { shareHref, taggedUrl, xLength } from './platforms'

const url = 'https://ktip.oecs.int/grants/green-fund'

describe('taggedUrl', () => {
  it('tags the source and medium', () => {
    expect(taggedUrl(url, 'whatsapp')).toBe(`${url}?utm_source=whatsapp&utm_medium=share`)
  })

  it('adds the language only when it is not English', () => {
    expect(taggedUrl(url, 'x', 'en')).not.toContain('lang=')
    expect(taggedUrl(url, 'x', 'fr')).toContain('lang=fr')
  })

  it('stamps LinkedIn, Facebook and X links so they read the card fresh, but not the ones people see', () => {
    const now = 1_762_800_000_000
    for (const app of ['linkedin', 'facebook', 'x'] as const) {
      expect(new URL(taggedUrl(url, app, 'en', now)).searchParams.get('s')).toBe(now.toString(36))
    }
    expect(taggedUrl(url, 'linkedin', 'en', now)).not.toBe(taggedUrl(url, 'linkedin', 'en', now + 1))
    for (const app of ['whatsapp', 'email', 'copy', 'native'] as const) {
      expect(new URL(taggedUrl(url, app)).searchParams.has('s')).toBe(false)
    }
  })

  it('keeps an existing query and calls the phone share menu "share"', () => {
    expect(taggedUrl(`${url}?tab=faq`, 'native')).toBe(`${url}?tab=faq&utm_source=share&utm_medium=share`)
  })
})

describe('xLength', () => {
  it('counts the link as 23 characters plus the joining space', () => {
    expect(xLength('hello')).toBe(5 + 1 + 23)
    expect(xLength('')).toBe(23)
  })

  it('counts an emoji or accented letter as one character', () => {
    expect(xLength('é')).toBe(1 + 1 + 23)
  })
})

describe('shareHref', () => {
  const args = { url, message: 'Closes 15 Jan & pays EC$50,000', title: 'Green Fund' }

  it('puts message and link in the WhatsApp text', () => {
    const href = shareHref('whatsapp', args)!
    expect(decodeURIComponent(href.split('text=')[1])).toBe(`${args.message}\n\n${url}`)
  })

  it('gives X the message and the link separately', () => {
    const href = new URL(shareHref('x', args)!)
    expect(href.searchParams.get('text')).toBe(args.message)
    expect(href.searchParams.get('url')).toBe(url)
  })

  it('gives LinkedIn and Facebook the link only, so they show a clean card', () => {
    const linkedin = new URL(shareHref('linkedin', args)!)
    expect(linkedin.origin + linkedin.pathname).toBe('https://www.linkedin.com/sharing/share-offsite/')
    expect(linkedin.searchParams.get('url')).toBe(url)
    expect(shareHref('linkedin', args)).not.toContain('Closes')
    expect(shareHref('facebook', args)).not.toContain('Closes')
  })

  it('has no address for Instagram, copy or the share menu', () => {
    expect(shareHref('instagram', args)).toBeNull()
    expect(shareHref('copy', args)).toBeNull()
    expect(shareHref('native', args)).toBeNull()
  })
})
