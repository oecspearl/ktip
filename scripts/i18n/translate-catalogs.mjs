#!/usr/bin/env node
/**
 * Fill every empty msgstr in the .po catalogs from a translation provider.
 *
 *   npm run i18n:extract          # find new source strings
 *   npm run i18n:translate        # fill the blanks
 *   npm run i18n:compile          # build the runtime catalogs
 *
 * Only EMPTY entries are touched. A translation already in the file — machine or
 * hand-corrected — is never overwritten, so a reviewer's fix survives every
 * subsequent run. That is the whole reason this writes .po in place rather than
 * regenerating it, and it is also what makes an interrupted run safe to repeat.
 *
 * Providers, chosen by I18N_TRANSLATE_PROVIDER, then TRANSLATION_PROVIDER, then
 * azure:
 *
 *   groq   GROQ_API_KEY. Model GROQ_I18N_MODEL, default openai/gpt-oss-120b —
 *          not the 20b the live site translates with, because each model has
 *          its own daily allowance and UI copy is a one-off job where quality
 *          matters. The free tier allows ~200k tokens a day per model, which
 *          is roughly one locale's worth of blanks, so a full run spans days:
 *          the catalog is saved after every batch, and when the daily window
 *          is spent the run stops cleanly and the next run carries on.
 *   azure  AZURE_TRANSLATOR_KEY (+ _REGION, _ENDPOINT). Azure refuses sign-up
 *          from some countries, ours included, which is why Groq exists here.
 *
 * Without the chosen provider's key it explains what is missing and exits 0.
 * That matters: `npm run build` must not fail on a machine that has no key.
 *
 * Flags: --locale fr (repeatable), --max-requests N, --dry-run. I18N_DEBUG=1
 * prints the token usage of every request.
 *
 * --retranslate-truncated also re-sends translations that fail the gate's
 * length checks: before November 2026, machine runs kept only the first
 * paragraph of long help text (192 entries per locale at the time). They go
 * after the blanks, and an entry whose new translation fails the gate keeps
 * its old one, so this never makes an entry worse.
 *
 * Every translation passes checkTranslation (catalog-core.mjs) before it is
 * written: placeholders, Lingui tags, `#` and plural case keys must survive,
 * read the way `lingui compile` reads them. Anything that fails stays blank and
 * is listed at the end.
 */

import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  parsePo,
  serializePo,
  splitMessage,
  normaliseUnit,
  checkTranslation,
  systemPrompt,
  unitContext,
  responseSchema,
  parseDuration,
} from './catalog-core.mjs'

const LOCALES_DIR = resolve(process.cwd(), 'src/locales')
const TARGETS = ['fr', 'es']
const SOURCE = 'en'

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

function parseArgs(argv) {
  const args = { locales: [], maxRequests: Infinity, dryRun: false, retranslateTruncated: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--dry-run') args.dryRun = true
    else if (arg === '--retranslate-truncated') args.retranslateTruncated = true
    else if (arg === '--locale') args.locales.push(argv[++i])
    else if (arg.startsWith('--locale=')) args.locales.push(arg.slice(9))
    else if (arg === '--max-requests') args.maxRequests = Number(argv[++i])
    else if (arg.startsWith('--max-requests=')) args.maxRequests = Number(arg.slice(15))
    else throw new Error(`Unknown argument ${arg}`)
  }
  return args
}

const sleep = (seconds) => new Promise((r) => setTimeout(r, Math.ceil(seconds * 1000)))

/** Thrown when the provider's allowance is spent for longer than we will wait. */
class QuotaExhausted extends Error {
  constructor(retryAfter, detail) {
    super(detail)
    this.retryAfter = retryAfter
  }
}

/** Thrown when a batch is too big for one request; the caller splits it. */
class BatchTooLarge extends Error {}

// ── Azure ───────────────────────────────────────────────────────────────────

// Lingui tags, placeholders and `#` fenced so Azure's HTML mode leaves them.
const AZURE_TOKEN = /\{[^{}]+\}|<\/?\d+\/?>|#/g

