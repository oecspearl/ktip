import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  cardFacts,
  cleanId,
  itemCard,
  loadShareable,
  ogHtml,
  rowDescription,
  siteCard,
} from '../../../api/_lib/share-og'

/**
 * Link-preview crawlers read these tags. They are the only thing a stranger's
 * phone sees of a shared item, so: escaped, public items only, and the right
 * picture.
 */

const ORIGIN = 'https://ktip.test'

const project = {
  id: '6f1c2a4e-1111-4222-8333-944455556666',
  slug: 'educarib-platform',
  title: 'EduCarib Platform',
  summary: 'Lessons download overnight, so students can learn when the Wi-Fi drops.',
  description: '<p>Longer text.</p>',
  image_url: 'https://abc.supabase.co/storage/v1/object/public/project-images/seed/projects/x.webp?v=3',
  is_public: true,
  status: 'active',
}

/** A stand-in for the service-role client: one row per table, filtered by the column asked for. */
function fakeAdmin(rows: Record<string, Record<string, unknown>[]>): SupabaseClient {
  return {
    from(table: string) {
      let match: Record<string, unknown> | null = null
      const q = {
        select: () => q,
        eq: (col: string, val: unknown) => {
          match = (rows[table] || []).find((r) => r[col] === val) ?? null
          return q
        },
        maybeSingle: async () => ({ data: match, error: null }),
      }
      return q
    },
    rpc: async (_fn: string, args: { p_slug: string }) => ({
      data: (rows.employers || []).filter((r) => r.slug === args.p_slug),
      error: null,
    }),
  } as unknown as SupabaseClient
}

describe('cleanId', () => {
  it('takes slugs and uuids, lowercased', () => {
    expect(cleanId('project', 'EduCarib-Platform')).toBe('educarib-platform')
    expect(cleanId('event', project.id.toUpperCase())).toBe(project.id)
  })

  it('refuses anything else', () => {
    expect(cleanId('project', '../etc')).toBeNull()
    expect(cleanId('project', 'a b')).toBeNull()
    expect(cleanId('project', '')).toBeNull()
    expect(cleanId('org', project.id)).toBeNull()
  })
})

describe('loadShareable', () => {
  it('finds a public project by slug or id', async () => {
    const admin = fakeAdmin({ projects: [project] })
    expect(await loadShareable(admin, 'project', 'educarib-platform')).toMatchObject({ title: 'EduCarib Platform' })
    expect(await loadShareable(admin, 'project', project.id)).toMatchObject({ title: 'EduCarib Platform' })
  })

  it('hides private projects, drafts and unverified businesses', async () => {
    const admin = fakeAdmin({
      projects: [{ ...project, is_public: false }],
      events: [{ id: project.id, slug: 'draft-event', title: 'Draft', status: 'draft' }],
      employers: [{ slug: 'acme', legal_name: 'Acme', verification_status: 'pending' }],
    })
    expect(await loadShareable(admin, 'project', 'educarib-platform')).toBeNull()
    expect(await loadShareable(admin, 'event', 'draft-event')).toBeNull()
    expect(await loadShareable(admin, 'org', 'acme')).toBeNull()
  })
})

describe('itemCard', () => {
  it('points at the canonical page and the JPEG card', () => {
    const card = itemCard(ORIGIN, 'project', project)
    expect(card.title).toBe('EduCarib Platform')
    expect(card.url).toBe(`${ORIGIN}/projects/educarib-platform`)
    // Not under /api/: robots.txt closes it, and LinkedIn obeys that.
    expect(card.image).toMatch(/^https:\/\/ktip\.test\/og\/project\/educarib-platform\.jpg\?v=\w+$/)
    expect(card.description).toContain('Lessons download overnight')
  })

  it('keeps the share tags and stamp in og:url, and nothing else from the query', () => {
    const shared = new URLSearchParams('og=project&id=educarib-platform&utm_source=linkedin&utm_medium=share&lang=fr&s=mh2k9x1&evil=<x>')
    const card = itemCard(ORIGIN, 'project', project, shared)
    expect(card.url).toBe(`${ORIGIN}/projects/educarib-platform?utm_source=linkedin&utm_medium=share&lang=fr&s=mh2k9x1`)
    const odd = itemCard(ORIGIN, 'project', project, new URLSearchParams('s="><script>'))
    expect(odd.url).toBe(`${ORIGIN}/projects/educarib-platform`)
  })

  it('draws a card even when the item has no photo, since the facts go on it', () => {
    expect(itemCard(ORIGIN, 'project', { ...project, image_url: null }).image).toContain('/og/project/')
  })

  it('changes the image address when anything drawn on it changes', () => {
    const v = (row: Record<string, unknown>) => new URL(itemCard(ORIGIN, 'project', row).image).searchParams.get('v')
    expect(v({ ...project, image_url: 'a.webp?v=2' })).not.toBe(v(project))
    expect(v({ ...project, title: 'EduCarib' })).not.toBe(v(project))
    expect(v({ ...project, phase: 'launch' })).not.toBe(v(project))
    expect(v({ ...project, summary: 'Different summary.' })).toBe(v(project))
  })
})

describe('cardFacts', () => {
  it('gives funding its award and closing date', () => {
    expect(
      cardFacts('grant', { amount_min: 25000, amount_max: 150000, currency: 'XCD', deadline: '2027-01-15T12:00:00Z' })
    ).toEqual(['EC$25,000 to EC$150,000', 'Closes 15 January 2027'])
  })
})

describe('rowDescription', () => {
  it('leads an event with its dates and place', () => {
    const text = rowDescription('event', {
      start_date: '2026-12-04T14:00:00Z',
      end_date: '2026-12-06T20:00:00Z',
      is_virtual: true,
      location: null,
      summary: 'Build for the region.',
    })
    expect(text).toBe('4–6 December 2026 · Online. Build for the region.')
  })

  it('stays short', () => {
    expect(rowDescription('project', { summary: 'word '.repeat(200) }).length).toBeLessThanOrEqual(200)
  })
})

describe('ogHtml', () => {
  it('escapes every value', () => {
    const html = ogHtml({
      ...siteCard(ORIGIN),
      title: '"><script>alert(1)</script>',
      description: `Tom & Jerry's "show"`,
      url: `${ORIGIN}/projects/x`,
    })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&quot;&gt;&lt;script&gt;')
    expect(html).toContain('Tom &amp; Jerry&#39;s &quot;show&quot;')
  })

  it('carries the tags the big apps read', () => {
    const html = ogHtml(itemCard(ORIGIN, 'project', project))
    for (const tag of ['og:title', 'og:description', 'og:image', 'og:image:width', 'og:url', 'twitter:card']) {
      expect(html).toContain(`"${tag}"`)
    }
    expect(html).toContain('content="KTIP"')
    expect(html).toContain('summary_large_image')
  })

  it('leaves og:url off the plain site card', () => {
    expect(ogHtml(siteCard(ORIGIN))).not.toContain('og:url')
  })
})
