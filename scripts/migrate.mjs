#!/usr/bin/env node
/**
 * Applies pending SQL migrations to the Supabase database.
 *
 * Usage — run from the repo root:
 *   node --env-file=.env scripts/migrate.mjs            # apply everything pending
 *   node --env-file=.env scripts/migrate.mjs --dry-run  # say what would run, touch nothing
 *   node --env-file=.env scripts/migrate.mjs --only 137,138
 *   node --env-file=.env scripts/migrate.mjs --baseline 135
 *
 * Requires SUPABASE_DB_URL (Supabase dashboard → Project Settings → Database →
 * Connection string). PostgREST cannot run DDL, so this talks to Postgres
 * directly; the service-role key is no use here.
 *
 * WHY A LEDGER, AND WHY IT HAS TO BE SEEDED
 *
 * Migrations were applied by hand through the SQL editor for the first 136 of
 * them, so the database has the schema and no record of how it got there. A
 * runner that assumed an empty ledger meant an empty database would replay 001
 * against a live platform. So the first run REFUSES unless it is told where the
 * history already stands:
 *
 *   --baseline N   record 001..N as applied without running them
 *
 * Every file in this repo is written to be idempotent, which is what makes a
 * conservative baseline safe: set it one below the last migration you are sure
 * of and let the runner re-apply the rest.
 *
 * Each file runs inside its own transaction. A failure rolls that file back and
 * stops the run — the ledger then names exactly where to resume, rather than
 * leaving a half-applied migration nobody can identify.
 *
 * Only files named `NNN_something.sql` are considered. The combined_*.sql and
 * _ALL_MIGRATIONS.sql bundles in the same directory are historical convenience
 * copies; running them would double-apply everything they contain.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations')
const FILE_PATTERN = /^(\d{3})_[A-Za-z0-9_.-]+\.sql$/

const argv = process.argv.slice(2)
const hasFlag = (name) => argv.includes(name)
const flagValue = (name) => {
  const index = argv.indexOf(name)
  return index >= 0 ? argv[index + 1] : undefined
}

const dryRun = hasFlag('--dry-run')
const baselineArg = flagValue('--baseline')
const onlyArg = flagValue('--only')

function listMigrations() {
  return readdirSync(MIGRATIONS_DIR)
    .map((name) => ({ name, match: name.match(FILE_PATTERN) }))
    .filter((entry) => entry.match)
    .map((entry) => ({
      name: entry.name,
      version: Number(entry.match[1]),
      path: join(MIGRATIONS_DIR, entry.name),
    }))
    .sort((a, b) => a.version - b.version || a.name.localeCompare(b.name))
}

const checksum = (sql) => createHash('sha256').update(sql).digest('hex').slice(0, 16)

async function main() {
  const connectionString = process.env.SUPABASE_DB_URL
  if (!connectionString) {
    console.error('SUPABASE_DB_URL is not set. Run with: node --env-file=.env scripts/migrate.mjs')
    process.exit(1)
  }

  const migrations = listMigrations()
  if (migrations.length === 0) {
    console.error(`No migrations found in ${MIGRATIONS_DIR}`)
    process.exit(1)
  }

  const client = new pg.Client({
    connectionString,
    // Supabase's pooler presents a certificate for the pooler host rather than
    // the project host. The connection is still TLS; this only stops the name
    // check from rejecting it.
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()

  try {
    const { rowCount: ledgerExists } = await client.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'schema_migrations'`
    )

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version     INT PRIMARY KEY,
        name        TEXT NOT NULL,
        checksum    TEXT,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        baselined   BOOLEAN NOT NULL DEFAULT FALSE
      )
    `)

    if (baselineArg !== undefined) {
      const upTo = Number(baselineArg)
      if (!Number.isInteger(upTo)) {
        console.error(`--baseline expects a migration number, got: ${baselineArg}`)
        process.exit(1)
      }
      const marked = migrations.filter((m) => m.version <= upTo)
      if (dryRun) {
        console.log(`[dry-run] would baseline ${marked.length} migration(s) up to ${upTo}`)
      } else {
        for (const migration of marked) {
          await client.query(
            `INSERT INTO schema_migrations (version, name, checksum, baselined)
             VALUES ($1, $2, $3, TRUE) ON CONFLICT (version) DO NOTHING`,
            [migration.version, migration.name, checksum(readFileSync(migration.path, 'utf8'))]
          )
        }
        console.log(`Baselined ${marked.length} migration(s) up to ${upTo} — not executed.`)
      }
    }

    const { rows: appliedRows } = await client.query('SELECT version FROM schema_migrations')
    const applied = new Set(appliedRows.map((row) => row.version))

    // A fresh ledger against a database that plainly predates it is the one
    // case where guessing is dangerous, so it is the one case that stops.
    if (!ledgerExists && applied.size === 0 && !onlyArg) {
      console.error(
        [
          'No migration ledger, and nothing baselined.',
          '',
          'This database was migrated by hand, so the runner cannot tell which files',
          'have already been applied. Tell it where history stands:',
          '',
          '  node --env-file=.env scripts/migrate.mjs --baseline 135',
          '',
          'or name exactly what to run:',
          '',
          '  node --env-file=.env scripts/migrate.mjs --only 137,138',
        ].join('\n')
      )
      process.exit(1)
    }

    let pending
    if (onlyArg) {
      const wanted = new Set(onlyArg.split(',').map((part) => Number(part.trim())))
      pending = migrations.filter((m) => wanted.has(m.version))
      const missing = [...wanted].filter((v) => !pending.some((m) => m.version === v))
      if (missing.length > 0) {
        console.error(`No migration file for: ${missing.join(', ')}`)
        process.exit(1)
      }
    } else {
      pending = migrations.filter((m) => !applied.has(m.version))
    }

    if (pending.length === 0) {
      console.log('Up to date — nothing to apply.')
      return
    }

    console.log(`${dryRun ? '[dry-run] would apply' : 'Applying'} ${pending.length} migration(s):`)
    for (const migration of pending) console.log(`  ${migration.name}`)
    if (dryRun) return

    for (const migration of pending) {
      const sql = readFileSync(migration.path, 'utf8')
      process.stdout.write(`  → ${migration.name} ... `)
      try {
        await client.query('BEGIN')
        await client.query(sql)
        await client.query(
          `INSERT INTO schema_migrations (version, name, checksum)
           VALUES ($1, $2, $3)
           ON CONFLICT (version) DO UPDATE SET
             name = EXCLUDED.name,
             checksum = EXCLUDED.checksum,
             applied_at = now(),
             baselined = FALSE`,
          [migration.version, migration.name, checksum(sql)]
        )
        await client.query('COMMIT')
        console.log('ok')
      } catch (error) {
        await client.query('ROLLBACK')
        console.log('FAILED')
        console.error(`\n${migration.name} was rolled back. Nothing after it ran.\n`)
        console.error(error.message)
        process.exitCode = 1
        return
      }
    }

    console.log('\nDone.')
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
