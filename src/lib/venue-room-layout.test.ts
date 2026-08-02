import { beforeEach, describe, expect, it } from 'vitest'
import {
  ROOM_CAMERA_MODES,
  ROOM_LAYOUTS,
  cameraModeFor,
  canBeHero,
  heroChoices,
  hostHeroOf,
  layoutFor,
  orderSectionIds,
  readHeroPin,
  resolveHero,
  roomUsesStage,
  setCameraMode,
  setHeroSection,
  spanClass,
  spanFills,
  spanKeyFor,
  writeHeroPin,
} from './venue-room-layout'
import {
  SECTIONS,
  defaultSectionIds,
  parseSections,
  sectionDef,
  sectionsForRoom,
  setSectionConfig,
  toggleSection,
  type RoomSectionId,
} from './venue-room-sections'
import type { VenueRoom, VenueRoomKind } from '../types'

const KINDS: VenueRoomKind[] = [
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

function room(kind: VenueRoomKind, sections: unknown[] = []): Pick<VenueRoom, 'kind'> & {
  sections: unknown[]
} {
  return { kind, sections }
}

const visibleFor = (kind: VenueRoomKind): RoomSectionId[] =>
  sectionsForRoom(room(kind), 'organizer').map((s) => s.def.id)

describe('the layout registry', () => {
  it('covers every kind', () => {
    for (const kind of KINDS) expect(ROOM_LAYOUTS[kind], kind).toBeTruthy()
    expect(Object.keys(ROOM_LAYOUTS).sort()).toEqual([...KINDS].sort())
  })

  it('only names sections that exist', () => {
    for (const kind of KINDS) {
      const layout = layoutFor(kind)
      for (const id of Object.keys(layout.spans)) {
        expect(sectionDef(id), `${kind} span ${id}`).toBeTruthy()
      }
      for (const id of layout.order || []) {
        expect(sectionDef(id), `${kind} order ${id}`).toBeTruthy()
      }
    }
  })

  it('picks a hero and a rail the kind actually renders', () => {
    // A layout whose hero is switched off for that kind would resolve to a
    // fallback on every single room of that kind — a default nobody sees.
    for (const kind of KINDS) {
      const defaults = defaultSectionIds(kind)
      const layout = layoutFor(kind)
      expect(defaults, `${kind} hero`).toContain(layout.hero)
      expect(defaults, `${kind} rail`).toContain(layout.rail)
      expect(layout.hero, kind).not.toBe(layout.rail)
    }
  })

  it('offers a real camera mode everywhere', () => {
    for (const kind of KINDS) {
      expect(ROOM_CAMERA_MODES, kind).toContain(layoutFor(kind).camera)
    }
  })

  it('gives the kinds that are about video a video hero', () => {
    for (const kind of ['main_hall', 'stage', 'workshop', 'judging', 'sponsor_booth'] as const) {
      expect(layoutFor(kind).hero, kind).toBe('av_placeholder')
    }
    // …and the ones that are about people a people hero. This is the whole
    // premise: a judging room and a networking mixer are not the same page.
    for (const kind of ['networking', 'help_desk', 'team', 'breakout'] as const) {
      expect(layoutFor(kind).hero, kind).not.toBe('av_placeholder')
    }
  })
})

describe('spans', () => {
  it('gives the hero the big cell and its rail a tall one', () => {
    const kind: VenueRoomKind = 'stage'
    const layout = layoutFor(kind)
    expect(spanKeyFor(kind, layout.hero, layout.hero)).toBe('hero')
    expect(spanKeyFor(kind, layout.rail, layout.hero)).toBe('rail')
    expect(spanFills('hero')).toBe(true)
    expect(spanFills('rail')).toBe(true)
    expect(spanFills('tile')).toBe(false)
  })

  it('swaps rather than duplicates when something else is promoted', () => {
    // Two cells claiming col-span-8 row-span-2 would push the row out of shape
    // for everything after it, so promotion has to hand the old span back.
    const kind: VenueRoomKind = 'stage'
    const layout = layoutFor(kind)
    expect(spanKeyFor(kind, layout.rail, layout.rail)).toBe('hero')
    expect(spanKeyFor(kind, layout.hero, layout.rail)).toBe('rail')
  })

  it('falls back by slot for a section the layout never mentions', () => {
    const kind: VenueRoomKind = 'team'
    const unlisted = SECTIONS.find(
      (s) => s.slot === 'aside' && !(s.id in layoutFor(kind).spans) && s.id !== layoutFor(kind).rail
    )
    expect(unlisted).toBeTruthy()
    expect(spanKeyFor(kind, unlisted!.id, layoutFor(kind).hero)).toBe('third')
  })

  it('only emits lg: classes, so a phone stacks', () => {
    for (const kind of KINDS) {
      for (const id of visibleFor(kind)) {
        const cls = spanClass(spanKeyFor(kind, id, layoutFor(kind).hero))
        for (const token of cls.split(' ')) expect(token.startsWith('lg:'), `${kind} ${id}`).toBe(true)
      }
    }
  })
})

describe('ordering', () => {
  it('puts the layout order first and keeps registry order after it', () => {
    const kind: VenueRoomKind = 'stage'
    const ordered = orderSectionIds(kind, visibleFor(kind))
    const wanted = (layoutFor(kind).order || []).filter((id) => ordered.includes(id))
    expect(ordered.slice(0, wanted.length)).toEqual(wanted)
    expect([...ordered].sort()).toEqual([...visibleFor(kind)].sort())
  })

  it('is stable', () => {
    const kind: VenueRoomKind = 'help_desk'
    expect(orderSectionIds(kind, visibleFor(kind))).toEqual(orderSectionIds(kind, visibleFor(kind)))
  })
})

describe('who holds the hero', () => {
  const kind: VenueRoomKind = 'stage'
  const visible = visibleFor(kind)

  it('falls back to the kind default', () => {
    expect(resolveHero({ visible, kind })).toBe(layoutFor(kind).hero)
  })

  it('lets the host override the default', () => {
    expect(resolveHero({ visible, kind, hostHero: 'chat' })).toBe('chat')
  })

  it('gives the room to whoever is presenting', () => {
    expect(resolveHero({ visible, kind, hostHero: 'chat', presentingSince: 1000 })).toBe(
      'av_placeholder'
    )
  })

  it('keeps a pin made during the presentation', () => {
    expect(
      resolveHero({ visible, kind, presentingSince: 1000, pin: { id: 'chat', at: 1001 } })
    ).toBe('chat')
  })

  it('ignores a pin left over from before it', () => {
    // Otherwise a member who pinned chat this morning never sees the keynote.
    expect(
      resolveHero({ visible, kind, presentingSince: 1000, pin: { id: 'chat', at: 999 } })
    ).toBe('av_placeholder')
  })

  it('beats the host when the viewer has chosen', () => {
    expect(resolveHero({ visible, kind, hostHero: 'chat', pin: { id: 'occupants', at: 5 } })).toBe(
      'occupants'
    )
  })

  it('falls through to a section that is still switched on', () => {
    // A pinned or host-chosen panel the host has since removed must not leave
    // the room with an empty big cell.
    const without = visible.filter((id) => id !== 'occupants')
    expect(
      resolveHero({
        visible: without,
        kind,
        hostHero: 'occupants',
        pin: { id: 'occupants', at: 5 },
      })
    ).toBe(layoutFor(kind).hero)
  })

  it('will not promote something too small to be a hero', () => {
    expect(canBeHero('stage', 'countdown')).toBe(false)
    expect(canBeHero('stage', 'chat')).toBe(true)
    // A kind's own rail is promotable whatever the shared list says.
    expect(canBeHero('help_desk', 'mentors_on_duty')).toBe(true)
    expect(heroChoices('stage', visible)).not.toContain('countdown')
    expect(heroChoices('stage', visible)).toContain('av_placeholder')
  })
})

describe("the host's big panel", () => {
  it('round-trips through the stored list', () => {
    const sections = setHeroSection(room('stage'), 'chat')
    expect(hostHeroOf(room('stage', parseSections(sections)))).toBe('chat')
  })

  it('is exclusive', () => {
    const first = setHeroSection(room('stage'), 'chat')
    const second = setHeroSection(room('stage', first), 'occupants')
    expect(second.filter((s) => s.config?.hero === true).map((s) => s.id)).toEqual(['occupants'])
  })

  it('clears itself when the same panel is chosen twice', () => {
    const on = setHeroSection(room('stage'), 'chat')
    const off = setHeroSection(room('stage', on), 'chat')
    expect(hostHeroOf(room('stage', off))).toBeNull()
    expect(off.some((s) => s.config?.hero === true)).toBe(false)
  })

  it('leaves other configs alone', () => {
    const withBody = setSectionConfig(room('workshop'), 'objectives', { body: 'Build a thing' })
    const withHero = setHeroSection(room('workshop', withBody), 'chat')
    const objectives = withHero.find((s) => s.id === 'objectives')
    expect(objectives?.config).toEqual({ body: 'Build a thing' })
  })

  it('survives a section being switched off afterwards', () => {
    const withHero = setHeroSection(room('stage'), 'chat')
    const withoutChat = toggleSection(room('stage', withHero), 'chat', false)
    expect(hostHeroOf(room('stage', withoutChat))).toBeNull()
  })
})

describe('cameras', () => {
  it('defaults to the kind', () => {
    expect(cameraModeFor(room('judging'))).toBe('grid')
    expect(cameraModeFor(room('team'))).toBe('huddle')
    expect(cameraModeFor(room('stage'))).toBe('spotlight')
  })

  it('lets the host disagree', () => {
    const sections = setCameraMode(room('team'), 'grid')
    expect(cameraModeFor(room('team', sections))).toBe('grid')
  })

  it('ignores junk in the stored config', () => {
    const sections = setSectionConfig(room('team'), 'av_placeholder', { mode: 'cinema' })
    expect(cameraModeFor(room('team', sections))).toBe(layoutFor('team').camera)
  })

  it('forces one big frame while somebody is presenting', () => {
    const sections = setCameraMode(room('judging'), 'grid')
    expect(cameraModeFor(room('judging', sections), { presenting: true })).toBe('spotlight')
  })

  it('opens no channel for a room with the call switched off', () => {
    expect(roomUsesStage(room('team'), 'participant')).toBe(true)
    expect(roomUsesStage(room('team', setCameraMode(room('team'), 'off')), 'participant')).toBe(
      false
    )
    const noAv = toggleSection(room('team'), 'av_placeholder', false)
    expect(roomUsesStage(room('team', noAv), 'participant')).toBe(false)
  })
})

describe("the viewer's pin", () => {
  beforeEach(() => window.localStorage.clear())

  it('round-trips', () => {
    writeHeroPin('room-1', { id: 'chat', at: 42 })
    expect(readHeroPin('room-1')).toEqual({ id: 'chat', at: 42 })
  })

  it('is per room', () => {
    writeHeroPin('room-1', { id: 'chat', at: 42 })
    expect(readHeroPin('room-2')).toBeNull()
  })

  it('clears', () => {
    writeHeroPin('room-1', { id: 'chat', at: 42 })
    writeHeroPin('room-1', null)
    expect(readHeroPin('room-1')).toBeNull()
  })

  it('survives junk rather than throwing a layout away', () => {
    window.localStorage.setItem('ktip.venue.hero.room-1', 'not json')
    expect(readHeroPin('room-1')).toBeNull()
    window.localStorage.setItem('ktip.venue.hero.room-1', JSON.stringify({ id: 'nope', at: 1 }))
    expect(readHeroPin('room-1')).toBeNull()
    window.localStorage.setItem('ktip.venue.hero.room-1', JSON.stringify({ id: 'chat' }))
    expect(readHeroPin('room-1')).toBeNull()
  })
})
