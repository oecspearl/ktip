import type { DocumentExtractionStatus } from '../types'

/**
 * Scrapes an uploaded file into editable rich text, in the browser.
 *
 * Every scraper produces two shapes of the same content:
 *   html     — what the WYSIWYG editor loads, so headings, lists, tables and
 *              emphasis from the original document survive and stay editable
 *   markdown — plain text derived from it, which is what the AI extractor and
 *              any future search index read
 *
 * Parsing runs client-side on purpose: pdf-parse and friends are Node-only and
 * will not run in the Vercel edge runtime the rest of api/ uses, and doing it
 * here avoids downloading the binary a second time server-side.
 *
 * mammoth and pdfjs-dist are both heavy, so they are dynamically imported —
 * a member who never uploads a document never pays for them.
 */

/** Ceiling applied to both shapes before they are stored. */
export const MAX_CONTENT_CHARS = 200_000

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/** Mime types the bucket accepts. Keep in sync with migration 048. */
export const ACCEPTED_MIME_TYPES = [
  'application/pdf',
  DOCX_MIME,
  'application/msword',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/markdown',
  'text/plain',
  'text/csv',
  'image/jpeg',
  'image/png',
  'image/webp',
]

export const ACCEPT_ATTRIBUTE = '.pdf,.docx,.doc,.md,.txt,.csv,.xlsx,.xls,.jpg,.jpeg,.png,.webp'

export const MAX_FILE_SIZE = 25 * 1024 * 1024 // matches the bucket limit

export interface ExtractionResult {
  status: DocumentExtractionStatus
  html: string | null
  markdown: string | null
  error: string | null
}

function unsupported(reason: string): ExtractionResult {
  return { status: 'unsupported', html: null, markdown: null, error: reason }
}

function extension(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot === -1 ? '' : fileName.slice(dot + 1).toLowerCase()
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Collapse the runs of blank lines converters like to emit. */
function tidyMarkdown(markdown: string): string {
  return markdown
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_CONTENT_CHARS)
}

let turndownPromise: Promise<any> | null = null

async function getTurndown() {
  if (!turndownPromise) {
    turndownPromise = import('turndown').then(({ default: TurndownService }) => {
      const service = new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced',
        bulletListMarker: '-',
      })
      // Turndown drops tables by default; keep them as pipe rows so the AI
      // extractor can still read budget and eligibility tables.
      service.addRule('tableCell', {
        filter: ['th', 'td'],
        replacement: (content: string) => ` ${content.replace(/\n+/g, ' ').trim()} |`,
      })
      service.addRule('tableRow', {
        filter: 'tr',
        replacement: (content: string) => `|${content}\n`,
      })
      service.addRule('table', {
        filter: ['table', 'thead', 'tbody', 'tfoot'],
        replacement: (content: string) => `\n${content}\n`,
      })
      return service
    })
  }
  return turndownPromise
}

/** HTML → markdown. Also used when the editor saves, to keep the pair in sync. */
export async function htmlToMarkdown(html: string): Promise<string> {
  if (!html.trim()) return ''
  const turndown = await getTurndown()
  return tidyMarkdown(turndown.turndown(html))
}

/** Plain text → minimal HTML the editor can open without mangling line breaks. */
function textToHtml(text: string): string {
  const blocks = text.split(/\n{2,}/).filter((block) => block.trim().length > 0)
  return blocks
    .map((block) => `<p>${escapeHtml(block.trim()).replace(/\n/g, '<br />')}</p>`)
    .join('\n')
}

async function extractDocx(file: File): Promise<string> {
  // mammoth emits semantic HTML (headings, lists, tables), which is exactly
  // what the WYSIWYG editor wants — no intermediate markdown round-trip.
  const { default: mammoth } = await import('mammoth/mammoth.browser')
  const arrayBuffer = await file.arrayBuffer()
  const { value } = await mammoth.convertToHtml({ arrayBuffer })
  return value
}

async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  // Vite resolves ?url to an emitted asset; without this pdfjs falls back to a
  // fake worker on the main thread and chokes on anything non-trivial.
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

  const arrayBuffer = await file.arrayBuffer()
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) })
  const pdf = await loadingTask.promise

  const pages: string[] = []
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const content = await page.getTextContent()

    // pdfjs hands back positioned glyph runs, not lines. Group by their y
    // coordinate so the output keeps the document's line structure.
    const lines = new Map<number, string[]>()
    for (const item of content.items) {
      const text = (item as { str?: string }).str
      const transform = (item as { transform?: number[] }).transform
      if (!text || !transform) continue
      const y = Math.round(transform[5])
      const line = lines.get(y)
      if (line) line.push(text)
      else lines.set(y, [text])
    }

    const pageText = Array.from(lines.entries())
      .sort((a, b) => b[0] - a[0]) // pdf origin is bottom-left
      .map(([, parts]) => parts.join('').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join('\n')

    if (pageText) pages.push(pageText)
    if (pages.join('\n\n').length > MAX_CONTENT_CHARS) break
  }

  await loadingTask.destroy()
  return pages.join('\n\n')
}

