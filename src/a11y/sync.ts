import { useCallback, useMemo } from 'react'
import type { SyncAdapter, SyncedBlob } from '@a11y-kit'
import { useAuth } from '../contexts/AuthContext'
import { blobFromDisplayPrefs, displayPrefsFromBlob } from './display-prefs'

/** The kit's SyncAdapter over the signed-in member's profiles.display_prefs. */
export function useKtipA11ySync(): SyncAdapter {
  const { user, profile, updateProfile } = useAuth()
  const identity = user?.id ?? null
  // undefined while the profile is loading: the kit waits rather than
  // mistaking "not loaded yet" for "never saved"
  const remote = !user ? null : profile && profile.id === user.id ? blobFromDisplayPrefs(profile.display_prefs) : undefined

  // Fire-and-forget by design; the kit swallows a failure and retries on the
  // next change, so a dropped write never toasts
  const write = useCallback(
    (blob: SyncedBlob) => updateProfile({ display_prefs: displayPrefsFromBlob(blob) }),
    [updateProfile]
  )

  return useMemo(() => ({ identity, remote, write }), [identity, remote, write])
}
