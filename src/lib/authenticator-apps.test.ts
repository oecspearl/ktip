import { describe, expect, it } from 'vitest'
import { AUTHENTICATOR_APPS, appsForPlatform, storeLinkFor } from './authenticator-apps'

describe('AUTHENTICATOR_APPS', () => {
  it('has unique ids and at least three steps each', () => {
    const ids = AUTHENTICATOR_APPS.map((app) => app.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const app of AUTHENTICATOR_APPS) {
      expect(app.steps.length, app.id).toBeGreaterThanOrEqual(3)
    }
  })

  it('ends every walkthrough on reading the code', () => {
    for (const app of AUTHENTICATOR_APPS) {
      expect(app.steps.at(-1)?.illustration, app.id).toBe('code')
    }
  })

  it('only points at https app stores and vendor pages', () => {
    for (const app of AUTHENTICATOR_APPS) {
      for (const url of Object.values(app.store)) {
        expect(url, app.id).toMatch(/^https:\/\/(apps\.apple\.com|play\.google\.com|ente\.io|proton\.me|2fas\.com)(\/|$)/)
      }
    }
  })

  it('offers something to a member with no phone, and something that needs no install', () => {
    expect(AUTHENTICATOR_APPS.some((app) => app.noPhone)).toBe(true)
    expect(AUTHENTICATOR_APPS.some((app) => app.builtIn)).toBe(true)
  })

  it('does not list Authy', () => {
    expect(AUTHENTICATOR_APPS.some((app) => /authy/i.test(app.name))).toBe(false)
  })
})

describe('appsForPlatform', () => {
  it('puts the built-in app first on an iPhone and never drops anything', () => {
    const apps = appsForPlatform('ios')
    expect(apps[0].id).toBe('apple-passwords')
    expect(apps.length).toBe(AUTHENTICATOR_APPS.length)
  })

  it('leads with phone apps on Android', () => {
    const apps = appsForPlatform('android')
    expect(apps[0].platforms).toContain('android')
    expect(apps.find((app) => app.id === 'apple-passwords')).toBeDefined()
  })

  it('leads with desktop and browser options on Windows', () => {
    const apps = appsForPlatform('windows')
    expect(apps[0].noPhone).toBe(true)
    const firstPhoneOnly = apps.findIndex((app) => app.id === 'google-authenticator')
    const lastNoPhone = apps.map((app) => !!app.noPhone).lastIndexOf(true)
    expect(firstPhoneOnly).toBeGreaterThan(lastNoPhone)
  })

  it('keeps the catalogue order when the platform is unknown', () => {
    expect(appsForPlatform('unknown').map((app) => app.id)).toEqual(
      AUTHENTICATOR_APPS.map((app) => app.id),
    )
  })
})

describe('storeLinkFor', () => {
  it('returns the store for the device and null for a built-in app', () => {
    const google = AUTHENTICATOR_APPS.find((app) => app.id === 'google-authenticator')!
    const apple = AUTHENTICATOR_APPS.find((app) => app.id === 'apple-passwords')!
    expect(storeLinkFor(google, 'ios')).toContain('apps.apple.com')
    expect(storeLinkFor(google, 'android')).toContain('play.google.com')
    expect(storeLinkFor(google, 'windows')).toBeNull()
    expect(storeLinkFor(apple, 'ios')).toBeNull()
  })

  it('falls back to the browser extension on a desktop', () => {
    const twofas = AUTHENTICATOR_APPS.find((app) => app.id === '2fas')!
    expect(storeLinkFor(twofas, 'linux')).toContain('browser-extension')
  })
})
