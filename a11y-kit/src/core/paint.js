/**
 * The one implementation of "stored settings -> <html>".
 *
 * Plain JavaScript and self-contained on purpose. The Vite plugin inlines this
 * file's text into <head>, so the first frame is already painted with the
 * reader's settings, and the store imports these same three functions at
 * runtime. Two copies of this logic is how a first paint and a settled page
 * come to disagree.
 *
 * Rules for editing:
 * - Nothing may reference anything outside these three functions: no imports,
 *   no module-level constants. The inlined copy has no module around it.
 * - ES2017 syntax only, so no ?. and no ??. The inlined copy is never
 *   transpiled, and it runs before anything could polyfill.
 * - Every argument comes in, including the window, so tests can pass a fake.
 */

/**
 * Coerce anything into valid settings: numbers clamped and snapped to their
 * step, enums checked, unknown keys dropped, missing keys defaulted.
 */
export function sanitize(raw, cfg) {
  var d = cfg.defaults
  var src = raw && typeof raw === 'object' ? raw : {}

  function num(key) {
    var range = cfg.ranges[key]
    var v = typeof src[key] === 'number' ? src[key] : parseFloat(src[key])
    if (!isFinite(v)) v = d[key]
    v = Math.round(v / range.step) * range.step
    v = Math.min(range.max, Math.max(range.min, v))
    // Snapping by multiplication leaves float dust (1.1500000000000001)
    return Number(v.toFixed(4))
  }
  function bool(key) {
    return typeof src[key] === 'boolean' ? src[key] : d[key]
  }
  function oneOf(key, allowed) {
    return allowed.indexOf(src[key]) >= 0 ? src[key] : d[key]
  }

  var fontIds = ['default']
  for (var i = 0; i < cfg.fonts.length; i++) fontIds.push(cfg.fonts[i].id)

  var setup = null
  var s = src.setup
  if (s && typeof s === 'object' && ['kept', 'reverted', 'skipped'].indexOf(s.status) >= 0 && typeof s.at === 'string') {
    setup = { status: s.status, at: s.at }
  }

  return {
    fontScale: num('fontScale'),
    font: oneOf('font', fontIds),
    spacing: oneOf('spacing', [0, 1, 2]),
    contrast: oneOf('contrast', ['auto', 'standard', 'more']),
    pageBrightness: num('pageBrightness'),
    pageContrast: num('pageContrast'),
    saturation: num('saturation'),
    photoBrightness: num('photoBrightness'),
    underlineLinks: bool('underlineLinks'),
    highlightHeadings: bool('highlightHeadings'),
    bigTargets: bool('bigTargets'),
    cursor: oneOf('cursor', ['default', 'large']),
    focusRing: oneOf('focusRing', ['default', 'strong']),
    reduceMotion: bool('reduceMotion'),
    readerBar: bool('readerBar'),
    ttsRate: num('ttsRate'),
    shortcuts: oneOf('shortcuts', ['off', 'modifier', 'all']),
    focusOnNavigate: bool('focusOnNavigate'),
    voiceNav: bool('voiceNav'),
    voiceMode: oneOf('voiceMode', ['push', 'continuous']),
    captions: oneOf('captions', ['auto', 'on']),
    setup: setup,
  }
}

/**
 * The stored state, versioned. A missing or pre-kit entry is migrated through
 * `cfg.legacy`; anything unreadable falls back to defaults rather than throw,
 * because this runs on boot and a throw here is an app that will not open.
 */
