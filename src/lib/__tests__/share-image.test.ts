import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { GET, renderCard } from '../../../api/share-image'

/**
 * The preview picture has to be a JPEG at 1200×630 whatever comes in: LinkedIn
 * and WhatsApp drop WebP cards, and Facebook only shows a picture on the first
 * share when the size matches what the tags promised.
 */

const webp = (width: number, height: number, alpha = false) =>
  sharp({
    create: { width, height, channels: alpha ? 4 : 3, background: alpha ? { r: 0, g: 0, b: 0, alpha: 0 } : '#3a7' },
  })
    .webp()
    .toBuffer()

const TEXT = { label: 'EVENT', title: 'OECS Youth Robotics Showcase', facts: ['18 February 2027', 'Grenada'] }

describe('renderCard', () => {
  it('turns a WebP photo into a 1200×630 JPEG', async () => {
    const out = await renderCard('project', await webp(1600, 1200), TEXT)
    const meta = await sharp(out).metadata()
    expect([meta.format, meta.width, meta.height]).toEqual(['jpeg', 1200, 630])
    expect(out.byteLength).toBeLessThan(300_000)
  })

  it('sets a transparent logo whole on a white card', async () => {
    const out = await renderCard('org', await webp(512, 512, true), TEXT)
    const meta = await sharp(out).metadata()
    expect([meta.format, meta.width, meta.height]).toEqual(['jpeg', 1200, 630])
    const { data } = await sharp(out).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true })
    expect([...data]).toEqual([255, 255, 255])
  })
})

describe('GET /api/share-image', () => {
  it('sends anything it cannot use to the KTIP card', async () => {
    for (const q of ['kind=nope&id=x', 'kind=project&id=../../etc', 'kind=project']) {
      const res = await GET(new Request(`https://ktip.test/api/share-image?${q}`))
      expect(res.status).toBe(302)
      expect(res.headers.get('location')).toBe('/og-default.jpg')
    }
  })

  it('reads kind and id from the /og/ path too, with the same checks', async () => {
    for (const path of ['/og/nope/x.jpg', '/og/project/..%2F..%2Fetc.jpg', '/og/project/.jpg']) {
      const res = await GET(new Request(`https://ktip.test${path}?v=1`))
      expect(res.status).toBe(302)
      expect(res.headers.get('location')).toBe('/og-default.jpg')
    }
  })
})
