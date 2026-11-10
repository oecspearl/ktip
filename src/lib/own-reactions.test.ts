import { describe, expect, it } from 'vitest'
import { cleanOwnReactions, firstGrapheme, isReactionEmoji } from './own-reactions'

describe('isReactionEmoji', () => {
  it('accepts single emoji, including skin tones, ZWJ sequences and flags', () => {
    for (const emoji of ['🌊', '👍🏽', '👩‍💻', '🇱🇨', '❤️']) expect(isReactionEmoji(emoji), emoji).toBe(true)
  })

  it('refuses text, two emoji at once, markup and empties', () => {
    for (const value of ['hi', 'a🌊', '🌊🌊', '<b>', ' ', '', '1', null, 42]) {
      expect(isReactionEmoji(value), String(value)).toBe(false)
    }
  })

  it('refuses something long enough to be a message', () => {
    expect(isReactionEmoji('🌊'.repeat(9))).toBe(false)
  })
})

describe('cleanOwnReactions', () => {
  const standard = ['👏', '🔥', '❤️', '😂', '🎉', '🤔']

  it('keeps at most three, drops repeats, junk and the standard set', () => {
    expect(cleanOwnReactions(['🌊', '🌊', 'x', '👏', '🐟', '🏝️', '🚀'], standard)).toEqual(['🌊', '🐟', '🏝️'])
  })

  it('returns nothing for something that is not a list', () => {
    expect(cleanOwnReactions('🌊', standard)).toEqual([])
    expect(cleanOwnReactions(null, standard)).toEqual([])
  })
})

describe('firstGrapheme', () => {
  it('takes a whole joined emoji, not half of it', () => {
    expect(firstGrapheme('👩‍💻 rest')).toBe('👩‍💻')
    expect(firstGrapheme('')).toBe('')
  })
})
