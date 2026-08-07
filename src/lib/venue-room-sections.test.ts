import { describe, expect, it } from 'vitest'
import {
  MAX_SPONSOR_LINKS,
  SECTIONS,
  defaultSectionIds,
  isSafeHref,
  parseSections,
  parseSponsorLinks,
  sectionChoices,
  sectionsForRoom,
  sectionsInSlot,
  setSectionConfig,
  toggleSection,
  type RoomSectionSetting,
} from './venue-room-sections'
import { VENUE_ROOM_PRESETS, presetByKey } from './venue-room-presets'
import type { VenueRoom, VenueRoomKind } from '../types'

function room(kind: VenueRoomKind, sections: unknown[] = []): Pick<VenueRoom, 'kind'> & {
  sections: unknown[]
} {
  return { kind, sections }
}

const ids = (list: Array<{ def: { id: string } }>) => list.map((s) => s.def.id)

describe('the registry', () => {
  it('has no duplicate ids', () => {
    expect(new Set(SECTIONS.map((s) => s.id)).size).toBe(SECTIONS.length)
  })

  it('gives every kind something in both columns', () => {
    const kinds: VenueRoomKind[] = [
      'main_hall',
      'networking',
      'workshop',
      'help_desk',
      'sponsor_booth',
      'team',
      'judging',
      'stage',
      'breakout',
    ]
    for (const kind of kinds) {
      const resolved = sectionsForRoom(room(kind), 'participant')
      expect(sectionsInSlot(resolved, 'main').length, kind).toBeGreaterThan(0)
      expect(sectionsInSlot(resolved, 'aside').length, kind).toBeGreaterThan(0)
    }
  })

  it('gives different kinds different rooms', () => {
    const booth = ids(sectionsForRoom(room('sponsor_booth'), 'participant'))
    const desk = ids(sectionsForRoom(room('help_desk'), 'participant'))
    const judging = ids(sectionsForRoom(room('judging'), 'participant'))

    expect(booth).toContain('sponsor_links')
    expect(desk).toContain('mentors_on_duty')
    expect(judging).toContain('judges_present')
    // The whole point of 091: these are no longer the same room.
    expect(booth).not.toEqual(desk)
    expect(desk).not.toEqual(judging)
  })

  it('only lets presets name sections that exist', () => {
    const known = new Set(SECTIONS.map((s) => s.id))
    for (const preset of VENUE_ROOM_PRESETS) {
      for (const id of preset.sections || []) {
        expect(known.has(id), `${preset.key} → ${id}`).toBe(true)
      }
    }
  })

  it('keeps the quiet room quiet and the registration desk useful', () => {
    // The two presets whose whole point is disagreeing with their kind.
    const quiet = presetByKey('quiet-room')?.sections || []
    expect(quiet).not.toContain('chat')
    expect(quiet).toContain('focus_timer')
    expect(presetByKey('registration')?.sections).toContain('check_in')
  })

  it('never defaults the announcement feed on, since it replaces chat', () => {
    for (const kind of ['main_hall', 'stage', 'breakout'] as VenueRoomKind[]) {
      expect(defaultSectionIds(kind)).not.toContain('announcement_feed')
      expect(defaultSectionIds(kind)).toContain('chat')
    }
  })
})

describe('parseSections', () => {
  it('returns nothing for junk rather than throwing', () => {
    expect(parseSections(null)).toEqual([])
    expect(parseSections('chat')).toEqual([])
    expect(parseSections({ id: 'chat' })).toEqual([])
    expect(parseSections([null, 3, 'chat', [], { id: '' }, { id: '  ' }])).toEqual([])
  })

  it('keeps the first of a duplicated id', () => {
    const parsed = parseSections([
      { id: 'chat', order: 5 },
      { id: 'chat', order: 99 },
    ])
    expect(parsed).toHaveLength(1)
    expect(parsed[0].order).toBe(5)
  })

  it('keeps an id this build does not know', () => {
    // Dropping it here would mean a round trip through an older client
    // silently deleting a panel that client had never heard of.
    expect(parseSections([{ id: 'holodeck' }]).map((s) => s.id)).toEqual(['holodeck'])
  })

  it('treats a missing enabled as on and only false as off', () => {
    const parsed = parseSections([{ id: 'a' }, { id: 'b', enabled: false }, { id: 'c', enabled: 0 }])
    expect(parsed.map((s) => s.enabled)).toEqual([true, false, true])
  })

  it('drops a non-object config and a non-numeric order', () => {
    const parsed = parseSections([{ id: 'chat', config: 'nope', order: 'first' }])
    expect(parsed[0].config).toBeUndefined()
    expect(parsed[0].order).toBeUndefined()
  })
})

