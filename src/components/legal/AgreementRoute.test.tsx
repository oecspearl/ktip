import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes } from 'react-router'
import { AgreementRoute } from './AgreementRoute'

const gate = {
  loading: false,
  needsAgreement: false,
  outstanding: [] as unknown[],
  accept: vi.fn(),
  accepting: false,
  error: null,
}

vi.mock('../../hooks/useAgreementGate', () => ({
  useAgreementGate: () => gate,
  useConsents: () => ({
    data: [
      { bundle: 'publishing', document_key: 'content-licence', accepted_at: '2026-09-01T10:00:00Z' },
      { bundle: 'publishing', document_key: 'copyright', accepted_at: '2026-09-01T10:00:00Z' },
    ],
  }),
}))
vi.mock('../RouteSplash', () => ({
  RouteSplash: () => <div>SPLASH</div>,
}))
// The real modal is a scroll-gated legal document; what this file tests is
// when the route opens it and what happens on each way out of it.
vi.mock('./AgreementGate', () => ({
  AgreementGateModal: (props: {
    mode: string
    context: string
    onAccepted: () => void
    onClose: () => void
  }) => (
    <div>
      <p>MODAL {props.mode} {props.context}</p>
      <button onClick={props.onAccepted}>agree</button>
      <button onClick={props.onClose}>go back</button>
    </div>
  ),
}))

afterEach(() => {
  cleanup()
  gate.loading = false
  gate.outstanding = []
})

function renderAt(entries: string[]) {
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
      <Routes>
        <Route element={<AgreementRoute bundle="publishing" context="project" leaveTo="/projects" />}>
          <Route
            path="/projects/new"
            element={
              <div>
                CREATE PAGE <Link to="/projects">to list</Link>
              </div>
            }
          />
        </Route>
        <Route
          path="/projects"
          element={
            <div>
              PROJECTS <Link to="/projects/new">to create</Link>
            </div>
          }
        />
        <Route path="/somewhere" element={<div>SOMEWHERE</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('AgreementRoute', () => {
  it('waits for the consent state rather than guessing', () => {
    gate.loading = true
    renderAt(['/projects/new'])
    expect(screen.getByText('SPLASH')).toBeInTheDocument()
  })

  it('opens the notice on entry even when nothing is outstanding, and holds the page back', () => {
    renderAt(['/projects/new'])
    expect(screen.getByText('MODAL entry project')).toBeInTheDocument()
    expect(screen.queryByText(/CREATE PAGE/)).not.toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: 'IP notice' })).not.toBeInTheDocument()
  })

  it('shows the page and the agreed band once accepted', () => {
    renderAt(['/projects/new'])
    fireEvent.click(screen.getByText('agree'))

    expect(screen.getByText(/CREATE PAGE/)).toBeInTheDocument()
    const band = screen.getByRole('complementary', { name: 'IP notice' })
    expect(band).toHaveTextContent('You agreed to the publishing terms.')
    expect(band).toHaveTextContent(/Agreed/)
    expect(screen.getByRole('link', { name: 'IP, Content & Licensing Policy' })).toHaveAttribute(
      'href',
      '/legal/content-licence',
    )
    expect(screen.queryByText(/MODAL/)).not.toBeInTheDocument()
  })

  it('asks again on the next visit', () => {
    renderAt(['/projects/new'])
    fireEvent.click(screen.getByText('agree'))
    fireEvent.click(screen.getByText('to list'))
    expect(screen.getByText(/PROJECTS/)).toBeInTheDocument()

    fireEvent.click(screen.getByText('to create'))
    expect(screen.getByText('MODAL entry project')).toBeInTheDocument()
    expect(screen.queryByText(/CREATE PAGE/)).not.toBeInTheDocument()
  })

  it('goes back where the member came from', () => {
    renderAt(['/somewhere', '/projects/new'])
    fireEvent.click(screen.getByText('go back'))
    expect(screen.getByText('SOMEWHERE')).toBeInTheDocument()
  })

  it('falls back to leaveTo when the page was opened directly', () => {
    renderAt(['/projects/new'])
    fireEvent.click(screen.getByText('go back'))
    expect(screen.getByText(/PROJECTS/)).toBeInTheDocument()
  })
})
