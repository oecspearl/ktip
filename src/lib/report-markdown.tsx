import type { ReactNode } from 'react'

/**
 * The small markdown a report is written in, rendered as React.
 *
 * Paragraphs, bullet lists, **bold**, *italic* and `code` — the subset the
 * model is told it may use and an editor needs. Deliberately not a markdown
 * library: the output is React nodes, never HTML strings, so there is nothing
 * to sanitise and nothing a model or an editor can inject. Anything the parser
 * does not understand renders as the literal text it was.
 */

const INLINE = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/g

export function renderInline(text: string, keyBase = 'i'): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    const key = `${keyBase}-${i}`
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={key}>{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={key}>{part.slice(1, -1)}</em>
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code key={key} className="rounded bg-ktip-sand-100 px-1 text-xs">
          {part.slice(1, -1)}
        </code>
      )
    }
    return part
  })
}

export function renderMarkdown(markdown: string | null | undefined, className = ''): ReactNode {
  if (!markdown || !markdown.trim()) return null
  const blocks = markdown.replace(/\r\n/g, '\n').trim().split(/\n{2,}/)

  return (
    <div className={`space-y-3 ${className}`.trim()}>
      {blocks.map((block, b) => {
        const lines = block.split('\n')
        const isList = lines.every((l) => /^\s*[-*]\s+/.test(l))
        if (isList) {
          return (
            <ul key={b} className="list-disc space-y-1 pl-5">
              {lines.map((line, i) => (
                <li key={i}>{renderInline(line.replace(/^\s*[-*]\s+/, ''), `${b}-${i}`)}</li>
              ))}
            </ul>
          )
        }
        // A heading the model was told not to write still reads as text, not as a tag.
        return (
          <p key={b}>
            {lines.map((line, i) => (
              <span key={i}>
                {i > 0 && <br />}
                {renderInline(line.replace(/^#+\s*/, ''), `${b}-${i}`)}
              </span>
            ))}
          </p>
        )
      })}
    </div>
  )
}