function azureProvider({ key, region, endpoint }) {
  return {
    label: 'Azure Translator',
    // Azure's documented per-request ceilings. 45k rather than 50k because the
    // limit counts the JSON envelope.
    maxItems: 100,
    maxChars: 45_000,
    async translate(units, locale) {
      const url =
        `${endpoint.replace(/\/+$/, '')}/translate` +
        `?api-version=3.0&from=${SOURCE}&to=${encodeURIComponent(locale)}&textType=html`
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Ocp-Apim-Subscription-Key': key,
          'Ocp-Apim-Subscription-Region': region,
        },
        body: JSON.stringify(
          units.map((u) => ({
            Text: u.text.replace(AZURE_TOKEN, (t) => `<span translate="no">${t}</span>`),
          }))
        ),
      })
      if (!res.ok) {
        throw new Error(`Azure Translator ${res.status}: ${(await res.text()).slice(0, 300)}`)
      }
      const body = await res.json()
      const out = new Map()
      units.forEach((u, i) => {
        const text = body[i]?.translations?.[0]?.text
        if (typeof text === 'string') {
          out.set(u.id, text.replace(/<span translate="no">(.*?)<\/span>/g, '$1'))
        }
      })
      return { translations: out, tokens: 0 }
    },
  }
}

// ── Groq ────────────────────────────────────────────────────────────────────

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions'

/**
 * Groq's free tier meters requests per day and tokens per minute AND per day,
 * per model. The per-minute budget (8k for gpt-oss) is the one a batch hits,
 * so batches are sized by characters to stay well inside it, and the
 * x-ratelimit-* headers pace the next request before a 429 has to.
 */
function groqProvider({ key, model, maxWait }) {
  const strict = /^openai\/gpt-oss-|^qwen\/qwen3/.test(model)
  const limits = { remainingTokens: null, resetTokens: 0, remainingRequests: null, limitRequests: null }

  // ~3.5 characters per token for English UI text, plus the JSON around it.
  const estimate = (units, system) => {
    const chars = units.reduce((n, u) => n + u.text.length + (u.context?.length ?? 0), 0)
    const input = Math.ceil((system.length + chars) / 3.5) + units.length * 10
    const output = Math.ceil(units.reduce((n, u) => n + u.text.length, 0) / 2.6) + units.length * 7
    return { input, output }
  }

  return {
    label: `Groq ${model}`,
    // Bigger batches repeat the system prompt less often, which is most of the
    // saving there is; the per-minute budget is what caps them.
    maxItems: 70,
    maxChars: Number(process.env.GROQ_I18N_BATCH_CHARS) || 5_000,
    limits,
    async translate(units, locale) {
      const system = systemPrompt(locale)
      const { input, output } = estimate(units, system)
      // Room for the answer and gpt-oss's short reasoning, but the prompt plus
      // this reservation stays under the 8k-a-minute budget.
      // gpt-oss's "low" reasoning still varies from a few dozen tokens to over
      // a thousand per batch, hence the flat 1,500 on top.
      const maxTokens = Math.max(Math.min(Math.ceil(output * 1.4) + 1_500, 7_800 - input), 600)

      // Pace on what the last response said is left this minute.
      if (limits.remainingTokens !== null && limits.remainingTokens < input + output + 200) {
        await sleep(limits.resetTokens + 0.5)
      }

      // Short per-batch keys ("k0", "k1", …) instead of catalog indexes: every
      // id is spelled twice per item, once each way.
      const keys = units.map((_, i) => `k${i}`)
      const payload = units.map((u, i) =>
        u.context ? { id: keys[i], text: u.text, context: u.context } : { id: keys[i], text: u.text }
      )

      for (let attempt = 0; ; attempt++) {
        let res
        try {
          res = await fetch(GROQ_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
            body: JSON.stringify({
              model,
              temperature: 0,
              max_completion_tokens: maxTokens,
              ...(/^openai\/gpt-oss-/.test(model) ? { reasoning_effort: 'low' } : {}),
              messages: [
                { role: 'system', content: system },
                { role: 'user', content: JSON.stringify(payload) },
              ],
              response_format: strict
                ? { type: 'json_schema', json_schema: { name: 'translations', strict: true, schema: responseSchema(keys) } }
                : { type: 'json_object' },
            }),
          })
        } catch (error) {
          if (attempt >= 3) throw error
          await sleep(5 * (attempt + 1))
          continue
        }

        const header = (name) => res.headers.get(name)
        if (header('x-ratelimit-remaining-tokens') !== null) {
          limits.remainingTokens = Number(header('x-ratelimit-remaining-tokens'))
          limits.resetTokens = parseDuration(header('x-ratelimit-reset-tokens')) ?? 0
          limits.remainingRequests = Number(header('x-ratelimit-remaining-requests'))
          limits.limitRequests = Number(header('x-ratelimit-limit-requests'))
        }

        if (res.status === 429) {
          const detail = (await res.text().catch(() => '')).slice(0, 400)
          const wait = Number(header('retry-after')) || parseDuration(detail.match(/try again in ([\dhms.]+)/)?.[1]) || 60
          // A per-minute limit clears in seconds. A per-day one does not, and
          // waiting hours inside a terminal is worse than resuming tomorrow.
          if (wait > maxWait) throw new QuotaExhausted(wait, detail)
          console.log(`[i18n]   rate limited, waiting ${Math.ceil(wait)}s`)
          await sleep(wait + 0.5)
          continue
        }
        if (res.status === 413) throw new BatchTooLarge('request too large')
        if (res.status >= 500 && attempt < 3) {
          await sleep(10 * (attempt + 1))
          continue
        }
        if (!res.ok) {
          const detail = (await res.text().catch(() => '')).slice(0, 300)
          // Groq reports "too large for the per-minute budget", and an answer
          // that broke the schema (json_validate_failed), as a 400. Both are
          // cured by a smaller batch.
          if (/too large|context.length|max_tokens|maximum context|json_validate_failed/i.test(detail)) {
            throw new BatchTooLarge(detail)
          }
          throw new Error(`Groq ${res.status}: ${detail}`)
        }

        const body = await res.json()
        const choice = body.choices?.[0]
        const tokens = body.usage?.total_tokens ?? 0
        if (process.env.I18N_DEBUG) console.log('[i18n]   usage', JSON.stringify(body.usage), 'max', maxTokens, 'items', units.length)
        let parsed
        try {
          parsed = JSON.parse(choice?.message?.content ?? '')
        } catch {
          // Cut off by max tokens, or not JSON at all: smaller batches fix both.
          throw new BatchTooLarge(`unreadable answer (finish_reason ${choice?.finish_reason})`)
        }
        const out = new Map()
        units.forEach((unit, i) => {
          const text = parsed?.[keys[i]]
          if (typeof text === 'string') out.set(unit.id, text)
        })
        return { translations: out, tokens }
      }
    },
  }
}

