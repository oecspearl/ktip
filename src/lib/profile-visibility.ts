import type {
  Profile,
  ProfileSectionKey,
  ProfileView,
  ProfileVisibility,
  SectionVisibility,
} from '../types'

/**
 * Every part of a profile with its own visibility (162), in page order.
 * profile_section_keys() in SQL lists the same keys; the column's CHECK
 * constraint refuses any other.
 */
export const PROFILE_SECTIONS = [
  'about',
  'details',
  'skills',
  'interests',
  'languages',
  'open_to',
  'organisation',
  'cv',
  'standing',
  'achievements',
  'projects',
  'events',
] as const satisfies readonly ProfileSectionKey[]

export function isProfileSectionKey(value: unknown): value is ProfileSectionKey {
  return (PROFILE_SECTIONS as readonly unknown[]).includes(value)
}

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
  | 'tagline'
  | 'social_links'
  | 'profile_look'
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
  'tagline',
  'social_links',
  'profile_look',
] as const satisfies readonly (keyof ProfileDraft)[]

/**
 * The eleven fields `get_profile_view()` returns as NULL when the viewer may
 * not see their section (083, 148, 162, 169 — see FIELD_SECTION). Everything
 * else it returns is a teaser and shows to anyone: the name, the photo, the
 * banner, the look, the roles, the country, the tick, and when they joined.
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
  'tagline',
  'social_links',
] as const satisfies readonly (keyof ProfileView)[]

/** The section each gated field belongs to — the CASEs in get_profile_view() (162, 169). */
export const FIELD_SECTION = {
  bio: 'about',
  tagline: 'about',
  social_links: 'details',
  organization: 'details',
  industry: 'details',
  phone: 'details',
  website: 'details',
  skills: 'skills',
  interests: 'interests',
  languages: 'languages',
  open_to: 'open_to',
} as const satisfies Record<(typeof GATED_FIELDS)[number], ProfileSectionKey>

/**
 * Whether one section is kept for connections. An override wins; without one
 * the section follows the master switch. Mirrors profile_private_sections(),
 * including failing closed on a value that is not exactly 'public'.
 */
export function sectionIsPrivate(
  key: ProfileSectionKey,
  master: ProfileVisibility | null | undefined,
  sections: SectionVisibility | null | undefined
): boolean {
  return (sections?.[key] ?? master ?? 'public') !== 'public'
}

/** Every section kept for connections, in page order. */
export function privateSections(
  master: ProfileVisibility | null | undefined,
  sections: SectionVisibility | null | undefined
): ProfileSectionKey[] {
  return PROFILE_SECTIONS.filter((key) => sectionIsPrivate(key, master, sections))
}

/**
 * The overrides after flipping one section. A section set back to what the
 * master says loses its entry instead of storing a redundant one, so the map
 * only ever holds the exceptions and the toolbar can count them.
 */
export function withSection(
  sections: SectionVisibility | null | undefined,
  master: ProfileVisibility | null | undefined,
  key: ProfileSectionKey,
  makePrivate: boolean
): SectionVisibility {
  const next: SectionVisibility = { ...sections }
  const value: ProfileVisibility = makePrivate ? 'private' : 'public'
  if (value === (master ?? 'public')) delete next[key]
  else next[key] = value
  return next
}

/** How many sections differ from the master switch — the toolbar's "except N". */
export function sectionExceptions(
  master: ProfileVisibility | null | undefined,
  sections: SectionVisibility | null | undefined
): number {
  const base = master ?? 'public'
  return PROFILE_SECTIONS.filter((key) => sections?.[key] && sections[key] !== base).length
}

/**
 * A PostgREST `or=(…)` body: this member shows `section` to everyone — an
 * explicit 'public', or no override on an open profile. sectionIsPrivate()
 * for a stranger, written as a filter, for the lists that read the profiles
 * table directly and so never pass through get_profile_view().
 */
export function sectionOpen(section: ProfileSectionKey): string {
  return `section_visibility->>${section}.eq.public,and(section_visibility->>${section}.is.null,profile_visibility.eq.public)`
}

/**
 * What a member page leaves out for this viewer.
 *
 * `hidden_sections` when the RPC sent it (162). Before 162 the master switch
 * was the whole answer, so a `can_view` of false hides every section — the
 * page then renders exactly what it did before the migration.
 */
export function hiddenSections(
  view: Pick<ProfileView, 'can_view' | 'hidden_sections'> | null | undefined
): ReadonlySet<ProfileSectionKey> {
  if (!view) return new Set()
  if (Array.isArray(view.hidden_sections)) {
    return new Set(view.hidden_sections.filter(isProfileSectionKey))
  }
  return view.can_view === false ? new Set(PROFILE_SECTIONS) : new Set()
}

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
    tagline: profile?.tagline || '',
    social_links: profile?.social_links || {},
    profile_look: profile?.profile_look ?? null,
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
    hidden_sections: [],
    tagline: draft.tagline || null,
    social_links: draft.social_links ?? null,
    profile_look: draft.profile_look ?? null,
  }
}

/**
 * The same row as a member who is not connected to you would receive it:
 * each field of a private section nulled, `hidden_sections` listing them, and
 * `can_view` false exactly when the master switch is closed.
 *
 * A profile with nothing private is unchanged — that is the honest answer, and
 * saying so is the point of the toggle for the majority who never locked
 * anything.
 */
export function asVisitorView(
  view: ProfileView,
  sections?: SectionVisibility | null
): ProfileView {
  const hidden = privateSections(view.profile_visibility, sections)
  if (hidden.length === 0) return view

  const gated = Object.fromEntries(
    GATED_FIELDS.filter((field) => hidden.includes(FIELD_SECTION[field])).map((field) => [
      field,
      null,
    ])
  )
  return {
    ...view,
    ...gated,
    can_view: view.profile_visibility !== 'private',
    hidden_sections: hidden,
  }
}
