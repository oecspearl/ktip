import { describe, it, expect } from 'vitest'
import {
  ASSISTANT_CONVERSATION_ID,
  isAssistantConversation,
  resolveDestinations,
} from './assistant'
import { SITE_MAP } from './site-map'

const SIGNED_IN = { signedIn: true, isOecs: false }
const ADMIN = { signedIn: true, isOecs: true }
const GUEST = { signedIn: false, isOecs: false }

describe('isAssistantConversation', () => {
  it('matches only the sentinel', () => {
    expect(isAssistantConversation(ASSISTANT_CONVERSATION_ID)).toBe(true)
    expect(isAssistantConversation('a0000000-0000-0000-0000-000000000001')).toBe(false)
    expect(isAssistantConversation(null)).toBe(false)
    expect(isAssistantConversation(undefined)).toBe(false)
  })

  it('is not a UUID, so it cannot collide with a real conversation id', () => {
    expect(ASSISTANT_CONVERSATION_ID).not.toMatch(/^[0-9a-f-]{36}$/i)
  })
})

describe('resolveDestinations', () => {
  it('resolves real site-map ids to navigable chips', () => {
    const [chip] = resolveDestinations(['grants.browse'], SIGNED_IN)
    expect(chip.id).toBe('grants.browse')
    expect(chip.href).toBeTruthy()
    expect(chip.title.length).toBeGreaterThan(0)
  })

  it('preserves the order the navigator returned', () => {
    const ids = ['events.browse', 'grants.browse', 'projects.browse']
    expect(resolveDestinations(ids, SIGNED_IN).map((d) => d.id)).toEqual(ids)
  })

  it('drops ids that are not in the site map', () => {
    expect(resolveDestinations(['not.a.real.entry'], SIGNED_IN)).toEqual([])
  })

  it('drops entries with no href — a chip that goes nowhere is worse than none', () => {
    const hrefless = SITE_MAP.find((e) => !e.href)
    expect(hrefless, 'site map should still contain walkthrough-only entries').toBeTruthy()
    expect(resolveDestinations([hrefless!.id], ADMIN)).toEqual([])
  })

  it('hides admin destinations from a non-admin', () => {
    const adminEntry = SITE_MAP.find((e) => e.access === 'oecs' && e.href)
    expect(adminEntry).toBeTruthy()
    expect(resolveDestinations([adminEntry!.id], SIGNED_IN)).toEqual([])
    expect(resolveDestinations([adminEntry!.id], ADMIN)).toHaveLength(1)
  })

  it('hides auth-only destinations from a signed-out visitor', () => {
    const authEntry = SITE_MAP.find((e) => e.access === 'auth' && e.href)
    expect(authEntry).toBeTruthy()
    expect(resolveDestinations([authEntry!.id], GUEST)).toEqual([])
  })

  it('returns nothing for an empty id list', () => {
    expect(resolveDestinations([], SIGNED_IN)).toEqual([])
  })
})
