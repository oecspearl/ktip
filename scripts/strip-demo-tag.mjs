/**
 * One-time cleanup: strip the legacy "[demo-seed] " prefix from seeded
 * grant/project titles so it stops showing in the UI.
 *
 * Usage: node scripts/strip-demo-tag.mjs [--dry]
 * Requires VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    })
)

const url = env.VITE_SUPABASE_URL
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

const dry = process.argv.includes('--dry')
const db = createClient(url, serviceKey, { auth: { persistSession: false } })

const TAG = '[demo-seed]'
const strip = (s) => s.replace(/^\[demo-seed\]\s*/, '')

for (const table of ['grants', 'projects']) {
  const { data, error } = await db.from(table).select('id,title').like('title', `${TAG}%`)
  if (error) throw error
  if (!data.length) {
    console.log(`${table}: nothing tagged`)
    continue
  }
  for (const row of data) {
    const next = strip(row.title)
    console.log(`${table}: "${row.title}" → "${next}"`)
    if (dry) continue
    const upd = await db.from(table).update({ title: next }).eq('id', row.id)
    if (upd.error) throw upd.error
  }
  console.log(`${table}: ${dry ? 'would update' : 'updated'} ${data.length} row(s)`)
}
