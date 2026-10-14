/**
 * Choosing a speech voice, and shaping text for one.
 *
 * Browsers default to their worst installed voice (Microsoft David on
 * Windows, the compact set on macOS), while Edge and Chrome ship far better
 * cloud voices that only have to be asked for. And a voice must match the
 * page's language: an English voice reading French is worse than silence.
 */

/** Regional preferences within a language, best first. */
const REGION_BONUS: Record<string, Record<string, number>> = {
  // Caribbean English sits closer to en-GB than en-US
  en: { 'en-gb': 12, 'en-us': 8 },
  fr: { 'fr-fr': 12, 'fr-ca': 8 },
  // Latin American Spanish before Castilian, as the closer to the region
  es: { 'es-419': 14, 'es-mx': 12, 'es-us': 12, 'es-es': 6 },
}

export const langPrefix = (lang: string) => lang.toLowerCase().split(/[-_]/)[0]

/** Whether a voice speaks a language at all, whatever it sounds like. */
export function speaks(voice: Pick<SpeechSynthesisVoice, 'lang'>, lang: string): boolean {
  return langPrefix(voice.lang.replace('_', '-')) === langPrefix(lang)
}

/**
 * How good a voice is for a language, higher is better. -Infinity when it does
 * not speak the language; a voice that does can still score below zero.
 */
export function scoreVoice(voice: Pick<SpeechSynthesisVoice, 'name' | 'lang' | 'default'>, lang: string): number {
  if (!speaks(voice, lang)) return -Infinity
  const want = langPrefix(lang)
  const vlang = voice.lang.toLowerCase().replace('_', '-')

  const name = voice.name.toLowerCase()
  let score = 0
  if (name.includes('natural')) score += 100 // Edge's neural voices
  if (name.includes('online')) score += 40
  if (name.includes('google')) score += 60 // Chrome's cloud voices
  if (/siri|premium|enhanced/.test(name)) score += 70 // Apple's modern set
  if (/\b(david|zira|mark|hazel|george)\b/.test(name)) score -= 50 // the legacy Windows set
  if (name.includes('compact')) score -= 40

  const region = REGION_BONUS[want]
  if (region) {
    const match = Object.keys(region).find((r) => vlang.startsWith(r))
    if (match) score += region[match]
  }
  if (voice.default) score += 2
  return score
}

/** The best voice for a language, the member's own choice first. Null when none speaks it. */
export function pickVoice<V extends Pick<SpeechSynthesisVoice, 'name' | 'lang' | 'default' | 'voiceURI'>>(
  voices: readonly V[],
  lang: string,
  preferredURI?: string
): V | null {
  if (preferredURI) {
    const chosen = voices.find((v) => v.voiceURI === preferredURI && speaks(v, lang))
    if (chosen) return chosen
  }
  let best: V | null = null
  let bestScore = -Infinity
  for (const v of voices) {
    const s = scoreVoice(v, lang)
    if (s > bestScore) {
      best = v
      bestScore = s
    }
  }
  return best
}

/**
 * Copy written to be read comes out as noise in a screen voice: bullet
 * glyphs, en dashes and line breaks are read literally or run sentences
 * together.
 */
export function toSpokenText(text: string): string {
  return text
    .replace(/[•·▪◦]\s*/g, '')
    .replace(/\s+[–—]\s+/g, ', ')
    .replace(/[–—]/g, ', ')
    .replace(/\s*\n\s*/g, '. ')
    .replace(/([.!?])\s*\.\s*/g, '$1 ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** The language an element is written in: its nearest lang attribute, else the page's. */
export function resolveSpeechLang(el: Element | null): string {
  const tagged = el?.closest('[lang]')?.getAttribute('lang')
  return tagged || document.documentElement.lang || 'en'
}

/**
 * Split text into pieces short enough to speak. Chrome silently stops an
 * utterance after about fifteen seconds, so a long paragraph has to go out in
 * sentences, and an over-long sentence at its commas.
 */
export function chunkText(text: string, lang: string, max = 220): string[] {
  const clean = text.trim()
  if (!clean) return []
  if (clean.length <= max) return [clean]

  const sentences: string[] = []
  const Segmenter = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter
  if (Segmenter) {
    for (const s of new Segmenter(lang, { granularity: 'sentence' }).segment(clean)) sentences.push(s.segment)
  } else {
    sentences.push(...(clean.match(/[^.!?]+[.!?]*\s*/g) ?? [clean]))
  }

  const out: string[] = []
  let buf = ''
  const flush = () => {
    if (buf.trim()) out.push(buf.trim())
    buf = ''
  }
  for (const sentence of sentences) {
    if (sentence.length > max) {
      flush()
      // At commas, then at spaces
      let rest = sentence
      while (rest.length > max) {
        const cut = Math.max(rest.lastIndexOf(', ', max), rest.lastIndexOf(' ', max))
        const at = cut > max / 3 ? cut + 1 : max
        out.push(rest.slice(0, at).trim())
        rest = rest.slice(at)
      }
      buf = rest
    } else if ((buf + sentence).length > max) {
      flush()
      buf = sentence
    } else {
      buf += sentence
    }
  }
  flush()
  return out
}
