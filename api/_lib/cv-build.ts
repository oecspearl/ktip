import type { CatalogItem, Enrollment } from './vc-catalog'
import type {
  ResumeCourse,
  ResumeData,
  ResumeSkillGroup,
  ResumeSources,
} from '../../src/types/resume'

/**
 * Builds a CV from what the Virtual Campus knows, and merges it into whatever
 * the user has already written.
 *
 * The generated document is deliberately partial. The Virtual Campus holds
 * identity and course history; it holds no employment record at all, so
 * `roles` — the résumé's main timeline — comes back empty and stays empty until
 * the user fills it in. Inventing experience from course enrollments would put
 * fiction on a document somebody hands to an employer.
 *
 * The merge rule is the whole point of this file: a path is overwritten only if
 * its recorded source is 'vc' or it has never been written. See migration 069.
 */

export interface CvIdentityInput {
  name: string
  email: string
  phone: string
  country: string | null
  locale: string | null
  institution: string | null
  program: string | null
  gradeLevel: string | null
  role: string | null
  website: string | null
}

const VC_INSTITUTION_FALLBACK = 'OECS Virtual Campus'

/** ISO-639 codes the OECS actually sees. Anything else passes through as-is. */
const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  fr: 'French',
  es: 'Spanish',
  nl: 'Dutch',
  pt: 'Portuguese',
}

function languageFromLocale(locale: string | null): string[] {
  if (!locale) return []
  const code = locale.split(/[-_]/)[0].toLowerCase()
  const name = LANGUAGE_NAMES[code]
  return name ? [name] : []
}

/**
 * Two characters for the skill circle. Prefers the initials of a multi-word
 * area ("Language Arts" -> "LA") and falls back to the first two letters, which
 * is what reads best at 52px.
 */
function abbreviate(area: string): string {
  const words = area.trim().split(/\s+/).filter(Boolean)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return area.trim().slice(0, 2).replace(/^./, (c) => c.toUpperCase())
}

function completedAtFor(enrollment: Enrollment): string | null {
  // The enrollment payload has no completion timestamp. Rather than fabricate
  // one, completion is only dated when the platform itself supplies it.
  const raw = enrollment as unknown as Record<string, unknown>
  const value = raw.completed_at ?? raw.completedAt
  return typeof value === 'string' ? value : null
}

export function buildCourses(
  enrollments: Enrollment[],
  catalog: Map<string, CatalogItem>
): ResumeCourse[] {
  return enrollments
    .map((enrollment) => {
      const item = catalog.get(enrollment.course_id)
      const progress = Math.max(0, Math.min(100, Math.round(enrollment.progress_percentage ?? 0)))
      const title = enrollment.courses?.title || item?.title || 'Untitled course'

      return {
        courseId: enrollment.course_id,
        title,
        // Native campus courses carry no provider_name — the campus IS the provider.
        provider: item?.provider_name || VC_INSTITUTION_FALLBACK,
        subjectArea: item?.subject_area ?? null,
        gradeLevel: item?.grade_level ?? null,
        difficulty: item?.difficulty ?? null,
        status: progress >= 100 ? ('completed' as const) : ('in_progress' as const),
        progressPercentage: progress,
        enrolledAt: enrollment.enrolled_at ?? null,
        completedAt: completedAtFor(enrollment),
        courseUrl:
          enrollment.courses?.external_launch_url ||
          item?.external_launch_url ||
          item?.canonical_url ||
          null,
      }
    })
    // Completed work first, then furthest progressed. A CV leads with what was
    // finished, not with what happens to have been enrolled most recently.
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'completed' ? -1 : 1
      if (b.progressPercentage !== a.progressPercentage) {
        return b.progressPercentage - a.progressPercentage
      }
      return a.title.localeCompare(b.title)
    })
}

/**
 * Completed courses, grouped by curated subject area, become the skill circles.
 *
 * Only completed courses count. A half-finished course is a fact worth listing
 * under Courses, but it is not a demonstrated skill, and treating it as one is
 * exactly the kind of inflation that makes an auto-generated CV worthless.
 *
 * Courses with no subject tag are dropped rather than bucketed into "Other" —
 * an untagged group reads as filler on a printed page.
 */
export function buildSkills(courses: ResumeCourse[]): ResumeSkillGroup[] {
  const byArea = new Map<string, string[]>()

  for (const course of courses) {
    if (course.status !== 'completed') continue
    const area = course.subjectArea?.trim()
    if (!area) continue
    const list = byArea.get(area) ?? []
    if (!list.includes(course.title)) list.push(course.title)
    byArea.set(area, list)
  }

  return Array.from(byArea.entries())
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([area, skills]) => ({ area, abbr: abbreviate(area), skills: skills.sort() }))
}

