/**
 * Splits a stream of text into whole lines as chunks arrive. Used on both ends
 * of the share drafts stream: the server reads the model's reply line by line,
 * and the browser reads the server's events line by line. A chunk can end in
 * the middle of a line, so the tail waits for the next chunk (or `flush`).
 */
export function lineBuffer() {
  let tail = ''
  return {
    push(chunk: string): string[] {
      tail += chunk
      const parts = tail.split(/\r?\n/)
      tail = parts.pop() ?? ''
      return parts.filter((l) => l.trim() !== '')
    },
    flush(): string[] {
      const rest = tail.trim()
      tail = ''
      return rest ? [rest] : []
    },
  }
}
