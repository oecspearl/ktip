import type { Profile, ProfileView } from '../types'

/**
 * The columns the member's own editor writes.
 *
 * Not every column on `profiles` — the photo and the banner are written by
 * their own studios, and everything else on the row is either derived, granted
 * or set somewhere that is not a profile editor.
 */
export type ProfileDraft = Pick<
  Profile,
  | 'display_name'
  | 'bio'
  | 'country'
  | 'organization'
  | 'industry'
  | 'roles'
  | 'skills'
  | 'interests'
  | 'open_to'
  | 'phone'
  | 'website'
  | 'languages'
>

/** Every key of a draft, for the callers that need to commit or snapshot all of it. */
export const DRAFT_KEYS = [
  'display_name',
  'bio',
  'country',
  'organization',
  'industry',
  'roles',
  'skills',
  'interests',
  'open_to',
  'phone',
  'website',
  'languages',
] as const satisfies readonly (keyof ProfileDraft)[]

/**
 * The nine fields `get_profile_view()` returns as NULL when `can_view` is
 * false (migrations 083 and 148). Everything else it returns is a teaser and
 * shows to anyone: the name, the photo, the banner, the roles, the country,
 * the tick, and when they joined.
 *
 * If a column is ever added to the RPC's gated set, add it here in the same
 * change — profile-visibility.test.ts pins this list precisely so that a
 * mismatch fails a test instead of leaking a private field into a preview.
 */
export const GATED_FIELDS = [
  'bio',
  'skills',
  'interests',
  'open_to',
  'organization',
  'industry',
  'phone',
  'website',
  'languages',
] as const satisfies readonly (keyof ProfileView)[]

/** A draft with every field of the profile it was seeded from. */
export function draftFrom(profile: Profile | null | undefined): ProfileDraft {
  return {
    display_name: profile?.display_name || '',
    bio: profile?.bio || '',
    country: profile?.country || '',
    organization: profile?.organization || '',
    industry: profile?.industry || '',
    roles: profile?.roles || [],
    skills: profile?.skills || [],
    interests: profile?.interests || [],
    open_to: profile?.open_to || [],
    phone: profile?.phone || '',
    website: profile?.website || '',
    languages: profile?.languages || [],
  }
}

/**
 * The row `get_profile_view()` would return for me — built here, from the
 * live draft, rather than fetched.
 *
 * Not an optimisation. `can_view_profile()` short-circuits on
 * `IF v_viewer = p_user_id THEN RETURN TRUE` (083), so asking the server for
 * your own view always answers "yes, everything", whatever your privacy
 * setting says. You cannot see your own locked profile through the RPC at
 * all; the gate has to be reproduced on this side or the preview is a lie.
 */
export function draftToView(profile: Profile, draft: ProfileDraft): ProfileView {
  return {
    id: profile.id,
    display_name: draft.display_name || null,
    avatar_url: profile.avatar_url,
    banner: profile.banner,
    avatar_style: profile.avatar_style,
    roles: draft.roles,
    country: draft.country || null,
    is_verified: profile.is_verified,
    created_at: profile.created_at,
    profile_visibility: profile.profile_visibility ?? 'public',
    // Your own view. asVisitorView() is what turns this into someone else's.
    can_view: true,
    bio: draft.bio || null,
    skills: draft.skills ?? null,
    interests: draft.interests ?? null,
    open_to: draft.open_to ?? null,
    organization: draft.organization || null,
    industry: draft.industry || null,
    phone: draft.phone || null,
    website: draft.website || null,
    languages: draft.languages ?? null,
    is_minor: profile.is_minor,
  }
}

/**
 * The same row as a member who is not connected to you would receive it.
 *
 * A public profile is unchanged — that is the honest answer, and saying so is
 * the point of the toggle for the majority who never locked anything.
 */
export function asVisitorView(view: ProfileView): ProfileView {
  if (view.profile_visibility !== 'private') return view

  const gated = Object.fromEntries(GATED_FIELDS.map((field) => [field, null]))
  return { ...view, ...gated, can_view: false }
}
