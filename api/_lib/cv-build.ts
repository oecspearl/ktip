import type { CatalogItem, Enrollment } from './vc-catalog'
import type { VcCredential, VcSkill } from './vc-oidc'
import {
  RESUME_SOURCE_RANK,
  type ResumeAward,
  type ResumeCourse,
  type ResumeCredential,
  type ResumeData,
  type ResumeEducation,
  type ResumeFieldSource,
  type ResumeProject,
  type ResumeSkillGroup,
  type ResumeSocial,
  type ResumeSources,
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
  /**
   * Certificates and skills the learner chose to share, straight off the
   * verified token. Optional because the campus only sends them when the
   * learner opted in, and a sign-in that carries neither is ordinary.
   */
  credentials?: VcCredential[]
  skills?: VcSkill[]
}

const VC_INSTITUTION_FALLBACK = 'OECS Virtual Campus'

/** Bucket for shared skills the campus sent without a category of their own. */
const VC_SKILL_GROUP = 'Verified Skills'

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
export function buildSkills(
  courses: ResumeCourse[],
  vcSkills: VcSkill[] = []
): ResumeSkillGroup[] {
  const byArea = new Map<string, string[]>()

  const add = (area: string, entry: string) => {
    const list = byArea.get(area) ?? []
    // Case-insensitive, because "Data analysis" from a course title and "Data
    // Analysis" from a skill claim are one skill listed twice on a printed page.
    if (!list.some((existing) => existing.toLowerCase() === entry.toLowerCase())) list.push(entry)
    byArea.set(area, list)
  }

  for (const course of courses) {
    if (course.status !== 'completed') continue
    const area = course.subjectArea?.trim()
    if (!area) continue
    add(area, course.title)
  }

  // Skills the learner shared from the campus. Unlike courses these are already
  // skills rather than evidence of one, so they need no completion test — the
  // campus decides what it is willing to assert, and it flags each one.
  for (const skill of vcSkills) {
    const name = skill.name.trim()
    if (!name) continue
    add(skill.category?.trim() || VC_SKILL_GROUP, name)
  }

  return Array.from(byArea.entries())
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([area, skills]) => ({ area, abbr: abbreviate(area), skills: skills.sort() }))
}

/**
 * Campus certificates -> CV credentials.
 *
 * `issuer` falls back to the learner's institution because the claim names no
 * issuer of its own: the campus is describing certificates it holds for a
 * learner enrolled somewhere, and attributing them to nobody would leave a row
 * an employer cannot place.
 */
export function buildCredentials(
  credentials: VcCredential[],
  institution: string
): ResumeCredential[] {
  return credentials.map((credential) => ({
    title: credential.title,
    issuer: institution,
    date: credential.issuedAt ?? '',
    code: credential.verificationCode,
    verifyUrl: credential.verifyUrl ?? '',
    verified: credential.verified,
  }))
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
  const skills = buildSkills(courses, identity.skills ?? [])
  const institution = identity.institution || VC_INSTITUTION_FALLBACK
  const credentials = buildCredentials(identity.credentials ?? [], institution)

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
    credentials,
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
    // The campus knows nothing about either. They are filled by the KTIP
    // generator below, which is why the merge must not stamp them 'vc'.
    projects: [],
    awards: [],
  }
}

// ---------------------------------------------------------------------------
// KTIP's own records
// ---------------------------------------------------------------------------

/**
 * Everything KTIP itself knows about a member, already read and RLS-checked by
 * the caller. Passed in rather than fetched here so this stays a pure function
 * the tests can drive without a database.
 */
export interface KtipCvInput {
  email: string
  profile: {
    display_name: string | null
    bio: string | null
    country: string | null
    organization: string | null
    industry: string | null
    skills: string[] | null
    interests: string[] | null
    open_to: string[] | null
    /** Migration 082. Absent on deploys that predate it. */
    phone?: string | null
    website?: string | null
    languages?: string[] | null
  }
  /** Public projects the member owns. */
  projects: Array<{
    title: string
    summary: string | null
    description: string | null
    category: string | null
    phase: string | null
  }>
  /** Earned badges, hidden ones already filtered out. */
  awards: Array<{ name: string; description: string | null; awarded_at: string | null }>
  /** Approved institution memberships, most recent first. */
  institutions: Array<{ name: string; role: string | null; approved_at: string | null }>
  /** Employer memberships — a workplace, not a job title we may invent. */
  employers: Array<{ name: string; role: string | null }>
}

/** "student_lead" -> "Student lead". Roles are stored as enum slugs. */
function humanizeRole(role: string | null): string {
  if (!role) return ''
  const words = role.replace(/[_-]+/g, ' ').trim()
  return words ? words[0].toUpperCase() + words.slice(1) : ''
}