// ── The run ─────────────────────────────────────────────────────────────────

function chooseProvider() {
  const which = (readEnv('I18N_TRANSLATE_PROVIDER') || readEnv('TRANSLATION_PROVIDER') || 'azure').toLowerCase()

  if (which === 'groq') {
    const key = readEnv('GROQ_API_KEY')
    if (!key) {
      console.log('[i18n] GROQ_API_KEY is not set — leaving catalogs untouched.')
      console.log('[i18n] Set it in .env (see .env.example) and re-run `npm run i18n:translate`.')
      return null
    }
    const model = readEnv('GROQ_I18N_MODEL') || 'openai/gpt-oss-120b'
    const maxWait = Number(readEnv('GROQ_I18N_MAX_WAIT_SECONDS')) || 900
    return groqProvider({ key, model, maxWait })
  }

  if (which === 'azure') {
    const key = readEnv('AZURE_TRANSLATOR_KEY')
    if (!key) {
      console.log('[i18n] AZURE_TRANSLATOR_KEY is not set — leaving catalogs untouched.')
      console.log('[i18n] Set it in .env (see .env.example), or use Groq with I18N_TRANSLATE_PROVIDER=groq.')
      return null
    }
    return azureProvider({
      key,
      region: readEnv('AZURE_TRANSLATOR_REGION') || 'global',
      endpoint: readEnv('AZURE_TRANSLATOR_ENDPOINT') || 'https://api.cognitive.microsofttranslator.com',
    })
  }

  console.log(`[i18n] "${which}" cannot fill catalogs; set I18N_TRANSLATE_PROVIDER to groq or azure.`)
  return null
}

/** Each blank entry as the units to translate, keeping one entry's units together. */
// What the gate says about a dropped paragraph. A placeholder mismatch in an
// old entry is not on this list: that one wants a human, not another guess.
const TRUNCATED = new Set(['line breaks differ', 'looks truncated'])

