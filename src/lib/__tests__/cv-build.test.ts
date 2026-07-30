import { describe, expect, it } from 'vitest'
import {
  buildCourses,
  buildKtipResumeData,
  buildResumeData,
  buildSkills,
  mergeResume,
  type CvIdentityInput,
  type KtipCvInput,
} from '../../../api/_lib/cv-build'
import type { CatalogItem, Enrollment } from '../../../api/_lib/vc-catalog'
import { RESUME_PATHS, emptyResumeData, type ResumeData } from '../../types/resume'

/**
 * The CV builder and its merge policy.
 *
 * The merge rule is the load-bearing one: it is what makes "Sync from Virtual
 * Campus" safe to press after the user has edited their CV. Get it wrong in
 * either direction and the feature is either useless (never updates) or
 * destructive (eats hand-written work).
 */

const IDENTITY: CvIdentityInput = {
  name: 'Ama Charles',
  email: 'ama@example.org',
  phone: '+1 758 555 0100',
  country: 'Saint Lucia',
  locale: 'en-LC',
  institution: 'Sir Arthur Lewis Community College',
  program: 'Computer Science',
  gradeLevel: 'Year 2',
  role: 'student',
  website: null,
}

function enrollment(id: string, progress: number, title: string): Enrollment {
  return {
    id: `e-${id}`,
    status: 'active',
    enrolled_at: '2026-01-15T12:00:00Z',
    progress_percentage: progress,
    course_id: id,
    courses: { id, title, published: true },
  }
}

function catalog(entries: Partial<CatalogItem>[]): Map<string, CatalogItem> {
  const map = new Map<string, CatalogItem>()
  for (const entry of entries) {
    map.set(entry.course_id!, {
      catalog_type: 'native',
      title: 'x',
      ...entry,
    } as CatalogItem)
  }
  return map
}

describe('buildCourses', () => {
  it('marks 100% as completed and anything less as in progress', () => {
    const courses = buildCourses(
      [enrollment('a', 100, 'Done'), enrollment('b', 40, 'Halfway')],
      catalog([])
    )
    expect(courses.find((c) => c.courseId === 'a')?.status).toBe('completed')
    expect(courses.find((c) => c.courseId === 'b')?.status).toBe('in_progress')
  })

  it('leads with completed work, then the furthest progressed', () => {
    const courses = buildCourses(
      [enrollment('a', 20, 'Barely'), enrollment('b', 80, 'Nearly'), enrollment('c', 100, 'Done')],
      catalog([])
    )
    expect(courses.map((c) => c.courseId)).toEqual(['c', 'b', 'a'])
  })

  it('clamps out-of-range progress rather than trusting the payload', () => {
    const courses = buildCourses([enrollment('a', 240, 'Odd')], catalog([]))
    expect(courses[0].progressPercentage).toBe(100)
  })

  it('takes subject and difficulty from the catalogue when it can', () => {
    const courses = buildCourses(
      [enrollment('a', 100, 'Intro')],
      catalog([{ course_id: 'a', subject_area: 'Science', difficulty: 'beginner' }])
    )
    expect(courses[0].subjectArea).toBe('Science')
    expect(courses[0].difficulty).toBe('beginner')
  })

  it('still produces a course when the catalogue has never heard of it', () => {
    const courses = buildCourses([enrollment('zz', 100, 'Orphan')], catalog([]))
    expect(courses).toHaveLength(1)
    expect(courses[0].title).toBe('Orphan')
    expect(courses[0].subjectArea).toBeNull()
  })
})

describe('buildSkills', () => {
  it('counts only completed courses — a half-read course is not a skill', () => {
    const courses = buildCourses(
      [enrollment('a', 100, 'Algebra'), enrollment('b', 50, 'Calculus')],
      catalog([
        { course_id: 'a', subject_area: 'Mathematics' },
        { course_id: 'b', subject_area: 'Mathematics' },
      ])
    )
    const skills = buildSkills(courses)
    expect(skills).toHaveLength(1)
    expect(skills[0].skills).toEqual(['Algebra'])
  })

  it('drops untagged courses instead of bucketing them into "Other"', () => {
    const courses = buildCourses([enrollment('a', 100, 'Mystery')], catalog([]))
    expect(buildSkills(courses)).toEqual([])
  })

  it('abbreviates multi-word areas to initials and single words to two letters', () => {
    const courses = buildCourses(
      [enrollment('a', 100, 'One'), enrollment('b', 100, 'Two')],
      catalog([
        { course_id: 'a', subject_area: 'Language Arts' },
        { course_id: 'b', subject_area: 'Science' },
      ])
    )
    const byArea = Object.fromEntries(buildSkills(courses).map((g) => [g.area, g.abbr]))
    expect(byArea['Language Arts']).toBe('LA')
    expect(byArea['Science']).toBe('Sc')
  })
})

