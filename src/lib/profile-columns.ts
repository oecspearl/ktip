/**
 * What a client may read off the `profiles` table.
 *
 * Migration 168 revoked SELECT on `profiles` from anon and authenticated and
 * granted it back on these columns only — what a card, an author chip or the
 * DM gate needs to know about someone else. Everything else is read through
 * a path that decides per caller:
 *
 *   the member's own row   rpc('get_my_profile')          (167)
 *   another member         from('member_profiles') view   (167), or
 *                          rpc('get_profile_view')        (162)
 *   the admin users list   rpc('admin_member_rows')       (167)
 *
 * So `select('*')` on profiles, a `profiles(*)` embed, or naming a column not
 * listed here fails with 42501 — and so does `.update().select()` that returns
 * one. profile-columns.test.ts pins this list against the GRANTs in the
 * migrations and scans the client for reads outside it. A migration that
 * grants a new column adds it here in the same change.
 */
export const PROFILE_PUBLIC_COLUMNS = [
  'id',
  'username',
  'display_name',
  'avatar_url',
  'avatar_style',
  'banner',
  'country',
  'roles',
  'active_role',
  'is_verified',
  'verified_at',
  'created_at',
  'updated_at',
  'profile_visibility',
  'section_visibility',
  'is_suspended',
  'account_status',
  // 169 — presentation only, a teaser like avatar_style and banner.
  'profile_look',
] as const

/**
 * An embedded person — author, owner, organizer, requester, member. Every
 * consumer of these embeds reads some of the name, the avatar, the country,
 * the roles and the profile link; nothing more.
 */
export const PROFILE_CHIP = 'id, username, display_name, avatar_url, country, roles'