function planLocale(parsed, { retranslateTruncated = false } = {}) {
  const jobs = []
  const redo = []
  const skipped = []
  parsed.entries.forEach((entry, index) => {
    // The PO header is the entry with an empty msgid. Never translate it.
    if (entry.msgid === '') return
    const truncated =
      retranslateTruncated && entry.msgstr !== '' && TRUNCATED.has(checkTranslation(entry.msgid, entry.msgstr))
    if (entry.msgstr !== '' && !truncated) return
    const split = splitMessage(entry.msgid)
    if (split.error) {
      skipped.push({ msgid: entry.msgid, reason: split.error })
      return
    }
    const units = split.units.map((unit) => ({
      id: unit.key ? `${index}.${unit.key}` : String(index),
      key: unit.key,
      text: unit.text,
      context: unitContext(entry, unit, split),
    }))
    ;(truncated ? redo : jobs).push({ index, entry, split, units })
  })
  // Blanks first: they show English today, a truncated entry at least shows
  // its first paragraph.
  return { jobs: [...jobs, ...redo], blank: jobs.length + skipped.length, redo: redo.length, skipped }
}

function batchesOf(jobs, provider) {
  const batches = []
  let batch = []
  let chars = 0
  for (const job of jobs) {
    const size = job.units.reduce((n, u) => n + u.text.length, 0)
    const count = batch.reduce((n, j) => n + j.units.length, 0)
    if (batch.length > 0 && (count + job.units.length > provider.maxItems || chars + size > provider.maxChars)) {
      batches.push(batch)
      batch = []
      chars = 0
    }
    batch.push(job)
    chars += size
  }
  if (batch.length > 0) batches.push(batch)
  return batches
}

/** Translate one batch of entries; returns { written: Map, failed: [] , tokens }. */
async function runBatch(provider, locale, batch) {
  const units = batch.flatMap((job) => job.units)
  let result
  try {
    result = await provider.translate(units, locale)
  } catch (error) {
    if (!(error instanceof BatchTooLarge)) throw error
    console.log(`[i18n]   splitting a batch of ${batch.length}: ${error.message.slice(0, 160)}`)
    if (batch.length === 1) {
      return { written: new Map(), failed: [{ msgid: batch[0].entry.msgid, reason: error.message, job: batch[0] }], tokens: 0, requests: 1 }
    }
    // Halve and try again: one oversized or confusing item should not cost its neighbours.
    const mid = Math.ceil(batch.length / 2)
    const a = await runBatch(provider, locale, batch.slice(0, mid))
    const b = await runBatch(provider, locale, batch.slice(mid))
    return {
      written: new Map([...a.written, ...b.written]),
      failed: [...a.failed, ...b.failed],
      tokens: a.tokens + b.tokens,
      requests: a.requests + b.requests + 1,
    }
  }

  const written = new Map()
  const failed = []
  for (const job of batch) {
    const answers = new Map()
    let missing = false
    for (const unit of job.units) {
      const raw = result.translations.get(unit.id)
      if (typeof raw !== 'string') missing = true
      else answers.set(unit.key, normaliseUnit(unit.text, raw, locale))
    }
    if (missing) {
      failed.push({ msgid: job.entry.msgid, reason: 'no answer for this item', job })
      continue
    }
    const message = job.split.assemble(answers)
    const problem = checkTranslation(job.split.source, message)
    if (problem) {
      failed.push({ msgid: job.entry.msgid, reason: problem, got: message, job })
      continue
    }
    written.set(job.index, message)
  }
  return { written, failed, tokens: result.tokens, requests: 1 }
}

