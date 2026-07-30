import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { NavbarSearchPanel } from './NavbarSearchPanel'
import { groupRows, type SearchRow } from '../../lib/site-search'

const rows: SearchRow[] = [
  {
    id: 'account.password',
    kind: 'place',
    title: 'Change your password',
    description: 'Set a new password from the Security tab',
    category: 'Account',
    href: '/settings?tab=security',
    icon: 'KeyRound',
    howTo: ['Open Settings.', 'Select the Security tab.'],
  },
  {
    id: 'project:1',
    kind: 'project',
    title: 'Reef Watch',
    description: 'Coral monitoring',
    category: 'Projects',
    href: '/projects/1',
    icon: 'FolderKanban',
  },
]

function renderPanel(overrides: Partial<Parameters<typeof NavbarSearchPanel>[0]> = {}) {
  const props = {
    open: true,
    query: 'pass',
    groups: groupRows(rows),
    rows,
    activeIndex: 0,
    onHover: vi.fn(),
    expandedId: null,
    onToggleExpand: vi.fn(),
    onSelect: vi.fn(),
    onSeeAll: vi.fn(),
    aiMode: false,
    onToggleAiMode: vi.fn(),
    aiAnswer: null,
    aiSteps: [],
    aiLoading: false,
    aiError: false,
    contentLoading: false,
    suggestions: [],
    recent: [],
    onPickRecent: vi.fn(),
    onClearRecent: vi.fn(),
    ...overrides,
  }
  return { props, ...render(<NavbarSearchPanel {...props} />) }
}

afterEach(cleanup)

describe('NavbarSearchPanel', () => {
  it('renders results grouped by kind', () => {
    renderPanel()
    expect(screen.getByText('Places & Actions')).toBeTruthy()
    // "Projects" is both a group heading and a row's category chip
    expect(screen.getAllByText('Projects').length).toBeGreaterThan(0)
    expect(screen.getByText('Change your password')).toBeTruthy()
    expect(screen.getByText('Reef Watch')).toBeTruthy()
  })

  it('always offers the full-text fallback', () => {
    const { props } = renderPanel()
    fireEvent.click(screen.getByText(/See all results/))
    expect(props.onSeeAll).toHaveBeenCalled()
  })

  it('navigates on row click and expands on the chevron', () => {
    const { props } = renderPanel()
    fireEvent.click(screen.getByText('Change your password'))
    expect(props.onSelect).toHaveBeenCalledWith(rows[0])

    fireEvent.click(screen.getByLabelText('Show details for Change your password'))
    expect(props.onToggleExpand).toHaveBeenCalledWith('account.password')
  })

  it('shows the how-to steps for an expanded row', () => {
    renderPanel({ expandedId: 'account.password' })
    expect(screen.getByText('Select the Security tab.')).toBeTruthy()
  })

  it('shows the AI answer and steps in AI mode', () => {
    renderPanel({ aiMode: true, aiAnswer: 'Head to Settings.', aiSteps: ['Click your avatar.'] })
    expect(screen.getByText('Head to Settings.')).toBeTruthy()
    expect(screen.getByText('Click your avatar.')).toBeTruthy()
  })

  it('falls back to a notice when AI navigation fails', () => {
    renderPanel({ aiMode: true, aiError: true })
    expect(screen.getByText(/AI navigation is unavailable/)).toBeTruthy()
  })

  it('offers recent searches and suggestions when the query is empty', () => {
    const { props } = renderPanel({
      query: '',
      groups: [],
      rows: [],
      recent: ['grants'],
      suggestions: [rows[1]],
    })
    fireEvent.click(screen.getByText('grants'))
    expect(props.onPickRecent).toHaveBeenCalledWith('grants')
    expect(screen.getByText('Reef Watch')).toBeTruthy()
  })
})
