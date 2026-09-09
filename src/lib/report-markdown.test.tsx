import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { renderMarkdown } from './report-markdown'

describe('renderMarkdown', () => {
  it('renders paragraphs, bullets and inline emphasis as elements, never as HTML', () => {
    const { container } = render(
      <div>
        {renderMarkdown(
          'Membership grew to **214** this month.\n\n- Saint Lucia led with *58*\n- Grenada followed\n\nA `t34.mau_pct` note <script>alert(1)</script>',
        )}
      </div>,
    )
    expect(screen.getByText('214').tagName).toBe('STRONG')
    expect(screen.getByText('58').tagName).toBe('EM')
    expect(screen.getByText('t34.mau_pct').tagName).toBe('CODE')
    expect(container.querySelectorAll('li')).toHaveLength(2)
    // The angle brackets are text content, not a script element.
    expect(container.querySelector('script')).toBeNull()
    expect(container.textContent).toContain('<script>alert(1)</script>')
  })

  it('renders nothing for an empty narrative', () => {
    expect(renderMarkdown('')).toBeNull()
    expect(renderMarkdown(null)).toBeNull()
    expect(renderMarkdown('   \n ')).toBeNull()
  })

  it('strips a heading marker rather than emitting a heading', () => {
    const { container } = render(<div>{renderMarkdown('## Not a heading')}</div>)
    expect(container.querySelector('h2')).toBeNull()
    expect(container.textContent).toBe('Not a heading')
  })
})
