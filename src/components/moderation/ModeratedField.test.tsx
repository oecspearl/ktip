import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { I18nTestProvider } from '../../test/i18n'
import { ModeratedTextarea } from './ModeratedField'
import { buildSegments } from './segments'
import type { FieldModeration } from '../../hooks/useContentModeration'

const moderationFor = (
  ranges: Array<{ start: number; end: number; severity: 'low' | 'medium' | 'high' }>,
  onRemoveRange = vi.fn(),
  blocked = true
): FieldModeration => ({
  severity: blocked ? 'medium' : 'low',
  advisorySeverity: blocked ? 'medium' : 'low',
  matches: [],
  blocked,
  overlay: { ranges, onRemoveRange },
  flaggedTerms: ['bogus'],
})

function renderField(props: Partial<Parameters<typeof ModeratedTextarea>[0]> = {}) {
  const value = props.value ?? 'this is bogus text'
  return render(
    <I18nTestProvider>
      <ModeratedTextarea
        label="Content"
        value={value}
        onChange={() => {}}
        moderation={moderationFor([{ start: 8, end: 13, severity: 'medium' }])}
        {...props}
      />
    </I18nTestProvider>
  )
}

describe('buildSegments', () => {
  it('splits a value into plain and flagged runs', () => {
    expect(buildSegments('this is bogus text', [{ start: 8, end: 13, severity: 'medium' }])).toEqual([
      { text: 'this is ' },
      { text: 'bogus', range: { start: 8, end: 13, severity: 'medium' } },
      { text: ' text' },
    ])
  })

  it('clamps a stale range that points past the end of the value', () => {
    // One frame after a fast delete, the previous scan's ranges can still point
    // beyond the new value. Slicing blindly would drop the member's tail text
    // out of the mirror while the field still shows it.
    const segments = buildSegments('short', [{ start: 2, end: 99, severity: 'high' }])
    expect(segments.map((s) => s.text).join('')).toBe('short')
  })

  it('returns the whole value untouched when nothing is flagged', () => {
    expect(buildSegments('all clear', [])).toEqual([{ text: 'all clear' }])
  })
})

describe('ModeratedTextarea', () => {
  it('paints the flagged run in the mirror and leaves the field text intact', () => {
    const { container } = renderField()
    const mark = container.querySelector('mark')
    expect(mark?.textContent).toBe('bogus')
    expect(screen.getByLabelText('Content')).toHaveValue('this is bogus text')
  })

  it('marks the field invalid so it is not colour-only', () => {
    renderField()
    expect(screen.getByLabelText('Content')).toHaveAttribute('aria-invalid', 'true')
  })

  it('offers the flagged word as a removable chip', () => {
    const onRemoveRange = vi.fn()
    renderField({ moderation: moderationFor([{ start: 8, end: 13, severity: 'medium' }], onRemoveRange) })

    fireEvent.click(screen.getByRole('button', { name: /Remove "bogus"/ }))
    expect(onRemoveRange).toHaveBeenCalledWith({ start: 8, end: 13, severity: 'medium' })
  })

  it('renders no mirror at all when nothing is flagged', () => {
    const { container } = renderField({
      moderation: { ...moderationFor([], vi.fn(), false), flaggedTerms: [] },
    })
    expect(container.querySelector('mark')).toBeNull()
  })

  it('opens the remove popover from the caret, not from a click on the mark', () => {
    // The marks sit behind the field and can never be clicked; the hit test
    // runs off selectionStart instead.
    const onRemoveRange = vi.fn()
    renderField({ moderation: moderationFor([{ start: 8, end: 13, severity: 'medium' }], onRemoveRange) })

    const field = screen.getByLabelText('Content') as HTMLTextAreaElement
    field.setSelectionRange(10, 10)
    fireEvent.click(field)

    const popover = screen.getByRole('dialog', { name: 'Flagged text' })
    fireEvent.click(popover.querySelector('button')!)
    expect(onRemoveRange).toHaveBeenCalledWith({ start: 8, end: 13, severity: 'medium' })
  })

  it('suppresses the marks while an IME composition is in flight', () => {
    const { container } = renderField()
    fireEvent.compositionStart(screen.getByLabelText('Content'))
    expect(container.querySelector('mark')).toBeNull()
    fireEvent.compositionEnd(screen.getByLabelText('Content'))
    expect(container.querySelector('mark')).not.toBeNull()
  })
})
