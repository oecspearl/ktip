import { describe, it, expect } from 'vitest'
import {
  buildStoragePath,
  extractDocument,
  formatFileSize,
  htmlToMarkdown,
  validateFile,
  MAX_FILE_SIZE,
} from './document-extract'

function makeFile(name: string, type: string, content = '', size?: number): File {
  const file = new File([content], name, { type })
  if (size !== undefined) {
    Object.defineProperty(file, 'size', { value: size })
  }
  return file
}

describe('extractDocument', () => {
  it('reads markdown and plain text straight through', async () => {
    const file = makeFile('call.md', 'text/markdown', '# Call for Proposals\n\nApply by 30 September.')
    const result = await extractDocument(file)

    expect(result.status).toBe('done')
    expect(result.markdown).toContain('# Call for Proposals')
    // The editor needs HTML, so the plain text is wrapped into paragraphs
    expect(result.html).toContain('<p>')
    expect(result.error).toBeNull()
  })

  it('turns a CSV into a table in both shapes', async () => {
    const file = makeFile('budget.csv', 'text/csv', 'Item,Cost\nEquipment,5000\nTravel,1200')
    const result = await extractDocument(file)

    expect(result.status).toBe('done')
    expect(result.html).toContain('<th>Item</th>')
    expect(result.html).toContain('<td>5000</td>')
    expect(result.markdown).toContain('| Item | Cost |')
    expect(result.markdown).toContain('| Equipment | 5000 |')
  })

  it('escapes HTML in the source rather than passing it into the editor', async () => {
    const file = makeFile('notes.txt', 'text/plain', '<script>alert(1)</script>')
    const result = await extractDocument(file)

    expect(result.html).not.toContain('<script>')
    expect(result.html).toContain('&lt;script&gt;')
  })

  it('marks images unsupported instead of failing', async () => {
    const result = await extractDocument(makeFile('logo.png', 'image/png'))

    expect(result.status).toBe('unsupported')
    expect(result.html).toBeNull()
    expect(result.error).toBeTruthy()
  })

  it('explains why legacy .doc cannot be scraped', async () => {
    const result = await extractDocument(makeFile('old.doc', 'application/msword'))

    expect(result.status).toBe('unsupported')
    expect(result.error).toContain('.docx')
  })

  it('never throws on an unknown type', async () => {
    const result = await extractDocument(makeFile('thing.xyz', ''))
    expect(result.status).toBe('unsupported')
  })
})

describe('htmlToMarkdown', () => {
  it('converts the editor output back to markdown', async () => {
    const markdown = await htmlToMarkdown('<h1>Title</h1><p>Body with <strong>bold</strong>.</p>')

    expect(markdown).toContain('# Title')
    expect(markdown).toContain('**bold**')
  })

  it('keeps table rows rather than dropping them', async () => {
    const markdown = await htmlToMarkdown(
      '<table><tr><th>Item</th><th>Cost</th></tr><tr><td>Travel</td><td>1200</td></tr></table>'
    )

    expect(markdown).toContain('| Item | Cost |')
    expect(markdown).toContain('| Travel | 1200 |')
  })

  it('returns an empty string for empty input', async () => {
    expect(await htmlToMarkdown('')).toBe('')
  })
})

describe('validateFile', () => {
  it('rejects files over the bucket limit', () => {
    const big = makeFile('huge.pdf', 'application/pdf', '', MAX_FILE_SIZE + 1)
    expect(validateFile(big)).toContain('25MB')
  })

  it('rejects types the bucket will not take', () => {
    expect(validateFile(makeFile('run.exe', 'application/x-msdownload'))).toContain('unsupported')
  })

  it('accepts a known extension even when the browser reports no mime type', () => {
    expect(validateFile(makeFile('call.docx', ''))).toBeNull()
    expect(validateFile(makeFile('call.pdf', 'application/pdf'))).toBeNull()
  })
})

describe('buildStoragePath', () => {
  it('puts the owner id first so the storage policy matches', () => {
    const path = buildStoragePath({
      ownerId: 'user-1',
      entityType: 'grant',
      entityId: 'grant-9',
      fileName: 'Call for Proposals (final).docx',
    })

    expect(path.startsWith('user-1/grant/grant-9/')).toBe(true)
    // Everything outside [A-Za-z0-9._-] is replaced, so the key is always safe
    expect(path).toMatch(/^user-1\/grant\/grant-9\/\d+_[A-Za-z0-9._-]+$/)
  })
})

describe('formatFileSize', () => {
  it('scales to the right unit', () => {
    expect(formatFileSize(0)).toBe('0 B')
    expect(formatFileSize(512)).toBe('512 B')
    expect(formatFileSize(2048)).toBe('2.0 KB')
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB')
  })
})
