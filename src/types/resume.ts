/**
 * The CV document shape.
 *
 * These names are not arbitrary — they mirror the résumé template this feature
 * ports (org/title/period/points for a role, credential/school/year for
 * education, area/abbr/skills for a skill group). Keeping them identical is
 * what lets ResumeScreen and ResumeSheet render straight from the stored JSONB
 * with no adapter in between, and it is why the shape lives in `resumes.data`
 * as a blob rather than in normalised tables.
 *
 * Imported by both the app and the edge routes under api/. api/ is outside
 * tsconfig.app.json's `include`, so it is not type-checked at build time; the
 * import is still worth having, because a `import type` is erased by the
 * bundler and one definition beats two that drift.
 */

/** A position, engagement or programme. The résumé's main timeline. */
export interface ResumeRole {
  org: string
  title: string
  period: string
  location: string
  /** Bullets shown on the full CV and always in the printed sheet. */
  points: string[]
  /** Shorter bullets for the curated on-screen view; falls back to `points`. */
  pointsCurated?: string[]
  /** Hide from the curated view. Still printed — the PDF is always the full CV. */
  curatedHide?: boolean
}

export interface ResumeEducation {
  credential: string
  school: string
  year: string
}

/**
 * A completed or in-progress course. Populated from the learner's Virtual
 * Campus enrollments; there is no equivalent section in the source template,
 * so this is the one genuinely new section.
 */
export interface ResumeCourse {
  courseId: string
  title: string
  provider: string
  subjectArea: string | null
  gradeLevel: string | null
  difficulty: string | null
  status: 'completed' | 'in_progress'
  progressPercentage: number
  enrolledAt: string | null
  completedAt: string | null
  courseUrl: string | null
}

/** Renders as one labelled circle plus a tag cloud. `abbr` is the circle text. */
export interface ResumeSkillGroup {
  area: string
  /** Two characters, Ps/Ai style. Derived from `area` when generated. */
  abbr: string
  skills: string[]
}

export interface ResumeAcademic {
  subject: string
  skills: string
}

export interface ResumeSocial {
  label: string
  href: string
}

/**
 * A project the member owns on KTIP.
 *
 * Deliberately not a `ResumeRole`: a project is something they built, not a
 * position they held, and folding the two together would put an employment
 * claim on the page that the member never made.
 */
export interface ResumeProject {
  title: string
  summary: string
  category: string
  /** Where the project has got to — "Prototype", "Launched", etc. */
  phase: string
}

/** A badge, trophy or other recognition earned on KTIP. */
export interface ResumeAward {
  name: string
  description: string
  /** ISO timestamp it was granted, or '' when the source has no date. */
  date: string
}

export interface ResumeProfile {
  name: string
  /** One-line role descriptor under the name, e.g. "Student · OECS Virtual Campus". */
  role: string
  /** Short strapline. Optional — most generated CVs have none. */
  motto?: string
  location: string
  email: string
  phone: string
  socials: ResumeSocial[]
  /** Paragraphs under "About Me". */
  about: string[]
}

export interface ResumeData {
  profile: ResumeProfile
  roles: ResumeRole[]
  education: ResumeEducation[]
  courses: ResumeCourse[]
  skills: ResumeSkillGroup[]
  languages: string[]
  professionalSkills: string[]
  academic: ResumeAcademic[]
  interests: string
  projects: ResumeProject[]
  awards: ResumeAward[]
}

/**
 * Who last wrote a given dot-path in `data`.
 *
 * 'manual' — written by the user; no generator may touch it
 * 'vc'     — written by the Virtual Campus sync
 * 'ktip'   — written by the KTIP generator from profile/projects/badges
 *
 * Precedence: manual > vc > ktip > unset. A writer may overwrite a path only
 * when that path's recorded source ranks at or below its own — so the campus
 * (which holds the authoritative course and identity record) wins over KTIP's
 * own guess, KTIP fills what the campus left blank, and a hand edit survives
 * both. Absent means never written and is overwritable by anyone.
 *
 * See the header of migration 069 for why this exists.
 */
export type ResumeFieldSource = 'vc' | 'ktip' | 'manual'
export type ResumeSources = Record<string, ResumeFieldSource>

