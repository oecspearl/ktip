import { describe, it, expect } from 'vitest'
import { asVisitorView, draftFrom, draftToView, GATED_FIELDS } from './profile-visibility'
import type { Profile, ProfileView } from '../types'

const profile = {
  id: 'u1',
  username: 'ada',
  display_name: 'Ada',
  bio: 'Builds things.',
  avatar_url: 'https://example.org/a.png',
  banner: null,
  avatar_style: null,
  country: 'Saint Lucia',
  organization: 'OECS',
  industry: 'Technology',
  roles: ['entrepreneur'],
  active_role: null,
  is_suspended: false,
  suspended_until: null,
  suspension_reason: null,
  skills: ['React'],
  interests: ['Climate'],
  open_to: ['mentoring'],
  phone: '+1 758 000 0000',
  website: 'https://example.org',
  languages: ['English'],
  is_verified: true,
  connection_count_visibility: 'public',
  profile_visibility: 'public',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
} as unknown as Profile

describe('draftFrom', () => {
  it('empties every absent field rather than carrying null into an input', () => {
    const draft = draftFrom(null)
    expect(draft.display_name).toBe('')
    expect(draft.roles).toEqual([])
    expect(draft.languages).toEqual([])
  })
})

describe('draftToView', () => {
  it('renders the draft, not the saved profile', () => {
    const draft = { ...draftFrom(profile), display_name: 'Ada L.', skills: ['React', 'GIS'] }
    const view = draftToView(profile, draft)
    expect(view.display_name).toBe('Ada L.')
    expect(view.skills).toEqual(['React', 'GIS'])
    // Teaser fields the studios own, not the draft.
    expect(view.avatar_url).toBe(profile.avatar_url)
  })

  it('is always your own view — the gate is applied afterwards', () => {
    const view = draftToView({ ...profile, profile_visibility: 'private' }, draftFrom(profile))
    expect(view.can_view).toBe(true)
    expect(view.bio).toBe('Builds things.')
  })

  it('reads a missing profile_visibility as public, as the column does', () => {
    const bare = { ...profile }
    delete (bare as Partial<Profile>).profile_visibility
    expect(draftToView(bare, draftFrom(bare)).profile_visibility).toBe('public')
  })

  it('empties a blank field to null rather than an empty string', () => {
    const view = draftToView(profile, { ...draftFrom(profile), bio: '', website: '' })
    expect(view.bio).toBeNull()
    expect(view.website).toBeNull()
  })
})

describe('asVisitorView', () => {
  it('leaves a public profile exactly as it is', () => {
    const view = draftToView(profile, draftFrom(profile))
    expect(asVisitorView(view)).toEqual(view)
  })

  it('nulls every gated field of a private profile and drops can_view', () => {
    const view = draftToView({ ...profile, profile_visibility: 'private' }, draftFrom(profile))
    const visitor = asVisitorView(view)

    expect(visitor.can_view).toBe(false)
    for (const field of GATED_FIELDS) {
      expect(visitor[field], field).toBeNull()
    }
  })

  it('keeps the teaser a private member still shows', () => {
    const view = draftToView({ ...profile, profile_visibility: 'private' }, draftFrom(profile))
    const visitor = asVisitorView(view)

    expect(visitor.display_name).toBe('Ada')
    expect(visitor.avatar_url).toBe(profile.avatar_url)
    expect(visitor.country).toBe('Saint Lucia')
    expect(visitor.roles).toEqual(['entrepreneur'])
    expect(visitor.is_verified).toBe(true)
    expect(visitor.created_at).toBe(profile.created_at)
  })

  /**
   * The list is pinned, not derived. get_profile_view() decides what a visitor
   * receives (083, 148) and this file only mirrors it — so a column added to
   * the RPC's gated set without a matching change here has to fail loudly,
   * rather than quietly showing a private field in the member's own preview.
   */
  it('gates exactly the nine fields the RPC nulls', () => {
    expect([...GATED_FIELDS].sort()).toEqual(
      [
        'bio',
        'industry',
        'interests',
        'languages',
        'open_to',
        'organization',
        'phone',
        'skills',
        'website',
      ].sort()
    )
  })

  it('never gates a teaser field', () => {
    const teaser: (keyof ProfileView)[] = [
      'id',
      'display_name',
      'avatar_url',
      'banner',
      'avatar_style',
      'roles',
      'country',
      'is_verified',
      'created_at',
      'profile_visibility',
      'is_minor',
    ]
    for (const field of teaser) {
      expect(GATED_FIELDS as readonly string[]).not.toContain(field)
    }
  })
})
