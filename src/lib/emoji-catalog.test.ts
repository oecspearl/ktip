import { beforeEach, describe, expect, it } from 'vitest'
import {
  ALL_EMOJI,
  EMOJI_GROUPS,
  pushRecentEmoji,
  readRecentEmoji,
  searchEmoji,
} from './emoji-catalog'
import { REACTION_ART } from './reaction-emoji'
import { ROOM_REACTIONS } from '../hooks/useRoomSignals'

describe('the catalog', () => {
  it('offers each emoji once', () => {
    // A duplicate would show up twice in one grid and score twice in search.
    expect(new Set(ALL_EMOJI.map((e) => e.e)).size).toBe(ALL_EMOJI.length)
  })

  it('gives every emoji something to search on', () => {
    for (const entry of ALL_EMOJI) {
      expect(entry.k.trim().length, entry.e).toBeGreaterThan(0)
      expect(entry.k, entry.e).toBe(entry.k.toLowerCase())
    }
  })

  it('gives every group a tab and something in it', () => {
    for (const group of EMOJI_GROUPS) {
      expect(group.emoji.length, group.id).toBeGreaterThan(0)
      expect(group.tab, group.id).toBeTruthy()
    }
    expect(new Set(EMOJI_GROUPS.map((g) => g.id)).size).toBe(EMOJI_GROUPS.length)
  })
})

describe('search', () => {
  it('is empty until something is typed', () => {
    expect(searchEmoji('')).toEqual([])
    expect(searchEmoji('   ')).toEqual([])
  })

  it('puts a word that starts with the query first', () => {
    // "th" must offer 🤔 (thinking) before 👍 (thumbs up), which a plain
    // substring match gets backwards.
    const results = searchEmoji('th').map((e) => e.e)
    expect(results).toContain('🤔')
    expect(results.indexOf('🤔')).toBeLessThan(results.indexOf('👍'))
  })

  it('finds by an everyday word rather than the official name', () => {
    expect(searchEmoji('lgtm').map((e) => e.e)).toContain('👍')
    expect(searchEmoji('done').map((e) => e.e)).toContain('✅')
    expect(searchEmoji('ship').map((e) => e.e)).toContain('🚀')
  })

  it('finds by group', () => {
    expect(searchEmoji('hearts').map((e) => e.e)).toContain('💜')
  })

  it('is case insensitive and honours the limit', () => {
    expect(searchEmoji('FIRE').map((e) => e.e)).toContain('🔥')
    expect(searchEmoji('a', 5).length).toBeLessThanOrEqual(5)
  })
})

describe('recents', () => {
  beforeEach(() => window.localStorage.clear())

  it('puts the last pick first and never repeats one', () => {
    pushRecentEmoji('🔥')
    pushRecentEmoji('🎉')
    pushRecentEmoji('🔥')
    expect(readRecentEmoji()).toEqual(['🔥', '🎉'])
  })

  it('stops growing', () => {
    for (const entry of ALL_EMOJI) pushRecentEmoji(entry.e)
    expect(readRecentEmoji().length).toBeLessThanOrEqual(24)
  })

  it('drops anything this build no longer offers', () => {
    // Otherwise a catalog edit leaves a dead glyph pinned to the top of the
    // picker for everyone who ever used it.
    window.localStorage.setItem('ktip.emoji.recent', JSON.stringify(['🔥', '🫏', 42]))
    expect(readRecentEmoji()).toEqual(['🔥'])
  })

  it('survives junk', () => {
    window.localStorage.setItem('ktip.emoji.recent', 'not json')
    expect(readRecentEmoji()).toEqual([])
  })
})

describe('the venue reaction set', () => {
  it('has artwork for every reaction that can arrive', () => {
    // ROOM_REACTIONS is what the broadcast handler validates against, so a
    // reaction with no picture is one that would float as a bare character.
    for (const emoji of ROOM_REACTIONS) {
      expect(REACTION_ART[emoji], emoji).toBeTruthy()
      // The label is a msg descriptor now. Assert on `.message` — the English
      // source — rather than resolving it, so this test needs no active locale.
      expect(REACTION_ART[emoji].label.message?.length ?? 0, emoji).toBeGreaterThan(0)
    }
    expect(Object.keys(REACTION_ART).length).toBe(ROOM_REACTIONS.length)
  })
})
