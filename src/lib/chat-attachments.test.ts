import { describe, it, expect } from 'vitest'
import {
  MAX_ATTACHMENT_BYTES,
  attachmentKey,
  attachmentRejection,
  describeAttachments,
  formatFileSize,
  isImageAttachment,
  resolveMimeType,
  sanitizeFileName,
} from './chat-attachments'

describe('sanitizeFileName', () => {
  it('cannot invent a folder', () => {
    // The first path segment is what the storage policy reads, so a name that
    // smuggles a slash would move the object out of its conversation.
    expect(sanitizeFileName('../../secrets/plan.pdf')).toBe('secretsplan.pdf')
    expect(sanitizeFileName('a/b.png')).toBe('ab.png')
  })

  it('keeps something usable out of anything', () => {
    expect(sanitizeFileName('Q1 budget (final).xlsx')).toBe('Q1-budget-final.xlsx')
    expect(sanitizeFileName('日本語.pdf')).toBe('pdf')
    expect(sanitizeFileName('...')).toBe('file')
  })
})

describe('resolveMimeType', () => {
  it('trusts the extension where browsers disagree', () => {
    expect(resolveMimeType('data.csv', 'application/vnd.ms-excel')).toBe('text/csv')
    expect(resolveMimeType('notes.md', '')).toBe('text/markdown')
  })

  it('falls back to what the browser said', () => {
    expect(resolveMimeType('mystery', 'application/pdf')).toBe('application/pdf')
    expect(resolveMimeType('mystery', undefined)).toBe('')
  })
})

describe('attachmentRejection', () => {
  it('accepts an ordinary document', () => {
    expect(attachmentRejection({ name: 'brief.pdf', size: 2048, type: 'application/pdf' })).toBeNull()
  })

  it('refuses an empty file, an oversized one, and an unsupported type', () => {
    expect(attachmentRejection({ name: 'empty.pdf', size: 0, type: 'application/pdf' })).toContain(
      'empty'
    )
    expect(
      attachmentRejection({ name: 'big.pdf', size: MAX_ATTACHMENT_BYTES + 1, type: 'application/pdf' })
    ).toContain('limit')
    expect(
      attachmentRejection({ name: 'payload.exe', size: 10, type: 'application/x-msdownload' })
    ).toContain('not a file type')
  })
})

describe('attachmentKey', () => {
  it('puts the conversation first and the sender second', () => {
    expect(
      attachmentKey({
        conversationId: 'c1',
        senderId: 'u1',
        fileName: 'Q1 budget.xlsx',
        stamp: 1700000000000,
        token: 'ab12cd',
      })
    ).toBe('c1/u1/1700000000000-ab12cd-Q1-budget.xlsx')
  })
})

describe('formatFileSize', () => {
  it('reads the way a person would say it', () => {
    expect(formatFileSize(512)).toBe('512 B')
    expect(formatFileSize(2048)).toBe('2.0 KB')
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB')
    expect(formatFileSize(-1)).toBe('—')
  })
})

describe('previews', () => {
  it('names one file and counts several', () => {
    const file = { path: 'p', name: 'brief.pdf', mime: 'application/pdf', size: 1 }
    expect(describeAttachments([file])).toBe('brief.pdf')
    expect(describeAttachments([file, { ...file, name: 'b.pdf' }])).toBe('2 files')
    expect(describeAttachments([])).toBe('')
  })

  it('knows what renders as a thumbnail', () => {
    expect(isImageAttachment({ mime: 'image/png' })).toBe(true)
    expect(isImageAttachment({ mime: 'application/pdf' })).toBe(false)
  })
})