function save(path, parsed, translations) {
  // Write-then-rename, so a run killed mid-write never leaves half a catalog.
  const tmp = `${path}.tmp`
  writeFileSync(tmp, serializePo(parsed, translations))
  renameSync(tmp, path)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const provider = args.dryRun ? { label: 'dry run (Groq batch sizes)', maxItems: 70, maxChars: 5_000 } : chooseProvider()
  if (!provider) {
    console.log('[i18n] Untranslated messages render their English source, so nothing is broken.')
    return
  }

  const locales = args.locales.length > 0 ? args.locales : TARGETS
  let requests = 0
  let tokens = 0
  let stopped = null

  for (const locale of locales) {
    const path = resolve(LOCALES_DIR, locale, 'messages.po')
    if (!existsSync(path)) {
      console.warn(`[i18n] ${locale}: no catalog at ${path} — run \`npm run i18n:extract\` first.`)
      continue
    }

    const parsed = parsePo(readFileSync(path, 'utf8'))
    const { jobs, skipped, blank, redo } = planLocale(parsed, args)
    const blankBefore = blank
    const batches = batchesOf(jobs, provider)
    const redoNote = args.retranslateTruncated ? `, ${redo} truncated to redo` : ''
    console.log(`[i18n] ${locale}: ${blankBefore} blank${redoNote}, ${batches.length} batches via ${provider.label}`)

    if (args.dryRun) {
      const chars = jobs.reduce((n, j) => n + j.units.reduce((m, u) => m + u.text.length, 0), 0)
      console.log(`[i18n] ${locale}: ${chars} source characters; ${skipped.length} cannot be split`)
      continue
    }

    const translations = new Map()
    const failed = [...skipped]

    for (let b = 0; b < batches.length && !stopped; b++) {
      if (requests >= args.maxRequests) {
        stopped = `--max-requests ${args.maxRequests} reached`
        break
      }
      try {
        const result = await runBatch(provider, locale, batches[b])
        for (const [index, value] of result.written) translations.set(index, value)
        failed.push(...result.failed)
        requests += result.requests
        tokens += result.tokens
      } catch (error) {
        if (error instanceof QuotaExhausted) {
          stopped = `${provider.label} allowance spent; try again in ${Math.ceil(error.retryAfter / 60)} min`
          break
        }
        save(path, parsed, translations)
        throw error
      }
      // Saved after every batch: a run cut off by the daily cap loses nothing.
      save(path, parsed, translations)
      const l = provider.limits
      const today = l?.remainingRequests != null ? ` · ${l.remainingRequests}/${l.limitRequests} requests left today` : ''
      console.log(
        `[i18n] ${locale}: batch ${b + 1}/${batches.length} · ${translations.size} filled · ${failed.length} skipped · ${requests} requests · ${tokens.toLocaleString('en')} tokens${today}`
      )
    }

    // One more try for what failed the gate or went unanswered, in small
    // batches where a model is least likely to drift. Still failing → blank.
    const retry = failed.filter((f) => f.job)
    if (!stopped && retry.length > 0) {
      const kept = failed.filter((f) => !f.job)
      const again = []
      for (let i = 0; i < retry.length && !stopped; i += 8) {
        const chunk = retry.slice(i, i + 8)
        if (requests >= args.maxRequests) {
          again.push(...retry.slice(i))
          stopped = `--max-requests ${args.maxRequests} reached`
          break
        }
        try {
          const result = await runBatch(provider, locale, chunk.map((f) => f.job))
          for (const [index, value] of result.written) translations.set(index, value)
          again.push(...result.failed)
          requests += result.requests
          tokens += result.tokens
        } catch (error) {
          if (!(error instanceof QuotaExhausted)) throw error
          again.push(...retry.slice(i))
          stopped = `${provider.label} allowance spent; try again in ${Math.ceil(error.retryAfter / 60)} min`
        }
      }
      save(path, parsed, translations)
      failed.length = 0
      failed.push(...kept, ...again)
      console.log(`[i18n] ${locale}: retried ${retry.length}, ${retry.length - again.length} recovered`)
    }

    const blankAfter = blankBefore - [...translations.keys()].filter((i) => parsed.entries[i].msgstr === '').length
    console.log(`[i18n] ${locale}: blank ${blankBefore} → ${blankAfter} (${translations.size} filled this run)`)
    if (failed.length > 0) {
      console.log(`[i18n] ${locale}: left blank, to fix by hand or re-run:`)
      for (const f of failed) {
        console.log(`  - ${f.reason}: ${JSON.stringify(f.msgid).slice(0, 110)}`)
        if (f.got) console.log(`      got ${JSON.stringify(f.got).slice(0, 110)}`)
      }
    }
    if (stopped) break
  }

  if (stopped) console.log(`[i18n] Stopped early: ${stopped}. Re-run to continue; finished entries are kept.`)
  console.log(`[i18n] Done — ${requests} requests, ${tokens.toLocaleString('en')} tokens. Now run \`npm run i18n:compile\`.`)
}

main().catch((error) => {
  console.error('[i18n] failed:', error.message)
  process.exit(1)
})
