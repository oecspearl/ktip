import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { TrophyCard } from './TrophyCard'
import { requirementText } from '../../lib/achievement-copy'

/**
 * These exist because of a bug that shipped silently.
 *
 * `DetailGrid` and `requirementText` originally took Lingui's `t` as a
 * function parameter. The macro only transforms a tagged template whose tag
 * resolves to a macro import or to a `useLingui()` destructuring in the same
 * scope — a parameter is neither. The template survived to runtime, where
 * `i18n._(TemplateStringsArray)` returns `''`. Every label on the trophy
 * detail card rendered as an empty string, nothing threw, no console warning
 * appeared, `npm run i18n:check` reported clean (its check matches any
 * identifier *named* `t`), and `lingui extract` could never see the strings.
 *
 * It was found by looking at a screenshot. That is not a control. Asserting
 * the labels are non-empty is.
 */

const props = {
  name: 'Forum Pillar',
  description: 'Posted 50 times in the forums',
  icon: 'message-square',
  assetMap: {},
}

afterEach(cleanup)

describe('requirementText', () => {
  // The macro is what turns these into catalog lookups. If it stops being
  // applied they all collapse to '' and every assertion here fails.
  it('renders a translated phrase for a known check_key', () => {
    expect(requirementText('forum_activity', 50)).toBe('50 forum posts or replies')
  })

  it('uses the singular form at one', () => {
    expect(requirementText('projects_created', 1)).toBe('1 project created')
  })

  it('handles a key with no count in its phrasing', () => {
    expect(requirementText('is_verified', 1)).toBe('Identity verification completed')
  })

  // Silence beats a wrong sentence about how a badge is earned.
  it('returns null for an unknown key', () => {
    expect(requirementText('not_a_real_metric', 3)).toBeNull()
  })

  it('returns null when there is no threshold', () => {
    expect(requirementText('forum_activity', null)).toBeNull()
  })
})

describe('TrophyCard showcase', () => {
  it('renders every detail label as real text', () => {
    render(
      <TrophyCard
        {...props}
        size="lg"
        rarity="rare"
        tier="gold"
        trophyType="megaphone"
        category="Community"
        categoryKey="community"
        checkKey="forum_activity"
        checkValue={50}
        points={50}
        earnedAt="2026-03-08T00:00:00Z"
      />
    )

    for (const label of ['Date acquired', 'Worth', 'Tier', 'Category']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  // The sculpture is on the card at four times the size of any text on it.
  it('does not caption the artwork with its own name', () => {
    render(<TrophyCard {...props} size="lg" trophyType="megaphone" points={50} />)
    expect(screen.queryByText('Trophy')).not.toBeInTheDocument()
    expect(screen.queryByText('Megaphone')).not.toBeInTheDocument()
  })

  it('states rarity once, in the chip, and not as a detail row', () => {
    render(<TrophyCard {...props} size="lg" rarity="rare" points={50} earnedAt="2026-03-08T00:00:00Z" />)

    expect(screen.queryByText('Rarity')).not.toBeInTheDocument()
    expect(screen.getByText('Rare')).toBeInTheDocument()
  })

  it('shows the requirement and the category meaning as prose', () => {
    render(
      <TrophyCard
        {...props}
        size="lg"
        rarity="rare"
        categoryKey="community"
        checkKey="forum_activity"
        checkValue={50}
      />
    )

    expect(screen.getByText('What it takes')).toBeInTheDocument()
    expect(screen.getByText('50 forum posts or replies')).toBeInTheDocument()
    expect(screen.getByText(/keep the conversation going/i)).toBeInTheDocument()
  })
})

describe('TrophyCard holder counts', () => {
  it('shows the fraction alone below the percentage threshold', () => {
    render(<TrophyCard {...props} size="lg" holders={4} eligible={12} />)
    expect(screen.getByText('4 of 12 members')).toBeInTheDocument()
  })

  // A percentage of a dozen people is noise dressed as a statistic.
  it('adds a percentage once the membership can carry one', () => {
    render(<TrophyCard {...props} size="lg" holders={4} eligible={27} />)
    expect(screen.getByText('4 of 27 members · 15%')).toBeInTheDocument()
  })

  it('says no one has it rather than showing a zero', () => {
    render(<TrophyCard {...props} size="lg" locked holders={0} eligible={27} />)
    expect(screen.getByText('No one yet')).toBeInTheDocument()
  })

  // The RPC arrives in a later migration, and the hook is briefly pending on
  // every mount. Neither is "nobody has this".
  it('omits the row entirely when the counts are unavailable', () => {
    render(<TrophyCard {...props} size="lg" />)
    expect(screen.queryByText('Held by')).not.toBeInTheDocument()
  })
})
