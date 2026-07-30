import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { RESUME_DESIGNS } from '../../../lib/resume-designs'
import { emptyResumeData, type ResumeData } from '../../../types/resume'
import { sheetFor } from './index'

/**
 * Every design has to survive both ends of the data range.
 *
 * The empty case is the one that bites: a stored row whose `data` is `{}` is
 * reachable (it is the table default), and a sheet that reaches into
 * `data.profile.name` without it white-screens the CV page permanently for that
 * member. useResume guards the document, and these assert the sheets do not
 * depend on that guard being perfect.
 */

const FULL: ResumeData = {
  profile: {
    name: 'Andre Williams',
    role: 'CTO · CaribbeanCloud Ltd',
    location: 'Montserrat',
    email: 'andre@example.com',
    phone: '+1 664 555 0100',
    socials: [
      { label: 'LinkedIn', href: 'https://linkedin.com/in/example' },
      { label: 'Portfolio', href: 'https://example.com' },
    ],
    about: ['Advocates for open data and digital government in the OECS.'],
  },
  roles: [
    {
      org: 'CaribbeanCloud Ltd',
      title: 'Chief Technology Officer',
      period: '2021 — now',
      location: 'Montserrat',
      points: ['Built the island-wide water telemetry platform.'],
    },
  ],
  education: [{ credential: 'BSc Computer Science', school: 'UWI', year: '2016' }],
  courses: [
    {
      courseId: 'c1',
      title: 'Climate Data Foundations',
      provider: 'OECS Virtual Campus',
      subjectArea: 'Climate',
      gradeLevel: null,
      difficulty: null,
      status: 'completed',
      progressPercentage: 100,
      enrolledAt: null,
      completedAt: null,
      courseUrl: null,
    },
  ],
  skills: [{ area: 'Software', abbr: 'So', skills: ['TypeScript', 'Postgres'] }],
  languages: ['English', 'French'],
  professionalSkills: ['Mentoring'],
  academic: [{ subject: 'Data', skills: 'Modelling, analysis' }],
  interests: 'Sailing, open data.',
}

describe.each(Object.keys(RESUME_DESIGNS))('%s sheet', (id) => {
  const design = RESUME_DESIGNS[id]
  const Sheet = sheetFor(id)

  it('renders a full document with the name as the page heading', () => {
    render(
      <MemoryRouter>
        <Sheet data={FULL} avatarUrl={null} theme="color" design={design} />
      </MemoryRouter>
    )
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Andre Williams')
    // The contact block must stay clickable — Chrome keeps anchors as live
    // links in the saved PDF, and the old print-only sheet dropped them.
    expect(screen.getByRole('link', { name: 'andre@example.com' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'LinkedIn' })).toBeTruthy()
  })

  it('renders an empty document without throwing', () => {
    const { container } = render(
      <MemoryRouter>
        <Sheet data={emptyResumeData()} avatarUrl={null} theme="mono" design={design} />
      </MemoryRouter>
    )
    expect(container.querySelector('.resume-sheet')).toBeTruthy()
  })

  it('drops the print identity in thumbnail mode', () => {
    const { container } = render(
      <MemoryRouter>
        <Sheet data={FULL} avatarUrl={null} theme="color" design={design} thumbnail />
      </MemoryRouter>
    )
    // Sharing `.resume-sheet` or the id would let the print rules pin every
    // picker candidate to the page origin and print them on top of each other.
    expect(container.querySelector('.resume-sheet')).toBeNull()
    expect(container.querySelector('#resume-sheet')).toBeNull()
    expect(container.querySelector('.resume-thumb')).toBeTruthy()
  })
})
