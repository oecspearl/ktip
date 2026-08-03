import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  STORAGE_KEY,
  adoptProfileLanguage,
  applyLanguage,
  effectiveLang,
  getLang,
  getLangSource,
  resolveInitialLanguage,
} from './language'

// The precedence rules are the part of this that is easy to get quietly wrong,
// and the failure mode is bad: a reader's explicit choice silently reverted by a
// stale profile row, on every page load, with no way to make it stick.

function setSearch(search: string) {
  // jsdom's location is not writable, so replace the whole object.
  Object.defineProperty(window, 'location', {
    value: { ...window.location, search },
    writable: true,
    configurable: true,
  })
}

function setNavigatorLanguages(languages: string[]) {
  Object.defineProperty(window.navigator, 'languages', {
    value: languages,
    configurable: true,
  })
}

beforeEach(() => {
  localStorage.clear()
  setSearch('')
  setNavigatorLanguages(['en-US', 'en'])
  applyLanguage('en', 'default', false)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('resolveInitialLanguage', () => {
  it('prefers ?lang= so a shared link lands in the language it was shared in', () => {
    localStorage.setItem(STORAGE_KEY, 'es')
    setSearch('?lang=fr')
    expect(resolveInitialLanguage()).toEqual({ lang: 'fr', source: 'url' })
  })

  it('falls back to an explicit prior choice', () => {
    localStorage.setItem(STORAGE_KEY, 'es')
    setNavigatorLanguages(['fr-FR'])
    expect(resolveInitialLanguage()).toEqual({ lang: 'es', source: 'stored' })
  })

  it('guesses from the browser when nothing has been chosen', () => {
    setNavigatorLanguages(['fr-CA', 'en'])
    expect(resolveInitialLanguage()).toEqual({ lang: 'fr', source: 'navigator' })
  })

  it('skips browser languages it cannot serve', () => {
    setNavigatorLanguages(['de-DE', 'nl', 'es-419'])
    expect(resolveInitialLanguage()).toEqual({ lang: 'es', source: 'navigator' })
  })

  it('ends at English', () => {
    setNavigatorLanguages(['de-DE'])
    expect(resolveInitialLanguage()).toEqual({ lang: 'en', source: 'default' })
  })

  it('ignores a junk ?lang= rather than trusting it', () => {
    setSearch('?lang=../../etc/passwd')
    expect(resolveInitialLanguage().source).not.toBe('url')
  })

  it('ignores a junk stored value', () => {
    localStorage.setItem(STORAGE_KEY, 'klingon')
    setNavigatorLanguages(['de'])
    expect(resolveInitialLanguage()).toEqual({ lang: 'en', source: 'default' })
  })
})

describe('applyLanguage', () => {
  it('writes lang and dir onto the document', () => {
    applyLanguage('fr', 'stored')
    expect(document.documentElement.lang).toBe('fr')
    // Always written, not only for RTL — so adding Arabic is one entry in
    // RTL_LANGS rather than a hunt for where this was assumed.
    expect(document.documentElement.dir).toBe('ltr')
  })

  it('persists an explicit choice', () => {
    applyLanguage('es', 'stored')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('es')
  })

  it('does not persist a guess', () => {
    applyLanguage('fr', 'navigator', false)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(getLang()).toBe('fr')
  })

  it('announces the change so other mounted switchers follow', () => {
    const listener = vi.fn()
    window.addEventListener('ktip-language-change', listener)
    applyLanguage('fr', 'stored')
    expect(listener).toHaveBeenCalled()
    window.removeEventListener('ktip-language-change', listener)
  })

  it('survives localStorage throwing, as in Safari private mode', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => applyLanguage('fr', 'stored')).not.toThrow()
    expect(getLang()).toBe('fr')
  })
})

describe('adoptProfileLanguage', () => {
  it('applies when the current value is only a guess', () => {
    applyLanguage('en', 'navigator', false)
    expect(adoptProfileLanguage('fr')).toBe(true)
    expect(getLang()).toBe('fr')
    expect(getLangSource()).toBe('profile')
  })

  it('never overrides an explicit choice made on this device', () => {
    applyLanguage('es', 'stored')
    expect(adoptProfileLanguage('fr')).toBe(false)
    expect(getLang()).toBe('es')
  })

  it('never overrides a ?lang= link', () => {
    applyLanguage('fr', 'url')
    expect(adoptProfileLanguage('es')).toBe(false)
    expect(getLang()).toBe('fr')
  })

  it('treats NULL as "never chosen" and does nothing', () => {
    applyLanguage('fr', 'navigator', false)
    expect(adoptProfileLanguage(null)).toBe(false)
    expect(adoptProfileLanguage(undefined)).toBe(false)
    expect(getLang()).toBe('fr')
  })

  it('ignores a value the app cannot serve', () => {
    applyLanguage('en', 'default', false)
    expect(adoptProfileLanguage('de')).toBe(false)
    expect(getLang()).toBe('en')
  })

  it('is a no-op when it already matches', () => {
    applyLanguage('fr', 'navigator', false)
    expect(adoptProfileLanguage('fr')).toBe(false)
  })
})

describe('effectiveLang', () => {
  it('maps the dev pseudo locale onto English for the provider and for <html lang>', () => {
    expect(effectiveLang('pseudo')).toBe('en')
    expect(effectiveLang('fr')).toBe('fr')
  })
})
