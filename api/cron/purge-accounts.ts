import { createClient } from '@supabase/supabase-js'

export const config = { runtime: 'edge' }

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

/**
 * Close out the retention windows opened by migration 140.
 *
 * WHY A JOB AND NOT A TRIGGER. The window is the whole point — 90 days for a
 * deactivation, 7 for a scheduled deletion — and nothing happens in the
 * database at the moment it expires. Something has to come looking, and if
 * nothing does, "we keep it for a finite period" quietly becomes "we keep it".
 *
 * TWO ENDINGS, and they are not the same act:
 *
 *   deactivated       anonymise. The row stays so every foreign key pointing at
 *                     it stays; the person leaves it.
 *   pending_deletion  purge. The profile goes, and with it everything that
 *                     cascades from it; then the auth user, which SQL cannot
 *                     reach and only the service role can delete.
 *
 * AUTH is the same shape as the KPI snapshot: a shared secret, compared without
 * short-circuiting, and a refusal to run at all when it is unset. This endpoint
 * deletes accounts. An unauthenticated one would be the worst hole on the
 * platform.
 *
 * FAILURE IS PER-ACCOUNT. One member whose deletion errors must not stop the
 * other 499, and must not be silently skipped either — the response names them.
 */

/** Length-safe, non-short-circuiting compare — a timing oracle on a shared secret is still an oracle. */
function secretsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

interface DueAccount {
  user_id: string
  account_status: 'deactivated' | 'pending_deletion'
  purge_after: string
}

export default async function handler(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return json({ error: 'CRON_SECRET is not configured' }, 503)
  }

  const presented = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!presented || !secretsMatch(presented, secret)) {
    return json({ error: 'unauthorized' }, 401)
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'Supabase credentials are not configured' }, 503)
  }

  const admin = createClient(supabaseUrl, serviceKey)

  const { data, error } = await admin.rpc('accounts_due_for_purge')
  if (error) {
    return json({ error: 'could not read the purge queue', detail: error.message }, 502)
  }

  const due = (data || []) as DueAccount[]
  const anonymised: string[] = []
  const purged: string[] = []
  const failed: { user_id: string; step: string; detail: string }[] = []

  for (const account of due) {
    if (account.account_status === 'deactivated') {
      const { error: anonError } = await admin.rpc('anonymise_account', { p_user: account.user_id })
      if (anonError) {
        failed.push({ user_id: account.user_id, step: 'anonymise', detail: anonError.message })
        continue
      }
      anonymised.push(account.user_id)
      continue
    }

    // Profile first: purge_account() detaches the records that must outlive the
    // leaver before deleting the row. Doing the auth user first would leave a
    // profile nobody can sign into and nothing scheduled to clean it up.
    const { error: purgeError } = await admin.rpc('purge_account', { p_user: account.user_id })
    if (purgeError) {
      failed.push({ user_id: account.user_id, step: 'purge', detail: purgeError.message })
      continue
    }

    const { error: authError } = await admin.auth.admin.deleteUser(account.user_id)
    if (authError) {
      // The profile is already gone, so this is an orphaned auth user rather
      // than a half-deleted member. Named loudly: it needs a hand.
      failed.push({ user_id: account.user_id, step: 'auth-delete', detail: authError.message })
      continue
    }

    purged.push(account.user_id)
  }

  return json(
    {
      ok: failed.length === 0,
      due: due.length,
      anonymised: anonymised.length,
      purged: purged.length,
      failed,
    },
    failed.length === 0 ? 200 : 207
  )
}
