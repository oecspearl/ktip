import { describe, expect, it } from 'vitest'
import {
  buildCourses,
  buildResumeData,
  buildSkills,
  mergeResume,
  type CvIdentityInput,
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
})
