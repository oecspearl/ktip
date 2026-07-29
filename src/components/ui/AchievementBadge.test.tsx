import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { AchievementBadge, LockedAchievementBadge } from './AchievementBadge'
import type { BadgeDefinition, UserBadge } from '../../types'

function badge(overrides: Partial<BadgeDefinition> = {}): BadgeDefinition {
  return {
    id: 'b1',
    slug: 'first_project',
    name: 'Innovator',
    description: 'Created your first project',
    icon: 'rocket',
    color: 'ocean',
    created_at: '2026-01-01T00:00:00Z',
    rarity: 'common',
    ...overrides,
  }
}

function userBadge(overrides: Partial<BadgeDefinition> = {}): UserBadge {
  return {
    id: 'ub1',
    user_id: 'u1',
    badge_id: 'b1',
    awarded_at: '2026-06-01T00:00:00Z',
    badge: badge(overrides),
  }
}

afterEach(cleanup)

describe('AchievementBadge', () => {
  it('renders the badge name', () => {
    render(<AchievementBadge userBadge={userBadge()} />)
    expect(screen.getByText(/Innovator/)).toBeTruthy()
  })

  it('renders nothing when the badge relation was not embedded', () => {
    const { container } = render(
      <AchievementBadge userBadge={{ ...userBadge(), badge: undefined }} />
    )
    expect(container.firstChild).toBeNull()
  })

  // Tier is part of a laddered badge's identity ("Innovator, gold"); leaving
  // it to the artwork alone would hide it from anyone not seeing the image.
  it('states the tier in text rather than by artwork alone', () => {
    render(<AchievementBadge userBadge={userBadge({ tier: 'gold' })} />)
    expect(screen.getByText(/Gold/)).toBeTruthy()
  })

  it('omits the tier suffix for untiered badges', () => {
    render(<AchievementBadge userBadge={userBadge({ tier: null })} />)
    expect(screen.queryByText(/Bronze|Silver|Gold|Diamond/)).toBeNull()
  })

  it('colours by rarity when asked', () => {
    const { container } = render(
      <AchievementBadge userBadge={userBadge({ rarity: 'legendary' })} byRarity />
    )
    // Legendary is the navy fill with a yellow rim, not the badge's own colour.
    expect(container.innerHTML).toContain('bg-ktip-ocean-700')
  })

  it('supports the sun colour added for high tiers', () => {
    const { container } = render(<AchievementBadge userBadge={userBadge({ color: 'sun' })} />)
    expect(container.innerHTML).toContain('ktip-sun-')
  })

  // 067 seeds icon names that did not exist in 039's seven-icon map.
  it('falls back to a generic medal for an unknown icon name', () => {
    const { container } = render(
      <AchievementBadge userBadge={userBadge({ icon: 'not-a-real-icon' })} />
    )
    expect(container.querySelector('svg')).toBeTruthy()
    expect(screen.getByText(/Innovator/)).toBeTruthy()
  })
})

describe('LockedAchievementBadge', () => {
  it('shows the name but marks it unearned', () => {
    render(<LockedAchievementBadge badge={badge()} />)
    const pill = screen.getByTitle(/not yet earned/)
    expect(pill).toBeTruthy()
    expect(screen.getByText(/Innovator/)).toBeTruthy()
  })
})
