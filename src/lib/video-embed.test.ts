import { describe, it, expect } from 'vitest'
import { isSupportedVideoLink, toVideoEmbed, videoProviderOf } from './video-embed'

const LOOM_ID = '0281766fa2d04bb788eaf19e65135184'
const DRIVE_ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345'

describe('isSupportedVideoLink', () => {
  it.each([
    `https://www.loom.com/share/${LOOM_ID}`,
    `https://loom.com/share/${LOOM_ID}?sid=abc`,
    `https://drive.google.com/file/d/${DRIVE_ID}/view?usp=sharing`,
    'https://drive.google.com/drive/folders/1xyzFolderId',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ',
    'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://vimeo.com/76979871',
    'http://vimeo.com/76979871',
  ])('accepts %s', (url) => {
    expect(isSupportedVideoLink(url)).toBe(true)
  })

  it.each([
    '',
    'not a link',
    'drive.google.com/file/d/abc/view',
    'https://www.dropbox.com/s/abc/demo.mp4',
    'https://loom.com.example.net/share/abc',
    'https://evil-youtube.com/watch?v=dQw4w9WgXcQ',
    'javascript:alert(1)',
    'ftp://drive.google.com/file/d/abc',
    'https://user:pass@www.loom.com/share/abc',
    `https://www.loom.com/share/${'a'.repeat(500)}`,
  ])('rejects %j', (url) => {
    expect(isSupportedVideoLink(url)).toBe(false)
  })

  it('names the provider', () => {
    expect(videoProviderOf('https://youtu.be/dQw4w9WgXcQ')).toBe('youtube')
    expect(videoProviderOf('https://player.vimeo.com/video/76979871')).toBe('vimeo')
    expect(videoProviderOf('https://example.com')).toBeNull()
  })
})

describe('toVideoEmbed', () => {
  it('turns Loom share and embed links into the embed player', () => {
    const src = `https://www.loom.com/embed/${LOOM_ID}`
    expect(toVideoEmbed(`https://www.loom.com/share/${LOOM_ID}?sid=x`)?.src).toBe(src)
    expect(toVideoEmbed(`https://www.loom.com/embed/${LOOM_ID}`)?.src).toBe(src)
    // A title slug in front of the ID
    expect(toVideoEmbed(`https://www.loom.com/share/Demo-walkthrough-${LOOM_ID}`)?.src).toBe(src)
  })

  it('turns Drive file links into the preview player', () => {
    const src = `https://drive.google.com/file/d/${DRIVE_ID}/preview`
    expect(toVideoEmbed(`https://drive.google.com/file/d/${DRIVE_ID}/view?usp=sharing`)?.src).toBe(src)
    expect(toVideoEmbed(`https://drive.google.com/file/u/0/d/${DRIVE_ID}/view`)?.src).toBe(src)
    expect(toVideoEmbed(`https://drive.google.com/open?id=${DRIVE_ID}`)?.src).toBe(src)
  })

  it('cannot play a Drive folder', () => {
    expect(toVideoEmbed('https://drive.google.com/drive/folders/1xyzFolderId0000')).toBeNull()
  })

  it('turns every YouTube link shape into the privacy-enhanced player', () => {
    const src = 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'
    for (const url of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
      'https://www.youtube.com/live/dQw4w9WgXcQ',
    ]) {
      expect(toVideoEmbed(url)?.src).toBe(src)
    }
  })

  it('keeps a YouTube start time given in seconds', () => {
    expect(toVideoEmbed('https://youtu.be/dQw4w9WgXcQ?t=90')?.src).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=90'
    )
    expect(toVideoEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s')?.src).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=42'
    )
  })

  it('turns Vimeo links into the player, carrying an unlisted hash', () => {
    expect(toVideoEmbed('https://vimeo.com/76979871')?.src).toBe('https://player.vimeo.com/video/76979871')
    expect(toVideoEmbed('https://vimeo.com/76979871/a1b2c3d4e5')?.src).toBe(
      'https://player.vimeo.com/video/76979871?h=a1b2c3d4e5'
    )
    expect(toVideoEmbed('https://player.vimeo.com/video/76979871?h=a1b2c3d4e5')?.src).toBe(
      'https://player.vimeo.com/video/76979871?h=a1b2c3d4e5'
    )
    expect(toVideoEmbed('https://vimeo.com/channels/staffpicks/76979871')?.src).toBe(
      'https://player.vimeo.com/video/76979871'
    )
  })

  it('never builds a src from an ID that fails its pattern', () => {
    expect(toVideoEmbed('https://youtu.be/short')).toBeNull()
    expect(toVideoEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ"onload=x')).toBeNull()
    expect(toVideoEmbed('https://www.loom.com/share/%22%3E%3Cscript%3E')).toBeNull()
    expect(toVideoEmbed('https://vimeo.com/channels/staffpicks')).toBeNull()
  })

  it('returns null for hosts outside the allowlist and non-links', () => {
    expect(toVideoEmbed('https://www.dropbox.com/s/abc/demo.mp4')).toBeNull()
    expect(toVideoEmbed('javascript:alert(1)')).toBeNull()
    expect(toVideoEmbed('')).toBeNull()
  })
})
