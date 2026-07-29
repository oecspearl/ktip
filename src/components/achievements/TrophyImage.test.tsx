import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { TrophyImage, resolveTrophy } from './TrophyImage'
import type { TrophyAsset, TrophyAssetMap } from '../../types'

function asset(type: string, tier: TrophyAsset['tier'], url: string | null, alt = ''): TrophyAsset {
  return {
    id: `${type}-${tier}`,
    type,
    tier,
    image_url: url,
    alt_text: alt,
    sort_order: 0,
    updated_at: '2026-01-01T00:00:00Z',
  }
}

const assetMap: TrophyAssetMap = {
  rocket: {
    bronze: asset('rocket', 'bronze', 'https://cdn.test/rocket-bronze.webp', 'Bronze rocket trophy'),
    gold: asset('rocket', 'gold', 'https://cdn.test/rocket-gold.webp', 'Gold rocket trophy'),
  },
  star: {
    gold: asset('star', 'gold', 'https://cdn.test/star-gold.webp', 'Gold star trophy'),
  },
  // Present in the grid but never uploaded — the common state before art lands.
  flame: { gold: asset('flame', 'gold', null) },
}

afterEach(cleanup)

describe('resolveTrophy', () => {
  it('prefers a per-badge image over the shared asset', () => {
    const result = resolveTrophy(assetMap, 'rocket', 'gold', 'https://cdn.test/one-off.webp')
    expect(result.url).toBe('https://cdn.test/one-off.webp')
  })

  it('falls back to the shared type x tier asset', () => {
    const result = resolveTrophy(assetMap, 'rocket', 'bronze', null)
    expect(result.url).toBe('https://cdn.test/rocket-bronze.webp')
    expect(result.alt).toBe('Bronze rocket trophy')
  })

  // Untiered badges are common (roughly a third of the seeded set) and must
  // still get artwork rather than silently dropping to an icon.
  it('treats a missing tier as gold', () => {
    expect(resolveTrophy(assetMap, 'rocket', null, null).url).toBe(
      'https://cdn.test/rocket-gold.webp'
    )
  })

  it('falls back to the star type when the badge has no trophy_type', () => {
    expect(resolveTrophy(assetMap, null, 'gold', null).url).toBe('https://cdn.test/star-gold.webp')
  })

  it('returns no url when the asset row exists but has no image yet', () => {
    expect(resolveTrophy(assetMap, 'flame', 'gold', null).url).toBeNull()
  })

  it('returns no url for a type that is not in the map at all', () => {
    expect(resolveTrophy(assetMap, 'unknown-type', 'gold', null).url).toBeNull()
  })
})

describe('TrophyImage', () => {
  it('renders the shared artwork with its alt text', () => {
    render(
      <TrophyImage icon="rocket" trophyType="rocket" tier="gold" assetMap={assetMap} name="Innovator" />
    )
    expect(screen.getByRole('img', { name: 'Gold rocket trophy' })).toBeTruthy()
  })

  // An admin can leave alt_text blank; an empty alt on a meaningful image
  // would make the trophy invisible to a screen reader.
  it('uses the badge name when the asset has no alt text', () => {
    render(<TrophyImage icon="flame" trophyType="star" tier="gold" assetMap={{
      star: { gold: asset('star', 'gold', 'https://cdn.test/star-gold.webp', '') },
    }} name="Century" />)
    expect(screen.getByRole('img', { name: 'Century' })).toBeTruthy()
  })

  it('renders an accessible icon when no artwork exists', () => {
    render(<TrophyImage icon="flame" trophyType="flame" tier="gold" assetMap={assetMap} name="On a Roll" />)
    const fallback = screen.getByRole('img', { name: 'On a Roll' })
    expect(fallback.tagName).not.toBe('IMG')
  })

  // A dead Storage URL must degrade to the icon rather than leaving a hole.
  it('falls through to the icon when the image fails to load', () => {
    render(
      <TrophyImage icon="rocket" trophyType="rocket" tier="gold" assetMap={assetMap} name="Innovator" />
    )
    const img = screen.getByRole('img', { name: 'Gold rocket trophy' })
    expect(img.tagName).toBe('IMG')

    fireEvent.error(img)

    const fallback = screen.getByRole('img', { name: 'Innovator' })
    expect(fallback.tagName).not.toBe('IMG')
  })

  it('marks unearned trophies as muted without hiding them', () => {
    const { container } = render(
      <TrophyImage
        icon="rocket"
        trophyType="rocket"
        tier="gold"
        assetMap={assetMap}
        name="Innovator"
        locked
      />
    )
    // Visible but clearly not earned — seeing the next rung is the incentive.
    expect(container.querySelector('.grayscale')).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Gold rocket trophy' })).toBeTruthy()
  })
})
