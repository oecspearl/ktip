import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../../../contexts/AuthContext'
import { useToast } from '../../../../contexts/ToastContext'
import { profileUpdateSchema } from '../../../../lib/validation'
import { ROLE_DEFINITIONS } from '../../../../lib/permissions'
import { draftFrom, type ProfileDraft } from '../../../../lib/profile-visibility'
import { useLingui } from '@lingui/react/macro'
import type { Profile, UserRole } from '../../../../types'

/** Roles a member may grant themselves; everything else needs a reviewer. */
const SELF_ASSIGNABLE_SLUGS = new Set<string>(
  ROLE_DEFINITIONS.filter((r) => r.selfAssignable).map((r) => r.slug)
)

/** The draft keys the update schema actually validates. `roles` is not one. */
const VALIDATED = new Set(Object.keys(profileUpdateSchema.shape))

/** Which keys hold a list, and so must be written through as-is. */
const LIST_KEYS = new Set<keyof ProfileDraft>([
  'roles',
  'skills',
  'interests',
  'open_to',
  'languages',
])

export type CommitResult = { ok: true } | { ok: false; errors: Record<string, string> }

export interface ProfileDraftApi {
  draft: ProfileDraft
  set: <K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) => void
  /** The current value of these keys, to put back if the editor is cancelled. */
  snapshot: (keys: readonly (keyof ProfileDraft)[]) => Partial<ProfileDraft>
  restore: (snap: Partial<ProfileDraft>) => void
  /** Validate and write ONLY these keys. Never throws; reports by return value. */
  commit: (keys: readonly (keyof ProfileDraft)[]) => Promise<CommitResult>
  saving: boolean
}

/**
 * One draft behind every block editor on the profile tab.
 *
 * It is shared rather than per-modal because the preview is the point: the
 * canvas renders the draft, so a keystroke in the Skills dialog has to reach
 * the chips behind it. A modal that owned its own copy would leave the preview
 * showing the saved profile until Save, which is the thing this screen exists
 * to stop doing.
 *
 * Writes are narrow — `commit(['skills'])` validates and PATCHes skills alone.
 * The twelve-field form it replaces validated all twelve on every save, so a
 * malformed website blocked a skills edit, and every save resubmitted `roles`
 * into the teeth of the 063 guard trigger.
 *
 * @param paused While true the draft is left alone. Pass "a modal is open":
 *   the draft can only diverge from the server while one is, so re-seeding
 *   whenever none is open keeps the two in step with no per-key bookkeeping.
 */
export function useProfileDraft(paused: boolean): ProfileDraftApi {
  const { t } = useLingui()
  const auth = useAuth()
  const toast = useToast()
  const [draft, setDraft] = useState<ProfileDraft>(() => draftFrom(auth.profile))
  const [saving, setSaving] = useState(false)

  // Re-seed from the server whenever nothing is being edited. This replaces a
  // one-shot `initialized` guard that hydrated once and never again: every
  // commit invalidates ['profile', id], so auth.profile legitimately changes
  // after each save, and a draft that ignored that would drift permanently
  // from what was actually stored.
  useEffect(() => {
    if (!paused && auth.profile) setDraft(draftFrom(auth.profile))
  }, [auth.profile, paused])

  const set = useCallback<ProfileDraftApi['set']>((key, value) => {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }, [])

  const snapshot = useCallback<ProfileDraftApi['snapshot']>(
    (keys) => Object.fromEntries(keys.map((key) => [key, draft[key]])) as Partial<ProfileDraft>,
    [draft]
  )

  const restore = useCallback<ProfileDraftApi['restore']>((snap) => {
    setDraft((prev) => ({ ...prev, ...snap }))
  }, [])

  const commit = useCallback<ProfileDraftApi['commit']>(
    async (keys) => {
      // The schema is `.optional()` throughout, which accepts `undefined` and
      // rejects `null`, while the columns want NULL for "nothing". Hence the
      // asymmetry between what is validated and what is written — encoded once,
      // here, rather than at every call site.
      const input: Record<string, unknown> = {}
      for (const key of keys) {
        if (!VALIDATED.has(key)) continue
        input[key] = LIST_KEYS.has(key) ? draft[key] : draft[key] || undefined
      }

      const shape = Object.fromEntries(Object.keys(input).map((key) => [key, true]))
      if (Object.keys(shape).length > 0) {
        const result = (profileUpdateSchema.pick(shape as never) as typeof profileUpdateSchema)
          .safeParse(input)
        if (!result.success) {
          const errors: Record<string, string> = {}
          for (const issue of result.error.issues) {
            const field = issue.path[0]?.toString()
            if (field) errors[field] = issue.message
          }
          return { ok: false, errors }
        }
      }

      const patch: Partial<Profile> = {}
      for (const key of keys) {
        if (key === 'roles') {
          // Only self-assignable roles are submitted. Verification-gated roles
          // (student, faculty, sme, …) are granted by an institution, a chamber
          // or an admin, and the profiles guard trigger rejects a self-grant —
          // sending the full array back would make the save fail outright.
          patch.roles = [
            ...(auth.profile?.roles || []).filter((r) => !SELF_ASSIGNABLE_SLUGS.has(r)),
            ...draft.roles.filter((r) => SELF_ASSIGNABLE_SLUGS.has(r)),
          ] as UserRole[]
        } else if (LIST_KEYS.has(key)) {
          Object.assign(patch, { [key]: draft[key] })
        } else {
          Object.assign(patch, { [key]: draft[key] || null })
        }
      }

      setSaving(true)
      try {
        await auth.updateProfile(patch)
        toast.success(t`Profile updated!`)
        return { ok: true }
      } catch (err: any) {
        toast.error(err.message || t`Failed to update profile`)
        // Deliberately not a field error: the modal stays open with what the
        // member typed still in the draft, so a retry costs nothing.
        return { ok: false, errors: {} }
      } finally {
        setSaving(false)
      }
    },
    [auth, draft, t, toast]
  )

  return { draft, set, snapshot, restore, commit, saving }
}
