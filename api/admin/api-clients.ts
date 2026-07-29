import { requirePermission } from '../_lib/require-permission'

export const config = { runtime: 'edge' }

/**
 * Issues, lists and revokes the API keys that partner platforms use to pull
 * /api/partner/v1/employers.
 *
 * Admin-gated with the same preamble as the rest of api/admin/*: caller's JWT
 * verified through an anon client, then 'oecs' in profiles.roles, then a
 * separate service-role client for the privileged write.
 *
 * The plaintext key exists exactly once — in the body of the `create` response.
 * Only its SHA-256 is stored, so nobody, including an OECS admin with database
 * access, can recover it afterwards. Losing it means issuing a new one and
 * revoking the old, which is the property that makes a leaked backup harmless.
 */

const PREFIX_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'
const ALLOWED_SCOPES = ['employers:read']

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

function randomPrefix(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  // Modulo bias over a 36-letter alphabet is negligible here: the prefix is an
  // identifier, not a secret. All the entropy that matters is in the secret.
  return Array.from(bytes, (b) => PREFIX_ALPHABET[b % PREFIX_ALPHABET.length]).join('')
}

function randomSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export default async function handler(request: Request) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const guard = await requirePermission(request, 'org:manage')
  if (!guard.ok) return guard.response
  const { callerId, adminClient: admin } = guard

  let body: any
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const action = String(body?.action ?? '')

  // ---- list -------------------------------------------------------------
  if (action === 'list') {
    // Explicit column list: key_hash must not reach the browser even though the
    // service role can read it.
    const { data, error } = await admin
      .from('api_clients')
      .select('id,name,key_prefix,scopes,last_used_at,revoked_at,created_by,created_at')
      .order('created_at', { ascending: false })

    if (error) return json({ error: error.message }, 400)
    return json({ clients: data ?? [] }, 200)
  }

  // ---- create -----------------------------------------------------------
  if (action === 'create') {
    const name = String(body?.name ?? '').trim().slice(0, 120)
    if (!name) return json({ error: 'name is required' }, 400)

    const requested: string[] = Array.isArray(body?.scopes) ? body.scopes.map(String) : []
    const scopes = requested.filter((s) => ALLOWED_SCOPES.includes(s))
    if (scopes.length === 0) {
      return json({ error: `scopes must include one of: ${ALLOWED_SCOPES.join(', ')}` }, 400)
    }

    const prefix = `ktip_${randomPrefix()}`
    const secret = randomSecret()
    const plaintext = `${prefix}_${secret}`
    const keyHash = await sha256Hex(plaintext)

    const { data, error } = await admin
      .from('api_clients')
      .insert({
        name,
        key_prefix: prefix,
        key_hash: keyHash,
        scopes,
        created_by: callerId,
      })
      .select('id,name,key_prefix,scopes,created_at')
      .single()

    if (error) return json({ error: error.message }, 400)

    return json(
      {
        client: data,
        key: plaintext,
        warning:
          'This key is shown once and is not recoverable. Store it now; if it is lost, revoke this client and issue a new one.',
      },
      201
    )
  }

  // ---- revoke -----------------------------------------------------------
  if (action === 'revoke') {
    const id = String(body?.id ?? '')
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'id is required' }, 400)

    // Idempotent: re-revoking keeps the original timestamp, so the audit answer
    // to "when did this key stop working" stays truthful.
    const { data, error } = await admin
      .from('api_clients')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id)
      .is('revoked_at', null)
      .select('id')

    if (error) return json({ error: error.message }, 400)
    if (!data || data.length === 0) {
      // Either unknown id or already revoked — both mean "not active now".
      const { data: existing } = await admin.from('api_clients').select('id').eq('id', id).maybeSingle()
      if (!existing) return json({ error: 'not_found' }, 404)
    }
    return json({ success: true }, 200)
  }

  return json({ error: 'Unknown action' }, 400)
}