describe('sectionsForRoom', () => {
  it('falls back to the kind defaults when nothing is stored', () => {
    expect(ids(sectionsForRoom(room('networking'), 'organizer'))).toEqual(
      defaultSectionIds('networking')
    )
  })

  it('role-gates a default the same way it gates a chosen section', () => {
    // host_controls is on by default everywhere — for organizers only.
    expect(ids(sectionsForRoom(room('networking'), 'organizer'))).toContain('host_controls')
    expect(ids(sectionsForRoom(room('networking'), 'participant'))).not.toContain('host_controls')
    expect(ids(sectionsForRoom(room('networking'), null))).not.toContain('host_controls')
  })

  it('uses the stored list once there is one', () => {
    const stored = [{ id: 'chat' }, { id: 'occupants' }]
    expect(ids(sectionsForRoom(room('networking', stored), 'participant'))).toEqual([
      'chat',
      'occupants',
    ])
  })

  it('drops ids this build cannot render', () => {
    const stored = [{ id: 'chat' }, { id: 'holodeck' }]
    expect(ids(sectionsForRoom(room('breakout', stored), 'participant'))).toEqual(['chat'])
  })

  it('drops a section switched off', () => {
    const stored = [{ id: 'chat', enabled: false }, { id: 'occupants' }]
    expect(ids(sectionsForRoom(room('breakout', stored), 'participant'))).toEqual(['occupants'])
  })

  it('puts every main section before every aside one', () => {
    const stored = [{ id: 'occupants' }, { id: 'chat' }, { id: 'countdown' }, { id: 'av_placeholder' }]
    const resolved = sectionsForRoom(room('breakout', stored), 'participant')
    const slots = resolved.map((s) => s.def.slot)
    expect(slots).toEqual(['main', 'main', 'aside', 'aside'])
  })

  it('honours an explicit order inside a slot', () => {
    const stored = [
      { id: 'chat', order: 1 },
      { id: 'av_placeholder', order: 2 },
    ]
    expect(ids(sectionsForRoom(room('breakout', stored), 'participant'))).toEqual([
      'chat',
      'av_placeholder',
    ])
  })

  it('carries a config through to the resolved section', () => {
    const stored = [{ id: 'sponsor_links', config: { links: [{ label: 'Jobs', url: 'https://x.test' }] } }]
    const resolved = sectionsForRoom(room('sponsor_booth', stored), 'participant')
    expect(resolved[0].config).toEqual({ links: [{ label: 'Jobs', url: 'https://x.test' }] })
  })

  it('hides a role-gated section from everyone else', () => {
    const gated = SECTIONS.find((s) => s.roles?.length)
    if (!gated) return // no gated section shipped yet; the gate is still tested below
    const stored = [{ id: gated.id }]
    expect(ids(sectionsForRoom(room('breakout', stored), 'spectator'))).not.toContain(gated.id)
    expect(ids(sectionsForRoom(room('breakout', stored), gated.roles![0]))).toContain(gated.id)
  })

  it('is stable — resolving twice gives the same order', () => {
    const a = ids(sectionsForRoom(room('main_hall'), 'participant'))
    const b = ids(sectionsForRoom(room('main_hall'), 'participant'))
    expect(a).toEqual(b)
  })
})

describe('the host’s tick list', () => {
  it('shows the kind defaults already ticked on an untouched room', () => {
    const choices = sectionChoices(room('help_desk'))
    const on = choices.filter((c) => c.enabled).map((c) => c.def.id)
    expect(on).toEqual(expect.arrayContaining(defaultSectionIds('help_desk')))
    expect(on).toHaveLength(defaultSectionIds('help_desk').length)
  })

  it('offers every section, not only the ones already on', () => {
    expect(sectionChoices(room('breakout'))).toHaveLength(SECTIONS.length)
  })

  it('writes the whole set down the first time one box changes', () => {
    const next = toggleSection(room('help_desk'), 'countdown', true)
    // Not just ['countdown'] — a partial list would let a later change to the
    // defaults rearrange a room the host had already arranged.
    expect(next.map((s) => s.id)).toEqual([...defaultSectionIds('help_desk'), 'countdown'].sort(inRegistryOrder))
  })

  it('removes a default when it is unticked', () => {
    const next = toggleSection(room('networking'), 'looking_for_team', false)
    expect(next.map((s) => s.id)).not.toContain('looking_for_team')
    expect(next.map((s) => s.id)).toContain('chat')
  })

  it('round-trips: what is toggled on is what resolves', () => {
    const sections = toggleSection(room('breakout'), 'announcements', true)
    expect(ids(sectionsForRoom(room('breakout', sections), 'participant'))).toContain('announcements')
  })

  it('keeps an existing config when an unrelated box is ticked', () => {
    const withConfig = setSectionConfig(room('sponsor_booth'), 'sponsor_links', {
      links: [{ label: 'Jobs', url: 'https://x.test' }],
    })
    const next = toggleSection(room('sponsor_booth', withConfig), 'countdown', true)
    const links = next.find((s) => s.id === 'sponsor_links')?.config
    expect(links).toEqual({ links: [{ label: 'Jobs', url: 'https://x.test' }] })
  })

  it('switches a section on when its config is set', () => {
    const next: RoomSectionSetting[] = setSectionConfig(room('breakout'), 'sponsor_links', {
      links: [],
    })
    expect(next.map((s) => s.id)).toContain('sponsor_links')
  })
})

