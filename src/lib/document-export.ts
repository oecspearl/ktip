import type { Editor } from '@tiptap/core'
import TurndownService from 'turndown'

/**
 * Download the editor content as a styled HTML file.
 */
export function downloadHTML(editor: Editor, filename = 'document') {
  const html = editor.getHTML()
  const fullHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${filename}</title>
  <link href="https://fonts.googleapis.com/css2?family=Mulish:wght@400;500;600;700&family=Barlow+Semi+Condensed:wght@600;700&display=swap" rel="stylesheet">
  <style>
    body {
      font-family: 'Mulish', system-ui, sans-serif;
      line-height: 1.7;
      color: #1c1917;
      max-width: 800px;
      margin: 2rem auto;
      padding: 0 1.5rem;
    }
    h1, h2, h3, h4 { font-family: 'Barlow Semi Condensed', 'Mulish', system-ui, sans-serif; font-weight: 700; }
    h1 { font-size: 1.875rem; margin-bottom: 0.75rem; }
    h2 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    h3 { font-size: 1.25rem; margin-bottom: 0.5rem; }
    h4 { font-size: 1.125rem; margin-bottom: 0.5rem; }
    p { margin-bottom: 0.75rem; }
    ul { list-style: disc; padding-left: 1.5rem; margin-bottom: 0.75rem; }
    ol { list-style: decimal; padding-left: 1.5rem; margin-bottom: 0.75rem; }
    li { margin-bottom: 0.25rem; }
    blockquote { border-left: 3px solid #d6d3d1; padding-left: 1rem; margin-left: 0; color: #57534e; font-style: italic; margin-bottom: 0.75rem; }
    code { background: #f5f5f4; border-radius: 0.25rem; padding: 0.125rem 0.375rem; font-size: 0.875em; }
    pre { background: #1c1917; color: #f5f5f4; border-radius: 0.5rem; padding: 1rem; margin-bottom: 0.75rem; overflow-x: auto; }
    pre code { background: none; padding: 0; color: inherit; }
    hr { border: none; border-top: 1px solid #e7e5e4; margin: 1.5rem 0; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 1rem; }
    th, td { border: 1px solid #d6d3d1; padding: 0.5rem 0.75rem; text-align: left; }
    th { background: #f5f5f4; font-weight: 600; }
    img { max-width: 100%; height: auto; border-radius: 0.375rem; }
    a { color: #0066cc; text-decoration: underline; }
    mark { background: #fef08a; padding: 0.125rem 0.25rem; border-radius: 0.125rem; }
    sub { vertical-align: sub; font-size: 0.75em; }
    sup { vertical-align: super; font-size: 0.75em; }
  </style>
</head>
<body>
${html}
</body>
</html>`

  const blob = new Blob([fullHTML], { type: 'text/html;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `${filename}.html`
  link.click()
  URL.revokeObjectURL(link.href)
}

/**
 * Download the editor content as Markdown using turndown.
 */
export function downloadMarkdown(editor: Editor, filename = 'document') {
  const html = editor.getHTML()
  const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  })
  const markdown = turndown.turndown(html)

  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `${filename}.md`
  link.click()
  URL.revokeObjectURL(link.href)
}

/**
 * Open a print dialog for PDF export via the browser's print-to-PDF feature.
 */
export function printForPDF(editor: Editor) {
  const html = editor.getHTML()
  const printWindow = window.open('', '_blank')
  if (!printWindow) return

  printWindow.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Document</title>
  <link href="https://fonts.googleapis.com/css2?family=Mulish:wght@400;500;600;700&family=Barlow+Semi+Condensed:wght@600;700&display=swap" rel="stylesheet">
  <style>
    @page { margin: 1in; }
    body {
      font-family: 'Mulish', system-ui, sans-serif;
      line-height: 1.7;
      color: #1c1917;
      max-width: 100%;
    }
    h1, h2, h3, h4 { font-family: 'Barlow Semi Condensed', 'Mulish', system-ui, sans-serif; font-weight: 700; page-break-after: avoid; }
    h1 { font-size: 20pt; margin-bottom: 8pt; }
    h2 { font-size: 16pt; margin-bottom: 6pt; }
    h3 { font-size: 13pt; margin-bottom: 4pt; }
    h4 { font-size: 11pt; margin-bottom: 4pt; }
    p { margin-bottom: 6pt; }
    ul { list-style: disc; padding-left: 1.5rem; margin-bottom: 6pt; }
    ol { list-style: decimal; padding-left: 1.5rem; margin-bottom: 6pt; }
    li { margin-bottom: 2pt; }
    blockquote { border-left: 3px solid #d6d3d1; padding-left: 1rem; margin-left: 0; color: #57534e; font-style: italic; }
    code { background: #f0f0f0; border-radius: 2pt; padding: 1pt 3pt; font-size: 0.85em; }
    pre { background: #f0f0f0; border-radius: 4pt; padding: 8pt; margin-bottom: 6pt; overflow-x: auto; white-space: pre-wrap; }
    pre code { background: none; padding: 0; }
    hr { border: none; border-top: 1px solid #ccc; margin: 12pt 0; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 8pt; }
    th, td { border: 1px solid #ccc; padding: 4pt 6pt; text-align: left; font-size: 10pt; }
    th { background: #f0f0f0; font-weight: 600; }
    img { max-width: 100%; height: auto; }
    a { color: #0066cc; }
    mark { background: #fef08a; }
  </style>
</head>
<body>
${html}
</body>
</html>`)
  printWindow.document.close()

  // Wait for fonts to load before printing
  setTimeout(() => {
    printWindow.print()
  }, 500)
}
