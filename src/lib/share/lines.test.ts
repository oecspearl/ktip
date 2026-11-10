import { describe, expect, it } from 'vitest'
import { lineBuffer } from './lines'

describe('lineBuffer', () => {
  it('holds a half line until the rest arrives', () => {
    const b = lineBuffer()
    expect(b.push('{"a":1}\n{"b"')).toEqual(['{"a":1}'])
    expect(b.push(':2}\n')).toEqual(['{"b":2}'])
    expect(b.flush()).toEqual([])
  })

  it('skips blank lines, handles CRLF, and flushes a last line with no newline', () => {
    const b = lineBuffer()
    expect(b.push('one\r\n\r\ntwo\nthr')).toEqual(['one', 'two'])
    expect(b.push('ee')).toEqual([])
    expect(b.flush()).toEqual(['three'])
  })
})