/** Precedence rank. Higher wins; see ResumeFieldSource. */
export const RESUME_SOURCE_RANK: Record<ResumeFieldSource, number> = {
  ktip: 1,
  vc: 2,
  manual: 3,
}

/** A row of the `resumes` table. */
export interface Resume {
  id: string
  user_id: string
  /** Row key / document schema version — always 'viridion'. See migration 078. */
  template: string
  /** Chosen presentation. Resolved by src/lib/resume-designs.ts. */
  design: string
  data: ResumeData
  sources: ResumeSources
  is_public: boolean
  vc_synced_at: string | null
  created_at: string
  updated_at: string
}

/**
 * The one `template` value in use.
 *
 * It is the row key, not a look — UNIQUE (user_id, template), the conflict
 * target of the upsert, and `p_template` of public_resume(). How a CV is drawn
 * lives in `design` (migration 078). Exported here rather than beside the
 * design registry so the edge routes under api/ can use it without pulling in
 * anything from the component tree.
 */
export const RESUME_TEMPLATE_KEY = 'viridion'

/**
 * Which view of the CV is on screen.
 *
 * Nothing renders this today: with one WYSIWYG sheet there is no "screen only"
 * view left to abridge, and nothing has ever written `pointsCurated` or
 * `curatedHide`, so "curated" only ever subtracted whole sections — a member
 * who left the switch on printed a CV missing four of them. The type stays for
 * a future editor that actually writes the curated fields.
 */
export type ResumeVariant = 'curated' | 'full'

/** Printed sheet palette. Mono is the safe default for photocopying. */
export type ResumeTheme = 'mono' | 'color'

/**
 * Every dot-path the merge policy understands, as a single list so the editor
 * and the sync route cannot disagree about what a "field" is. Sections are
 * whole-array paths: a user who has curated their course list has curated all
 * of it, and merging course-by-course would resurrect entries they deleted.
 */
export const RESUME_PATHS = [
  'profile.name',
  'profile.role',
  'profile.motto',
  'profile.location',
  'profile.email',
  'profile.phone',
  'profile.socials',
  'profile.about',
  'roles',
  'education',
  'courses',
  'skills',
  'languages',
  'professionalSkills',
  'academic',
  'interests',
  'projects',
  'awards',
] as const

export type ResumePath = (typeof RESUME_PATHS)[number]

/** An empty document. Used as the base for both generation and manual creation. */
export function emptyResumeData(): ResumeData {
  return {
    profile: {
      name: '',
      role: '',
      location: '',
      email: '',
      phone: '',
      socials: [],
      about: [],
    },
    roles: [],
    education: [],
    courses: [],
    skills: [],
    languages: [],
    professionalSkills: [],
    academic: [],
    interests: '',
    projects: [],
    awards: [],
  }
}

/**
 * A stored document, guaranteed to have every key the current shape declares.
 *
 * Rows written before a section existed are missing its key entirely, and a
 * sheet reading `data.projects.length` on one of those throws and white-screens
 * the page. This is the single place that repairs them — do not scatter `?? []`
 * through the renderers, because the next new section would need the same
 * treatment in every one of them and would only be noticed when it crashed.
 */
export function normalizeResumeData(raw: unknown): ResumeData {
  const base = emptyResumeData()
  if (!raw || typeof raw !== 'object') return base

  const stored = raw as Partial<ResumeData>
  // A present-but-null key is as fatal as an absent one, and JSONB holds both.
  const list = <T,>(value: unknown, fallback: T[]): T[] =>
    Array.isArray(value) ? (value as T[]) : fallback

  // Spelled out field by field rather than spread, so adding a section to
  // ResumeData without repairing it here is a compile error instead of a
  // white screen on somebody's old row.
  return {
    profile: { ...base.profile, ...(stored.profile ?? {}) },
    roles: list(stored.roles, base.roles),
    education: list(stored.education, base.education),
    courses: list(stored.courses, base.courses),
    skills: list(stored.skills, base.skills),
    languages: list(stored.languages, base.languages),
    professionalSkills: list(stored.professionalSkills, base.professionalSkills),
    academic: list(stored.academic, base.academic),
    interests: typeof stored.interests === 'string' ? stored.interests : base.interests,
    projects: list(stored.projects, base.projects),
    awards: list(stored.awards, base.awards),
  }
}
