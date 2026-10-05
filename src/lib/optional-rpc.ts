import { supabase } from './supabase'

/**
 * Calling an RPC that may not be deployed yet.
 *
 * Every round-trip-saving RPC ships its client first, with the old multi-query
 * path kept as a fallback, so the client can deploy ahead of the migration and
 * a migration rollback cannot take a page down. useMemberStats (114) set the
 * pattern; this is it, shared.
 *
 * A missing function costs one failed probe, then is remembered for the tab
 * session. sessionStorage rather than localStorage, so a deploy that adds the
 * function is picked up on the next reload instead of never.
 */

/** PostgREST's "no such function" and Postgres' undefined_function. */
export const RPC_MISSING_CODES = new Set(['PGRST202', '42883'])

const STORAGE_PREFIX = 'ktip_rpc_absent:'
const absent = new Map<string, boolean>()

export function isRpcAbsent(name: string): boolean {
  const known = absent.get(name)
  if (known !== undefined) return known
  let value = false
  try {
    value = sessionStorage.getItem(STORAGE_PREFIX + name) === '1'
  } catch {
    // Storage disabled: the in-memory flag still covers this page's lifetime.
  }
  absent.set(name, value)
  return value
}

export function markRpcAbsent(name: string): void {
  absent.set(name, true)
  try {
    sessionStorage.setItem(STORAGE_PREFIX + name, '1')
  } catch {
    // See isRpcAbsent.
  }
}

/**
 * The RPC's result, or `undefined` when this deployment does not have it.
 *
 * Any other error is thrown: an RLS refusal or an outage must not be quietly
 * replaced by a fallback that will fail the same way, only slower.
 */
export async function callOptionalRpc<T>(
  name: string,
  args?: Record<string, unknown>
): Promise<T | undefined> {
  if (isRpcAbsent(name)) return undefined
  const { data, error } = await (supabase as any).rpc(name, args)
  if (error) {
    if (RPC_MISSING_CODES.has(error.code)) {
      markRpcAbsent(name)
      return undefined
    }
    throw error
  }
  return data as T
}

/** Test seam. */
export function __resetOptionalRpc(): void {
  absent.clear()
}
