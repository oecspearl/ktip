#!/usr/bin/env node
/**
 * One-off: write the small upload-time siblings (src/lib/upload-variants.ts)
 * for images uploaded before the uploader started writing them.
 *
 * Usage — run from the repo root:
 *   node --env-file=.env scripts/backfill-image-variants.mjs           # dry run: lists what it would write
 *   node --env-file=.env scripts/backfill-image-variants.mjs --apply   # writes them
 *
 * Requires SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY
 * (or SUPABASE_SECRET_KEY). The service key bypasses the storage policies,
 * which is the point: it writes into every member's folder. Run it against
 * staging first.
 *
 * Safe to re-run. An object whose sibling already exists is skipped, a sibling
 * is never given a sibling, and writes use upsert:false, so a sibling the app
 * wrote while this was running is left alone rather than overwritten.
 *
 * Nothing breaks if this is never run: every consumer falls back to the
 * original after one 404 (useUploadVariant). Running it just removes that 404
 * and the full-size download behind it.
 */

import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { isVariantKey, variantKeyFor } from '../src/lib/upload-variants.ts'

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
const apply = process.argv.includes('--apply')

if (!url || !secret) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  console.error('Run as: node --env-file=.env scripts/backfill-image-variants.mjs [--apply]')
  process.exit(1)
}

/**
 * Which objects get which siblings — the same objects the app now writes them
 * for, so a backfilled bucket looks exactly like one filled by fresh uploads.
 *
 * Quality mirrors IMAGE_PRESETS in src/lib/constants.ts (that module cannot be
 * imported here: it pulls in the app's module graph). Keep the two in step.
 *
 * - avatars: the composite every DiamondAvatar reads (`<uid>/avatar`), and the
 *   employer logo, which uploads through the AVATAR preset too, get 128. The
 *   profile banner gets 640. Nothing else in the bucket (the portrait cut-out,
 *   the avatar source, portfolio images) is drawn small, so nothing else
 *   gets one.
 * - project-images, event-images: covers, 640. Every raster object.
 */
const RULES = [
  { bucket: 'avatars', match: /(^|\/)(avatar|employer-logo)\.(webp|jpe?g|png)$/i, widths: [128], quality: 85 },
  { bucket: 'avatars', match: /(^|\/)banner\.(webp|jpe?g|png)$/i, widths: [640], quality: 82 },
  { bucket: 'project-images', match: /\.(webp|jpe?g|png)$/i, widths: [640], quality: 82 },
  { bucket: 'event-images', match: /\.(webp|jpe?g|png)$/i, widths: [640], quality: 82 },
]

/** Parallel downloads + encodes. Small: this shares the project's egress with the live app. */
const CONCURRENCY = 4
const PAGE = 1000

const admin = createClient(url, secret, {
  auth: { autoRefreshToken: false, persistSession: false },
})

/**
 * Every file under `prefix`, recursively, as { key, metadata }.
 *
 * Storage has no recursive list: a folder comes back as an entry with a null
 * id, and has to be listed in turn.
 */
async function listAll(bucket, prefix = '') {
  const files = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin.storage
      .from(bucket)
      .list(prefix, { limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' } })
    if (error) throw new Error(`${bucket}/${prefix}: ${error.message}`)
    for (const entry of data ?? []) {
      const key = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.id === null) files.push(...(await listAll(bucket, key)))
      else files.push({ key, metadata: entry.metadata ?? {} })
    }
    if (!data || data.length < PAGE) break
  }
  return files
}

/** `max-age=3600` → `'3600'`, the form upload() takes. Undefined lets storage default. */
function cacheSeconds(metadata) {
  const match = /max-age=(\d+)/.exec(metadata.cacheControl ?? '')
  return match ? match[1] : undefined
}

async function makeSibling(bucket, original, width, quality) {
  const { data, error } = await admin.storage.from(bucket).download(original.key)
  if (error) throw new Error(`download: ${error.message}`)
  // rotate() with no argument applies EXIF orientation, as the app's decoder
  // does; an original that was never re-encoded can still carry it.
  return sharp(Buffer.from(await data.arrayBuffer()))
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .webp({ quality })
    .toBuffer()
}

async function runPool(jobs, worker) {
  let next = 0
  const runners = Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, async () => {
    while (next < jobs.length) await worker(jobs[next++])
  })
  await Promise.all(runners)
}

async function main() {
  console.log(apply ? 'APPLY: siblings will be written.' : 'DRY RUN: nothing will be written. Pass --apply to write.')

  const listed = new Map()
  const jobs = []
  for (const rule of RULES) {
    if (!listed.has(rule.bucket)) {
      try {
        listed.set(rule.bucket, await listAll(rule.bucket))
      } catch (error) {
        console.warn(`! Skipping ${rule.bucket}: ${error.message}`)
        listed.set(rule.bucket, [])
      }
    }
    const files = listed.get(rule.bucket)
    const present = new Set(files.map((f) => f.key))
    for (const file of files) {
      // Staged uploads awaiting the safety check, and siblings themselves.
      if (file.key.includes('.pending-') || isVariantKey(file.key) || !rule.match.test(file.key)) continue
      for (const width of rule.widths) {
        const sibling = variantKeyFor(file.key, width)
        if (!sibling || present.has(sibling)) continue
        jobs.push({ bucket: rule.bucket, original: file, sibling, width, quality: rule.quality })
      }
    }
  }

  console.log(`${jobs.length} sibling(s) missing.`)
  let written = 0
  let failed = 0
  let bytes = 0

  await runPool(jobs, async (job) => {
    const label = `${job.bucket}/${job.sibling}`
    if (!apply) {
      console.log(`  would write ${label}`)
      return
    }
    try {
      const body = await makeSibling(job.bucket, job.original, job.width, job.quality)
      const cacheControl = cacheSeconds(job.original.metadata)
      const { error } = await admin.storage.from(job.bucket).upload(job.sibling, body, {
        // Always WebP: the sibling's name says .webp whatever the original was,
        // and it is what the app's uploader writes too.
        contentType: 'image/webp',
        // Only when the original had one. Passing undefined would override the
        // client's own default and send `max-age=undefined`.
        ...(cacheControl ? { cacheControl } : {}),
        upsert: false,
      })
      if (error) throw new Error(error.message)
      written++
      bytes += body.length
      console.log(`  wrote ${label} (${Math.round(body.length / 1024)} kB)`)
    } catch (error) {
      failed++
      console.warn(`! ${label}: ${error.message}`)
    }
  })

  if (apply) {
    console.log(`Done: ${written} written (${Math.round(bytes / 1024)} kB), ${failed} failed.`)
    if (failed > 0) process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
