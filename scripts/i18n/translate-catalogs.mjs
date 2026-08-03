#!/usr/bin/env node
/**
 * Fill every empty msgstr in the .po catalogs from the translation provider.
 *
 *   npm run i18n:extract          # find new source strings
 *   npm run i18n:translate        # fill the blanks
 *   npm run i18n:compile          # build the runtime catalogs
 *
 * Only EMPTY entries are touched. A translation already in the file — machine or
 * hand-corrected — is never overwritten, so a reviewer's fix survives every
 * subsequent run. That is the whole reason this writes .po in place rather than
 * regenerating it.
 *
 * Costs roughly 350k characters for the whole app across two languages, which
 * fits inside one month of the free tier with room to spare. It is a build-time
 * script and is completely separate from the runtime cache in migration 096 —
 * this one produces files that get committed.
 *
 * Without AZURE_TRANSLATOR_KEY it explains what is missing and exits 0. That
 * matters: `npm run build` must not fail on a machine that has no key.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const LOCALES_DIR = resolve(process.cwd(), 'src/locales')
const TARGETS = ['fr', 'es']
const SOURCE = 'en'

// Azure's documented per-request ceilings. 45k rather than 50k because the limit
// counts the JSON envelope, and finding that edge in a batch of 400 strings
// means re-running the whole thing.
const MAX_ITEMS = 100
const MAX_CHARS = 45_000

function readEnv(name) {
  if (process.env[name]) return process.env[name]
  // Same three-tier resolution vite.config.ts uses for OPENAI_API_KEY: a plain
  // `node scripts/…` run has no dotenv loaded, and asking every contributor to
  // export five variables by hand is how a script stops being used.
  try {
    const file = readFileSync(resolve(process.cwd(), '.env'), 'utf8')
    const match = file.match(new RegExp(`^${name}=(.*)$`, 'm'))
    return match?.[1]?.trim() || undefined
  } catch {
    return undefined
  }
}

/**
 * Minimal PO reader.
 *
 * Deliberately not a dependency: it reads exactly the subset Lingui writes —
 * msgid/msgstr, multi-line continuations, and the `#, ` flag comments — and
 * emits the file back with only the msgstr lines changed, so the diff of a
 * translation run is nothing but translations.
 */
function parsePo(text) {
  const lines = text.split(/\r?\n/)
  const entries = []
  let current = null
  let field = null

  const unquote = (line) => {
    const match = line.match(/^(?:msgid|msgstr)?\s*"((?:[^"\\]|\\.)*)"\s*$/)
    if (!match) return null
    return match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  }

  lines.forEach((line, index) => {
    if (line.startsWith('msgid ')) {
      current = { msgid: unquote(line) ?? '', msgstr: '', msgstrStart: -1, msgstrEnd: -1 }
      entries.push(current)
      field = 'msgid'
      return
    }
    if (line.startsWith('msgstr ')) {
      if (!current) return
      current.msgstr = unquote(line) ?? ''
      current.msgstrStart = index
      current.msgstrEnd = index
      field = 'msgstr'
      return
    }
    // A bare quoted line continues whichever field was last opened.
    if (/^\s*"/.test(line) && current && field) {
      const part = unquote(line)
      if (part === null) return
      current[field] += part
      if (field === 'msgstr') current.msgstrEnd = index
      return
    }
    if (line.trim() === '') field = null
  })

  return { lines, entries }
}

function quote(value) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
}

/** Rewrite only the msgstr lines, leaving every comment and blank line alone. */
function writePo(path, parsed, translations) {
  const { lines, entries } = parsed
  // Back to front, so replacing a multi-line msgstr does not shift the indices
  // of the entries not yet written.
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i]
    const translated = translations.get(entry.msgid)
    if (translated === undefined || entry.msgstrStart === -1) continue
    lines.splice(
      entry.msgstrStart,
      entry.msgstrEnd - entry.msgstrStart + 1,
      `msgstr "${quote(translated)}"`
    )
  }
  writeFileSync(path, lines.join('\n'))
}