interface ParsedCsv {
  html: string
  markdown: string
}

async function extractCsv(file: File): Promise<ParsedCsv> {
  const text = await file.text()
  const rows = text
    .split(/\r?\n/)
    .filter((row) => row.trim().length > 0)
    .slice(0, 500)
    .map((row) => row.split(',').map((cell) => cell.trim().replace(/^"|"$/g, '')))

  if (rows.length === 0) return { html: '', markdown: '' }

  const width = Math.max(...rows.map((r) => r.length))
  const pad = (row: string[]) => [...row, ...Array(width - row.length).fill('')]
  const [header, ...body] = rows

  const html = [
    '<table><thead><tr>',
    pad(header).map((cell) => `<th>${escapeHtml(cell)}</th>`).join(''),
    '</tr></thead><tbody>',
    ...body.map(
      (row) => `<tr>${pad(row).map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`
    ),
    '</tbody></table>',
  ].join('')

  const markdown = [
    `| ${pad(header).join(' | ')} |`,
    `| ${Array(width).fill('---').join(' | ')} |`,
    ...body.map((row) => `| ${pad(row).join(' | ')} |`),
  ].join('\n')

  return { html, markdown }
}

/**
 * Never throws — a document that will not parse is still a document worth
 * keeping, so failures come back as a status the caller stores on the row.
 */
export async function extractDocument(file: File): Promise<ExtractionResult> {
  const ext = extension(file.name)
  const mime = file.type

  try {
    if (mime === DOCX_MIME || ext === 'docx') {
      const html = (await extractDocx(file)).slice(0, MAX_CONTENT_CHARS)
      if (!html.trim()) {
        return unsupported('This document appears to be empty.')
      }
      return { status: 'done', html, markdown: await htmlToMarkdown(html), error: null }
    }

    if (mime === 'application/pdf' || ext === 'pdf') {
      const text = await extractPdfText(file)
      if (!text.trim()) {
        return unsupported('No selectable text found — this PDF is likely a scan.')
      }
      return {
        status: 'done',
        html: textToHtml(text).slice(0, MAX_CONTENT_CHARS),
        markdown: tidyMarkdown(text),
        error: null,
      }
    }

    if (mime === 'text/csv' || ext === 'csv') {
      const { html, markdown } = await extractCsv(file)
      return {
        status: 'done',
        html: html.slice(0, MAX_CONTENT_CHARS),
        markdown: tidyMarkdown(markdown),
        error: null,
      }
    }

    if (mime === 'text/markdown' || mime === 'text/plain' || ext === 'md' || ext === 'txt') {
      const text = await file.text()
      return {
        status: 'done',
        html: textToHtml(text).slice(0, MAX_CONTENT_CHARS),
        markdown: tidyMarkdown(text),
        error: null,
      }
    }

    if (mime.startsWith('image/')) {
      return unsupported('Images are stored as-is; there is no text to scrape.')
    }

    if (ext === 'doc') {
      return unsupported('Legacy .doc files cannot be scraped — save as .docx to extract text.')
    }

    if (ext === 'xlsx' || ext === 'xls') {
      return unsupported('Spreadsheets are stored as-is; export to CSV to extract text.')
    }

    return unsupported(`No scraper for ${mime || ext || 'this file type'}.`)
  } catch (err: any) {
    return {
      status: 'failed',
      html: null,
      markdown: null,
      error: err?.message || 'Failed to read the file.',
    }
  }
}

/** Human-readable size for the document cards. */
export function formatFileSize(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / Math.pow(1024, i)
  return `${i === 0 ? value : value.toFixed(1)} ${units[i]}`
}

/** Storage key: {ownerId}/{entityType}/{entityId}/{ts}_{safeName} — see migration 048. */
export function buildStoragePath(params: {
  ownerId: string
  entityType: string
  entityId: string
  fileName: string
}): string {
  const safeName = params.fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120)
  return `${params.ownerId}/${params.entityType}/${params.entityId}/${Date.now()}_${safeName}`
}

/** Client-side gate before the bucket's own limits reject the upload. */
export function validateFile(file: File): string | null {
  if (file.size > MAX_FILE_SIZE) {
    return `${file.name}: exceeds the 25MB limit`
  }
  const ext = extension(file.name)
  const allowedExt = ['pdf', 'docx', 'doc', 'md', 'txt', 'csv', 'xlsx', 'xls', 'jpg', 'jpeg', 'png', 'webp']
  if (file.type && !ACCEPTED_MIME_TYPES.includes(file.type) && !allowedExt.includes(ext)) {
    return `${file.name}: unsupported file type`
  }
  if (!file.type && !allowedExt.includes(ext)) {
    return `${file.name}: unsupported file type`
  }
  return null
}