export function readStored(storage, cfg) {
  var parsed = null
  try {
    var text = storage.getItem(cfg.storageKey)
    if (text) parsed = JSON.parse(text)
  } catch (e) {
    parsed = null
  }

  var base = {}
  var updatedAt = 0
  var owner = null
  var device = {}

  if (parsed && parsed.v === 2) {
    base = parsed.settings
    updatedAt = Number(parsed.updatedAt) || 0
    owner = typeof parsed.owner === 'string' ? parsed.owner : null
    device = parsed.device && typeof parsed.device === 'object' ? parsed.device : {}
  } else {
    if (parsed && typeof parsed === 'object') {
      for (var k in parsed) base[cfg.legacy.fields[k] || k] = parsed[k]
    }
    for (var i = 0; i < cfg.legacy.keys.length; i++) {
      var rule = cfg.legacy.keys[i]
      try {
        if (storage.getItem(rule.key) === rule.equals) {
          for (var key in rule.set) base[key] = rule.set[key]
        }
      } catch (e) {
        // A blocked read just means that legacy key is not migrated
      }
    }
  }

  var needs = []
  if (Array.isArray(device.needs)) {
    for (var n = 0; n < device.needs.length; n++) {
      if (typeof device.needs[n] === 'string') needs.push(device.needs[n])
    }
  }
  var voices = {}
  if (device.ttsVoice && typeof device.ttsVoice === 'object') {
    for (var lang in device.ttsVoice) {
      if (typeof device.ttsVoice[lang] === 'string') voices[lang] = device.ttsVoice[lang]
    }
  }

  return {
    v: 2,
    updatedAt: updatedAt,
    owner: owner,
    settings: sanitize(base, cfg),
    device: {
      needs: needs,
      ttsVoice: voices,
      voiceConsentAt: typeof device.voiceConsentAt === 'string' ? device.voiceConsentAt : null,
    },
  }
}

/** Write settings onto the root element. Idempotent; safe to call on every change. */
export function paint(s, cfg, root, win) {
  var c = cfg.classes
  var list = root.classList

  // A percentage, not px: it scales from whatever default size the reader's
  // browser is set to, instead of overriding it with 16px
  root.style.fontSize = s.fontScale === 1 ? '' : s.fontScale * 100 + '%'
  root.style.setProperty('--photo-brightness', String(s.photoBrightness))

  // On the root element a filter does not become the containing block for
  // position: fixed, so fixed headers and dialogs stay put. Cleared at 1 so
  // most readers never pay for a page-wide filter at all
  var filters = []
  if (s.pageBrightness !== 1) filters.push('brightness(' + s.pageBrightness + ')')
  if (s.pageContrast !== 1) filters.push('contrast(' + s.pageContrast + ')')
  if (s.saturation !== 1) filters.push('saturate(' + s.saturation + ')')
  root.style.filter = filters.join(' ')

  var osMore = false
  try {
    osMore = typeof win.matchMedia === 'function' && win.matchMedia('(prefers-contrast: more)').matches
  } catch (e) {
    osMore = false
  }
  list.toggle(c.contrastMore, s.contrast === 'more' || (s.contrast === 'auto' && osMore))
  list.toggle(c.underlineLinks, s.underlineLinks)
  list.toggle(c.highlightHeadings, s.highlightHeadings)
  list.toggle(c.bigTargets, s.bigTargets)
  list.toggle(c.cursorLarge, s.cursor === 'large')
  list.toggle(c.focusStrong, s.focusRing === 'strong')
  list.toggle(c.reduceMotion, s.reduceMotion)

  if (s.spacing) root.setAttribute(cfg.spacingAttr, String(s.spacing))
  else root.removeAttribute(cfg.spacingAttr)

  var doc = root.ownerDocument
  var family = ''
  for (var i = 0; i < cfg.fonts.length; i++) {
    var font = cfg.fonts[i]
    var on = s.font === font.id
    list.toggle(font.className, on)
    if (on && font.family) family = font.family
    // Fetched the first time a font is chosen and never before: nobody who
    // reads in the default font pays for a webfont they will not see
    if (on && font.href && doc.head && !doc.querySelector('link[data-a11y-font="' + font.id + '"]')) {
      var pre = font.preconnect || []
      for (var p = 0; p < pre.length; p++) {
        var hint = doc.createElement('link')
        hint.rel = 'preconnect'
        hint.href = pre[p].href
        if (pre[p].cors) hint.crossOrigin = ''
        doc.head.appendChild(hint)
      }
      var link = doc.createElement('link')
      link.rel = 'stylesheet'
      link.href = font.href
      link.setAttribute('data-a11y-font', font.id)
      doc.head.appendChild(link)
    }
  }
  list.toggle(c.fontCustom, !!family)
  if (family) root.style.setProperty('--a11y-font-family', family)
  else root.style.removeProperty('--a11y-font-family')
}
