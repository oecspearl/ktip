import { useCallback, useMemo } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { blobFromDisplayPrefs, displayPrefsFromBlob } from './display-prefs'
import type { ConfigureInput, SyncedBlob } from './viridion'

/** The signed-in member's settings, carried in profiles.display_prefs (155) */
export function useKtipA11ySync(): NonNullable<ConfigureInput['sync']> {
  const { user, profile, updateProfile } = useAuth()
  const prefs = profile && user && profile.id === user.id ? profile.display_prefs : undefined
  // undefined while the profile is loading: the service waits rather than
  // mistaking "not loaded yet" for "never saved"
  const remote = useMemo(
    () => (!user ? null : prefs === undefined ? undefined : blobFromDisplayPrefs(prefs)),
    [user, prefs]
  )
  // Fire-and-forget; the service retries on the next change, so a dropped write never toasts
  const save = useCallback(
    (blob: SyncedBlob) => updateProfile({ display_prefs: displayPrefsFromBlob(blob) }),
    [updateProfile]
  )
  return useMemo(() => ({ userId: user?.id ?? null, remote, save }), [user?.id, remote, save])
}