describe('buildResumeData', () => {
  it('leaves experience empty — the campus holds no employment record', () => {
    const data = buildResumeData(IDENTITY, [enrollment('a', 100, 'X')], catalog([]))
    expect(data.roles).toEqual([])
  })

  it('says out loud that the summary was generated', () => {
    const data = buildResumeData(IDENTITY, [], catalog([]))
    expect(data.profile.about.join(' ')).toMatch(/generated from Virtual Campus records/i)
  })

  it('builds a usable document from a token that carried almost nothing', () => {
    const bare: CvIdentityInput = {
      name: 'ama',
      email: 'ama@example.org',
      phone: '',
      country: null,
      locale: null,
      institution: null,
      program: null,
      gradeLevel: null,
      role: null,
      website: null,
    }
    const data = buildResumeData(bare, [], catalog([]))
    expect(data.profile.name).toBe('ama')
    expect(data.profile.role).toBe('Student · OECS Virtual Campus')
    expect(data.education).toEqual([])
    expect(data.languages).toEqual([])
  })

  it('reads a language out of the locale', () => {
    expect(buildResumeData(IDENTITY, [], catalog([])).languages).toEqual(['English'])
  })
})

describe('mergeResume', () => {
  const generated = (): ResumeData => ({
    ...emptyResumeData(),
    profile: { ...emptyResumeData().profile, name: 'From Campus', about: ['Generated.'] },
    courses: buildCourses([enrollment('a', 100, 'Course A')], catalog([])),
  })

  it('adopts everything wholesale when there is nothing stored yet', () => {
    const result = mergeResume(null, null, generated(), RESUME_PATHS)
    expect(result.data.profile.name).toBe('From Campus')
    expect(result.sources['profile.name']).toBe('vc')
  })

  it('never touches a path the user has edited', () => {
    const stored: ResumeData = {
      ...emptyResumeData(),
      profile: { ...emptyResumeData().profile, name: 'My Own Name', about: ['I wrote this.'] },
    }
    const result = mergeResume(
      stored,
      { 'profile.name': 'manual', 'profile.about': 'manual' },
      generated(),
      RESUME_PATHS
    )
    expect(result.data.profile.name).toBe('My Own Name')
    expect(result.data.profile.about).toEqual(['I wrote this.'])
    // ...while a path the user never touched still refreshes.
    expect(result.data.courses).toHaveLength(1)
  })

  it('overwrites a path a previous sync wrote', () => {
    const stored: ResumeData = {
      ...emptyResumeData(),
      profile: { ...emptyResumeData().profile, name: 'Stale Name' },
    }
    const result = mergeResume(stored, { 'profile.name': 'vc' }, generated(), RESUME_PATHS)
    expect(result.data.profile.name).toBe('From Campus')
  })

  it('does not let an empty campus response erase a value an earlier sync produced', () => {
    const stored: ResumeData = {
      ...emptyResumeData(),
      courses: buildCourses([enrollment('a', 100, 'Kept')], catalog([])),
    }
    const empty = { ...emptyResumeData() }
    const result = mergeResume(stored, { courses: 'vc' }, empty, RESUME_PATHS)
    expect(result.data.courses).toHaveLength(1)
  })

  it('honours a deletion — a course the user removed does not come back', () => {
    const stored: ResumeData = { ...emptyResumeData(), courses: [] }
    const result = mergeResume(stored, { courses: 'manual' }, generated(), RESUME_PATHS)
    expect(result.data.courses).toEqual([])
  })

  it('leaves the stored document untouched', () => {
    const stored: ResumeData = {
      ...emptyResumeData(),
      profile: { ...emptyResumeData().profile, name: 'Original' },
    }
    mergeResume(stored, {}, generated(), RESUME_PATHS)
    expect(stored.profile.name).toBe('Original')
  })

  it('claims only the paths it actually filled', () => {
    // The campus generates no `interests` and no `projects`. Stamping them 'vc'
    // anyway is how the sync came to own fields it never writes, which locked
    // the KTIP generator out of them permanently.
    const result = mergeResume(null, null, generated(), RESUME_PATHS, 'vc')
    expect(result.sources['profile.name']).toBe('vc')
    expect(result.sources['interests']).toBeUndefined()
    expect(result.sources['projects']).toBeUndefined()
  })
})