function ktipAbout(input: KtipCvInput): string[] {
  if (input.profile.bio?.trim()) return [input.profile.bio.trim()]
  return []
}

/**
 * A CV built from KTIP's own records.
 *
 * This is the one profile→CV mapping in the codebase. It replaced a render-only
 * `seeded()` in useResume and a second, already-divergent copy in the editor's
 * "fill blanks from my profile" — two mappings of the same thing is how a
 * member's CV came to look different depending on which page created it.
 *
 * Same restraint as the Virtual Campus generator: `roles` stays empty. A
 * project is not a job and a badge is not employment, so neither is promoted
 * into the experience timeline, however much emptier that leaves the page.
 */
export function buildKtipResumeData(input: KtipCvInput): ResumeData {
  const p = input.profile
  const skills = (p.skills ?? []).filter((s) => s.trim())

  const socials: ResumeSocial[] = p.website?.trim()
    ? [{ label: 'Website', href: p.website.trim() }]
    : []

  // The profile's own organisation first; an employer membership is only a
  // fallback for a member who never filled that field in.
  const org = p.organization?.trim() || input.employers[0]?.name || ''
  const role = [org, p.industry?.trim()].filter(Boolean).join(' · ')

  const education: ResumeEducation[] = input.institutions.map((inst) => ({
    credential: humanizeRole(inst.role) || 'Member',
    school: inst.name,
    year: inst.approved_at ? String(new Date(inst.approved_at).getUTCFullYear()) : '',
  }))

  const projects: ResumeProject[] = input.projects.map((project) => ({
    title: project.title,
    summary: (project.summary || project.description || '').trim(),
    category: project.category ?? '',
    phase: project.phase ?? '',
  }))

  const awards: ResumeAward[] = input.awards.map((award) => ({
    name: award.name,
    description: (award.description ?? '').trim(),
    date: award.awarded_at ?? '',
  }))

  return {
    profile: {
      name: p.display_name ?? '',
      role,
      location: p.country ?? '',
      email: input.email,
      phone: p.phone?.trim() ?? '',
      socials,
      about: ktipAbout(input),
    },
    // Empty on purpose — see the file header.
    roles: [],
    education,
    // The campus owns these; KTIP has no equivalent record, and a generated
    // empty array must never be what wipes a synced course or certificate list.
    courses: [],
    credentials: [],
    skills:
      skills.length > 0 ? [{ area: 'Skills', abbr: abbreviate('Skills'), skills: [...skills] }] : [],
    languages: (p.languages ?? []).filter((l) => l.trim()),
    professionalSkills: (p.open_to ?? []).filter((s) => s.trim()),
    academic: [],
    interests: (p.interests ?? []).filter((i) => i.trim()).join(' · '),
    projects,
    awards,
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
 * Folds a freshly generated document into the stored one.
 *
 * `owner` is who is doing the writing. For each path:
 *   - the recorded source outranks `owner` -> leave it alone. 'manual' outranks
 *     everyone, so a hand edit always survives; 'vc' outranks 'ktip', so the
 *     campus's authoritative record is not overwritten by KTIP's guess at the
 *     same field.
 *   - otherwise -> take the generated value, unless it is empty and the stored
 *     value is not. An empty generated field means "this source told us nothing
 *     this time", which must not erase a value an earlier run did produce.
 *
 * A path is stamped only when something is actually written to it. Stamping an
 * empty generated value would claim a field this source does not populate at
 * all — which is how the campus sync came to own `interests` and `projects`
 * (it generates neither) and locked the KTIP generator out of them forever.
 *
 * Paths are whole sections for arrays (`courses`, `roles`, `skills`). Merging
 * an array element-by-element would resurrect entries the user deleted, and a
 * CV the user cannot prune is a CV they will not use.
 */
export function mergeResume(
  stored: ResumeData | null,
  storedSources: ResumeSources | null,
  generated: ResumeData,
  paths: readonly string[],
  owner: ResumeFieldSource = 'vc'
): MergeResult {
  const data = JSON.parse(JSON.stringify(stored ?? generated)) as Record<string, unknown>
  const sources: ResumeSources = { ...(storedSources ?? {}) }
  const rank = RESUME_SOURCE_RANK[owner]

  for (const path of paths) {
    const held = sources[path]
    if (held && RESUME_SOURCE_RANK[held] > rank) continue

    const next = getPath(generated, path)
    const current = getPath(stored ?? generated, path)
    if (isEmpty(next) && !isEmpty(current)) continue

    setPath(data, path, next)
    // Claim the path only if there is something on it. See the note above.
    if (!isEmpty(next)) sources[path] = owner
  }

  return { data: data as unknown as ResumeData, sources }
}
