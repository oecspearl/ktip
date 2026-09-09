/**
 * Which kind of device is this page on?
 *
 * Rendering decisions only — which app store to point at, whether a QR code
 * is worth showing (not on the phone that would have to scan itself), whether
 * "add to home screen" means anything. Nothing here is trusted for anything
 * that matters, and every answer has an `unknown` that callers must handle by
 * showing everything.
 *
 * Extracted from InstallPrompt so the authenticator walkthrough and the public
 * /get-authenticator page ask the same question the same way.
 */

export type Platform = 'ios' | 'android' | 'mac' | 'windows' | 'linux' | 'unknown'

/** Shape of the bits of `navigator` we read, so tests can hand in a stand-in. */
export interface PlatformSource {
  userAgent: string
  maxTouchPoints?: number
  standalone?: boolean
}

function source(): PlatformSource {
  if (typeof navigator === 'undefined') return { userAgent: '' }
  const nav = navigator as Navigator & { standalone?: boolean }
  return {
    userAgent: nav.userAgent ?? '',
    maxTouchPoints: nav.maxTouchPoints,
    standalone: nav.standalone,
  }
}

export function detectPlatform(nav: PlatformSource = source()): Platform {
  const ua = nav.userAgent
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios'
  // iPadOS 13+ asks for desktop sites and calls itself a Macintosh. A Mac with
  // a touch screen does not exist; a "Mac" with several touch points is an iPad.
  if (/macintosh/i.test(ua) && (nav.maxTouchPoints ?? 0) > 1) return 'ios'
  if (/android/i.test(ua)) return 'android'
  if (/macintosh|mac os x/i.test(ua)) return 'mac'
  if (/windows/i.test(ua)) return 'windows'
  if (/linux|x11|cros/i.test(ua)) return 'linux'
  return 'unknown'
}

/** A phone or tablet: the platforms that have an app store and a camera. */
export function isMobilePlatform(platform: Platform): boolean {
  return platform === 'ios' || platform === 'android'
}

export function isIos(nav: PlatformSource = source()): boolean {
  return detectPlatform(nav) === 'ios'
}

/** Running as an installed PWA rather than in a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS predates display-mode and reports it here instead.
    (window.navigator as { standalone?: boolean }).standalone === true
  )
}

/**
 * The primary pointer is a finger. Used to decide whether a QR code on this
 * screen can be scanned by anything — the device that would scan it is the one
 * displaying it.
 */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(pointer: coarse)').matches ?? false
}