describe('per-event-type sections', () => {
  it('drops team-formation panels from a conference networking room’s defaults', () => {
    const conf = defaultSectionIds('networking', 'conference')
    expect(conf).not.toContain('looking_for_team')
    expect(conf).not.toContain('skill_finder')
    // A hackathon — and a caller passing no type — keeps them.
    expect(defaultSectionIds('networking', 'hackathon')).toContain('looking_for_team')
    expect(defaultSectionIds('networking')).toContain('looking_for_team')
  })

  it('suppresses hidden ids even when they are stored on the room', () => {
    // A room cloned from a hackathon template carries the ids in jsonb.
    const stored = [{ id: 'looking_for_team' }, { id: 'skill_finder' }, { id: 'chat' }]
    const resolved = ids(sectionsForRoom(room('networking', stored), 'participant', 'conference'))
    expect(resolved).toEqual(['chat'])
    // The same room in a hackathon renders all three.
    expect(ids(sectionsForRoom(room('networking', stored), 'participant', 'hackathon'))).toEqual([
      'chat',
      'looking_for_team',
      'skill_finder',
    ])
  })

  it('keeps hidden sections out of a conference host’s picker', () => {
    const offered = sectionChoices(room('networking'), 'conference').map((c) => c.def.id)
    expect(offered).not.toContain('looking_for_team')
    expect(offered).not.toContain('skill_finder')
    expect(sectionChoices(room('networking'))).toHaveLength(SECTIONS.length)
  })

  it('never materialises a hidden id when a conference host ticks a box', () => {
    const next = toggleSection(room('networking'), 'countdown', true, 'conference')
    expect(next.map((s) => s.id)).not.toContain('looking_for_team')
    expect(next.map((s) => s.id)).toContain('countdown')
  })
})

describe('sponsor links', () => {
  it('drops anything that is not http(s)', () => {
    const links = parseSponsorLinks({
      links: [
        { label: 'Jobs', url: 'https://sponsor.test/jobs' },
        { label: 'Steal', url: 'javascript:alert(1)' },
        { label: 'Also steal', url: 'data:text/html,<script>1</script>' },
        { label: 'Nope', url: 'not a url' },
        { label: 'Plain', url: 'http://sponsor.test' },
      ],
    })
    expect(links.map((l) => l.url)).toEqual(['https://sponsor.test/jobs', 'http://sponsor.test'])
  })

  it('falls back to the hostname when the label is blank', () => {
    expect(parseSponsorLinks({ links: [{ label: '  ', url: 'https://www.sponsor.test/x' }] })).toEqual([
      { label: 'sponsor.test', url: 'https://www.sponsor.test/x' },
    ])
  })

  it('caps the list', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      label: `L${i}`,
      url: `https://sponsor.test/${i}`,
    }))
    expect(parseSponsorLinks({ links: many })).toHaveLength(MAX_SPONSOR_LINKS)
  })

  it('survives junk', () => {
    expect(parseSponsorLinks(undefined)).toEqual([])
    expect(parseSponsorLinks({ links: 'https://x.test' })).toEqual([])
    expect(parseSponsorLinks({ links: [null, 5, {}] })).toEqual([])
  })

  it('agrees with isSafeHref', () => {
    expect(isSafeHref('https://x.test')).toBe(true)
    expect(isSafeHref('javascript:alert(1)')).toBe(false)
    expect(isSafeHref('')).toBe(false)
  })
})

/** Registry order, so an expectation can be written without hard-coding it. */
function inRegistryOrder(a: string, b: string): number {
  const index = (id: string) => SECTIONS.findIndex((s) => s.id === id)
  const sa = SECTIONS[index(a)]
  const sb = SECTIONS[index(b)]
  const slot = (s: (typeof SECTIONS)[number]) => (s.slot === 'main' ? 0 : 1)
  return slot(sa) - slot(sb) || sa.order - sb.order
}
