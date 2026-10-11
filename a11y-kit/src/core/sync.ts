import type { A11ySettings, StoredState, ThemeMode } from './config'

/** What the kit asks a host to keep on the server for each user. */
export interface SyncedBlob {
  v: 2
  updatedAt: number
  settings: Partial<A11ySettings>
  theme?: ThemeMode
}

/**
 * The host's side of syncing, rebuilt by the host on every render.
 *
 * `remote` is undefined while the user's record is still loading, null when
 * signed out or never saved, and the blob otherwise.
 */
export interface SyncAdapter {
  identity: string | null
  remote: SyncedBlob | null | undefined
  write(blob: SyncedBlob): Promise<void>
}

export type SyncDecision = 'adopt' | 'push' | 'none'

/**
 * Newest change wins, with one exception for shared devices.
 *
 * Settings changed while signed out belong to whoever signs in next: someone
 * who enlarged the text to read the sign-in page keeps it. Settings changed
 * under a DIFFERENT account do not: the second person on a library computer
 * gets their own settings, not a push of the first person's into their
 * account.
 */
export function decideSync(
  local: Pick<StoredState, 'updatedAt' | 'owner'>,
  identity: string,
  remote: SyncedBlob | null
): SyncDecision {
  const foreign = local.owner !== null && local.owner !== identity
  if (!remote) return !foreign && local.updatedAt > 0 ? 'push' : 'none'
  if (foreign) return 'adopt'
  if (remote.updatedAt > local.updatedAt) return 'adopt'
  if (local.updatedAt > remote.updatedAt) return 'push'
  return 'none'
}

export function toBlob(state: StoredState, theme?: ThemeMode): SyncedBlob {
  return { v: 2, updatedAt: state.updatedAt, settings: state.settings, ...(theme && { theme }) }
}

export function isSyncedBlob(value: unknown): value is SyncedBlob {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<SyncedBlob>
  return v.v === 2 && typeof v.updatedAt === 'number' && !!v.settings && typeof v.settings === 'object'
}
