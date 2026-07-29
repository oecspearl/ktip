import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { TimelineGantt } from './TimelineGantt'
import type { TimelineItem } from '../../lib/timeline'

const iso = (y: number, m: number, d: number) => new Date(y, m - 1, d).toISOString()

const items: TimelineItem[] = [
  {
    id: 'app-1',
    kind: 'grant_application',
    title: 'Blue Economy Fund',
    href: '/grants/1',
    startAt: iso(2026, 1, 5),
    endAt: null,
    currentKey: 'under_review',
    currentIndex: 1,
    isTerminal: false,
    isRejected: false,
    stages: [
      { key: 'pending', label: 'Applied', reachedAt: iso(2026, 1, 5) },
      { key: 'under_review', label: 'Under Review', reachedAt: iso(2026, 1, 20) },
      { key: 'decision', label: 'Decision', reachedAt: null },
    ],
  },
  {
    id: 'project-1',
    kind: 'project',
    title: 'Reef Monitor',
    href: '/projects/1',
    startAt: iso(2026, 2, 1),
    endAt: null,
    currentKey: 'prototype',
    currentIndex: 1,
    isTerminal: false,
    isRejected: false,
    stages: [
      { key: 'concept', label: 'Concept', reachedAt: iso(2026, 2, 1) },
      { key: 'prototype', label: 'Prototype', reachedAt: iso(2026, 3, 1) },
      { key: 'funding', label: 'Funding', reachedAt: null },
      { key: 'launch', label: 'Launch', reachedAt: null },
    ],
  },
]

describe('TimelineGantt', () => {
  it('renders a swimlane per kind with its items', () => {
    render(<TimelineGantt items={items} selectedId={null} onSelect={vi.fn()} />)

    expect(screen.getByText('Grant Applications')).toBeDefined()
    expect(screen.getByText('Projects')).toBeDefined()
    expect(screen.getByText('Blue Economy Fund')).toBeDefined()
    expect(screen.getByText('Reef Monitor')).toBeDefined()
  })

  it('shows derived status and progress on the bar', () => {
    render(<TimelineGantt items={items} selectedId={null} onSelect={vi.fn()} />)

    expect(screen.getByText('Under Review')).toBeDefined()
    expect(screen.getByText('Prototype')).toBeDefined()

    // 4-stage project at index 1 -> 1/3.
    const bar = screen.getByRole('progressbar', { name: 'Reef Monitor' })
    expect(bar.getAttribute('aria-valuenow')).toBe('33')
  })

  it('reports selection and toggles it off on a second activation', () => {
    const onSelect = vi.fn()
    const { rerender } = render(
      <TimelineGantt items={items} selectedId={null} onSelect={onSelect} />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Blue Economy Fund' }))
    expect(onSelect).toHaveBeenCalledWith('app-1')

    rerender(<TimelineGantt items={items} selectedId="app-1" onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: 'Blue Economy Fund' }))
    expect(onSelect).toHaveBeenLastCalledWith(null)
  })

  it('collapses a swimlane, keeping the group row and hiding its children', () => {
    render(<TimelineGantt items={items} selectedId={null} onSelect={vi.fn()} />)

    const group = screen.getByRole('button', { name: /Grant Applications/ })
    expect(group.getAttribute('aria-expanded')).toBe('true')

    fireEvent.click(group)
    expect(group.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('Blue Economy Fund')).toBeNull()
    expect(screen.getByText('Reef Monitor')).toBeDefined()
  })

  it('switches scale and re-labels the axis', () => {
    render(<TimelineGantt items={items} selectedId={null} onSelect={vi.fn()} />)

    const switcher = screen.getByRole('group', { name: 'Timeline scale' })
    const quarter = within(switcher).getByRole('button', { name: 'Quarter' })

    fireEvent.click(quarter)
    expect(quarter.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText(/^Q\d \d{4} – Q\d \d{4}$/)).toBeDefined()
  })
})
