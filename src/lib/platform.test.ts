import { describe, expect, it } from 'vitest'
import { detectPlatform, isMobilePlatform } from './platform'

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const IPAD_DESKTOP_MODE =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Mobile Safari/537.36'
const WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36'
const LINUX = 'Mozilla/5.0 (X11; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0'

describe('detectPlatform', () => {
  it('recognises the phones', () => {
    expect(detectPlatform({ userAgent: IPHONE })).toBe('ios')
    expect(detectPlatform({ userAgent: ANDROID })).toBe('android')
  })

  it('reads an iPad asking for desktop sites as iOS, and a real Mac as a Mac', () => {
    // iPadOS 13+ says Macintosh. The touch points are the tell.
    expect(detectPlatform({ userAgent: IPAD_DESKTOP_MODE, maxTouchPoints: 5 })).toBe('ios')
    expect(detectPlatform({ userAgent: IPAD_DESKTOP_MODE, maxTouchPoints: 0 })).toBe('mac')
    expect(detectPlatform({ userAgent: IPAD_DESKTOP_MODE })).toBe('mac')
  })

  it('recognises the desktops', () => {
    expect(detectPlatform({ userAgent: WINDOWS })).toBe('windows')
    expect(detectPlatform({ userAgent: LINUX })).toBe('linux')
  })

  it('does not read Android as Linux', () => {
    // Android UAs contain "Linux"; the order of the checks is what gets this right.
    expect(detectPlatform({ userAgent: ANDROID })).toBe('android')
  })

  it('says unknown rather than guessing', () => {
    expect(detectPlatform({ userAgent: '' })).toBe('unknown')
    expect(detectPlatform({ userAgent: 'SomeBot/1.0' })).toBe('unknown')
  })
})

describe('isMobilePlatform', () => {
  it('is the two platforms with an app store and a camera', () => {
    expect(isMobilePlatform('ios')).toBe(true)
    expect(isMobilePlatform('android')).toBe(true)
    expect(isMobilePlatform('mac')).toBe(false)
    expect(isMobilePlatform('unknown')).toBe(false)
  })
})