async function translate(texts, to, key, region, endpoint) {
  const url =
    `${endpoint.replace(/\/+$/, '')}/translate` +
    `?api-version=3.0&from=${SOURCE}&to=${encodeURIComponent(to)}&textType=html`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Ocp-Apim-Subscription-Key': key,
      'Ocp-Apim-Subscription-Region': region,
    },
    body: JSON.stringify(texts.map((Text) => ({ Text }))),
  })

  if (!res.ok) {
    throw new Error(`Azure Translator ${res.status}: ${(await res.text()).slice(0, 300)}`)
  }

  const body = await res.json()
  return texts.map((_, i) => body[i]?.translations?.[0]?.text)
}

/**
 * ICU placeholders and Lingui's indexed JSX tags must survive verbatim.
 *
 * `Hello {name}` mistranslated to `Bonjour {nom}` renders the literal text
 * "{nom}" to a reader, and `<0>` becoming `< 0 >` silently drops a link. Sending
 * as textType=html and fencing each token in <span translate="no"> is what stops
 * the provider touching them; this is the check that it worked.
 */
const TOKEN = /\{[^}]+\}|<\/?\d+>/g

function tokensOf(text) {
  return (text.match(TOKEN) ?? []).sort()
}

function protect(text) {
  return text.replace(TOKEN, (token) => `<span translate="no">${token}</span>`)
}

function unprotect(text) {
  return text.replace(/<span translate="no">(.*?)<\/span>/g, '$1')
}

async function main() {
  const key = readEnv('AZURE_TRANSLATOR_KEY')
  const region = readEnv('AZURE_TRANSLATOR_REGION') || 'global'
  const endpoint =
    readEnv('AZURE_TRANSLATOR_ENDPOINT') || 'https://api.cognitive.microsofttranslator.com'

  if (!key) {
    console.log('[i18n] AZURE_TRANSLATOR_KEY is not set — leaving catalogs untouched.')
    console.log('[i18n] Set it in .env (see .env.example) and re-run `npm run i18n:translate`.')
    console.log('[i18n] Untranslated messages render their English source, so nothing is broken.')
    return
  }

  let grandTotal = 0

  for (const locale of TARGETS) {
    const path = resolve(LOCALES_DIR, locale, 'messages.po')
    if (!existsSync(path)) {
      console.warn(`[i18n] ${locale}: no catalog at ${path} — run \`npm run i18n:extract\` first.`)
      continue
    }

    const parsed = parsePo(readFileSync(path, 'utf8'))
    // The PO header is the entry with an empty msgid. Never translate it.
    const missing = parsed.entries.filter((e) => e.msgid !== '' && e.msgstr === '')

    if (missing.length === 0) {
      console.log(`[i18n] ${locale}: nothing missing.`)
      continue
    }

    const translations = new Map()
    let chars = 0
    let batch = []

    const flush = async () => {
      if (batch.length === 0) return
      const out = await translate(batch.map((e) => protect(e.msgid)), locale, key, region, endpoint)
      batch.forEach((entry, i) => {
        const raw = out[i]
        if (typeof raw !== 'string') return
        const translated = unprotect(raw)

        const before = tokensOf(entry.msgid).join('|')
        const after = tokensOf(translated).join('|')
        if (before !== after) {
          // Left empty rather than written wrong: an empty msgstr falls back to
          // correct English, while a mangled placeholder renders "{nom}" to a
          // reader and is far harder to notice.
          console.warn(
            `[i18n] ${locale}: placeholders changed, skipping — ${JSON.stringify(entry.msgid).slice(0, 80)}`
          )
          return
        }
        translations.set(entry.msgid, translated)
      })
      chars += batch.reduce((n, e) => n + e.msgid.length, 0)
      batch = []
    }

    let pending = 0
    for (const entry of missing) {
      if (batch.length >= MAX_ITEMS || pending + entry.msgid.length > MAX_CHARS) {
        await flush()
        pending = 0
      }
      batch.push(entry)
      pending += entry.msgid.length
    }
    await flush()

    writePo(path, parsed, translations)
    grandTotal += chars
    console.log(`[i18n] ${locale}: translated ${translations.size}/${missing.length} (${chars} chars)`)
  }

  console.log(`[i18n] Done — ${grandTotal} characters this run. Now run \`npm run i18n:compile\`.`)
}

main().catch((error) => {
  console.error('[i18n] failed:', error.message)
  process.exit(1)
})