/** "Academic Competencies" — one line per subject, the course titles as prose. */
export function buildAcademic(skills: ResumeSkillGroup[]) {
  return skills.map((group) => ({ subject: group.area, skills: group.skills.join(', ') }))
}

function buildAbout(identity: CvIdentityInput, courses: ResumeCourse[]): string[] {
  const completed = courses.filter((c) => c.status === 'completed').length
  const institution = identity.institution || VC_INSTITUTION_FALLBACK
  const paragraphs: string[] = []

  const opening = identity.program
    ? `Learner at ${institution}, studying ${identity.program}.`
    : `Learner at ${institution}.`
  paragraphs.push(opening)

  if (completed > 0) {
    const areas = Array.from(
      new Set(courses.filter((c) => c.status === 'completed' && c.subjectArea).map((c) => c.subjectArea!))
    )
    const scope = areas.length > 0 ? ` across ${areas.slice(0, 3).join(', ')}` : ''
    paragraphs.push(
      `Completed ${completed} course${completed === 1 ? '' : 's'}${scope} through the OECS Virtual Campus.`
    )
  }

  // Said plainly, because the alternative is a learner discovering later that
  // their CV opened with a sentence a machine wrote in their voice.
  paragraphs.push(
    'This summary was generated from Virtual Campus records — edit it to describe yourself in your own words.'
  )

  return paragraphs
}

export function buildResumeData(
  identity: CvIdentityInput,
  enrollments: Enrollment[],
  catalog: Map<string, CatalogItem>
): ResumeData {
  const courses = buildCourses(enrollments, catalog)
  const skills = buildSkills(courses)
  const institution = identity.institution || VC_INSTITUTION_FALLBACK

  const socials = identity.website
    ? [{ label: 'Website', href: identity.website }]
    : []

  return {
    profile: {
      name: identity.name,
      role: identity.role
        ? `${identity.role[0].toUpperCase()}${identity.role.slice(1)} · ${institution}`
        : `Student · ${institution}`,
      location: identity.country ?? '',
      email: identity.email,
      phone: identity.phone,
      socials,
      about: buildAbout(identity, courses),
    },
    // Empty on purpose — see the file header.
    roles: [],
    education: identity.program
      ? [
          {
            credential: identity.gradeLevel
              ? `${identity.program} (${identity.gradeLevel})`
              : identity.program,
            school: institution,
            year: String(new Date().getUTCFullYear()),
          },
        ]
      : [],
    courses,
    skills,
    languages: languageFromLocale(identity.locale),
    // Completed course titles read as claims of competence, so they are listed
    // as what they are rather than dressed up as professional skills.
    professionalSkills: courses
      .filter((c) => c.status === 'completed')
      .slice(0, 8)
      .map((c) => `${c.title} — completed via ${c.provider}`),
    academic: buildAcademic(skills),
    interests: '',
  }
}

// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------

function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key]
    return undefined
  }, obj)
}

function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.')
  let cursor = obj
  for (const key of keys.slice(0, -1)) {
    if (!cursor[key] || typeof cursor[key] !== 'object') cursor[key] = {}
    cursor = cursor[key] as Record<string, unknown>
  }
  cursor[keys[keys.length - 1]] = value
}

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  return false
}

export interface MergeResult {
  data: ResumeData
  sources: ResumeSources
}

/**
 * Folds freshly generated Virtual Campus data into the stored document.
 *
 * For each path:
 *   - source 'manual'  -> keep what the user wrote, always.
 *   - anything else    -> take the generated value, unless it is empty and the
 *                         stored value is not. An empty generated field means
 *                         "the campus told us nothing this time", which must
 *                         not erase a value an earlier sync did produce.
 *
 * Paths are whole sections for arrays (`courses`, `roles`, `skills`). Merging
 * an array element-by-element would resurrect entries the user deleted, and a
 * CV the user cannot prune is a CV they will not use.
 */
export function mergeResume(
  stored: ResumeData | null,
  storedSources: ResumeSources | null,
  generated: ResumeData,
  paths: readonly string[]
): MergeResult {
  if (!stored) {
    const sources: ResumeSources = {}
    for (const path of paths) sources[path] = 'vc'
    return { data: generated, sources }
  }

  const data = JSON.parse(JSON.stringify(stored)) as Record<string, unknown>
  const sources: ResumeSources = { ...(storedSources ?? {}) }

  for (const path of paths) {
    if (sources[path] === 'manual') continue

    const next = getPath(generated, path)
    const current = getPath(stored, path)
    if (isEmpty(next) && !isEmpty(current)) continue

    setPath(data, path, next)
    sources[path] = 'vc'
  }

  return { data: data as unknown as ResumeData, sources }
}