describe('mergeResume provenance ranks', () => {
  const named = (name: string): ResumeData => ({
    ...emptyResumeData(),
    profile: { ...emptyResumeData().profile, name },
  })

  it('lets the campus overwrite what KTIP guessed', () => {
    const result = mergeResume(
      named('KTIP Guess'),
      { 'profile.name': 'ktip' },
      named('From Campus'),
      RESUME_PATHS,
      'vc'
    )
    expect(result.data.profile.name).toBe('From Campus')
    expect(result.sources['profile.name']).toBe('vc')
  })

  it('does not let KTIP overwrite what the campus supplied', () => {
    const result = mergeResume(
      named('From Campus'),
      { 'profile.name': 'vc' },
      named('KTIP Guess'),
      RESUME_PATHS,
      'ktip'
    )
    expect(result.data.profile.name).toBe('From Campus')
    expect(result.sources['profile.name']).toBe('vc')
  })

  it('lets KTIP fill a path nobody has written', () => {
    const result = mergeResume(emptyResumeData(), {}, named('KTIP Guess'), RESUME_PATHS, 'ktip')
    expect(result.data.profile.name).toBe('KTIP Guess')
    expect(result.sources['profile.name']).toBe('ktip')
  })

  it('leaves a hand edit alone whichever generator runs', () => {
    for (const owner of ['vc', 'ktip'] as const) {
      const result = mergeResume(
        named('My Own Name'),
        { 'profile.name': 'manual' },
        named('Generated'),
        RESUME_PATHS,
        owner
      )
      expect(result.data.profile.name).toBe('My Own Name')
      expect(result.sources['profile.name']).toBe('manual')
    }
  })
})

describe('buildKtipResumeData', () => {
  const input = (over: Partial<KtipCvInput> = {}): KtipCvInput => ({
    email: 'ama@example.org',
    profile: {
      display_name: 'Ama Charles',
      bio: 'Builds things for schools.',
      country: 'Saint Lucia',
      organization: 'OECS Commission',
      industry: 'Education & Training',
      skills: ['Curriculum Design', 'Monitoring & Evaluation'],
      interests: ['Education Technology', 'Youth Development'],
      open_to: ['mentoring'],
      phone: '+1 758 555 0100',
      website: 'https://example.org',
      languages: ['English', 'Kwéyòl'],
    },
    projects: [],
    awards: [],
    institutions: [],
    employers: [],
    ...over,
  })

  it('leaves experience empty — a project is not a job', () => {
    const data = buildKtipResumeData(
      input({
        projects: [
          {
            title: 'Water Telemetry',
            summary: 'Sensor network.',
            description: null,
            category: 'Climate',
            phase: 'launch',
          },
        ],
      })
    )
    expect(data.roles).toEqual([])
    expect(data.projects).toHaveLength(1)
    expect(data.projects[0].title).toBe('Water Telemetry')
  })

  it('never generates courses — those are the campus\'s to own', () => {
    expect(buildKtipResumeData(input()).courses).toEqual([])
    expect(buildKtipResumeData(input()).academic).toEqual([])
  })

  it('maps the profile contact fields onto the document', () => {
    const data = buildKtipResumeData(input())
    expect(data.profile.phone).toBe('+1 758 555 0100')
    expect(data.profile.socials).toEqual([{ label: 'Website', href: 'https://example.org' }])
    expect(data.languages).toEqual(['English', 'Kwéyòl'])
    expect(data.interests).toBe('Education Technology · Youth Development')
  })

  it('derives the skill-circle abbreviation rather than hardcoding it', () => {
    // The old client-side copy wrote abbr: 'Sk' literally, and the two mappings
    // produced visibly different CVs depending on which page created the row.
    const data = buildKtipResumeData(input())
    expect(data.skills).toHaveLength(1)
    expect(data.skills[0].abbr).toBe('Sk')
    expect(data.skills[0].abbr).toBe(buildSkills(
      buildCourses([enrollment('a', 100, 'X')], catalog([{ course_id: 'a', subject_area: 'Skills' }]))
    )[0].abbr)
  })

  it('turns an approved institution membership into an education entry', () => {
    const data = buildKtipResumeData(
      input({
        institutions: [
          { name: 'Sir Arthur Lewis Community College', role: 'student', approved_at: '2025-09-01T00:00:00Z' },
        ],
      })
    )
    expect(data.education).toEqual([
      { credential: 'Student', school: 'Sir Arthur Lewis Community College', year: '2025' },
    ])
  })

  it('falls back to an employer only when the profile names no organisation', () => {
    const withOrg = buildKtipResumeData(
      input({ employers: [{ name: 'CaribbeanCloud Ltd', role: 'owner' }] })
    )
    expect(withOrg.profile.role).toBe('OECS Commission · Education & Training')

    const withoutOrg = buildKtipResumeData(
      input({
        profile: { ...input().profile, organization: null },
        employers: [{ name: 'CaribbeanCloud Ltd', role: 'owner' }],
      })
    )
    expect(withoutOrg.profile.role).toBe('CaribbeanCloud Ltd · Education & Training')
  })

  it('survives a profile with nothing on it', () => {
    const data = buildKtipResumeData({
      email: 'nobody@example.org',
      profile: {
        display_name: null,
        bio: null,
        country: null,
        organization: null,
        industry: null,
        skills: null,
        interests: null,
        open_to: null,
      },
      projects: [],
      awards: [],
      institutions: [],
      employers: [],
    })
    expect(data.profile.email).toBe('nobody@example.org')
    expect(data.profile.name).toBe('')
    expect(data.skills).toEqual([])
    expect(data.languages).toEqual([])
  })
})
