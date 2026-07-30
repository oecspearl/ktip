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
}

/**
 * Who last wrote a given dot-path in `data`.
 *
 * 'vc'     — written by the Virtual Campus sync; safe to overwrite on re-sync
 * 'manual' — written by the user; sync must leave it alone
 *
 * Absent means never written, which sync treats as 'vc'. See the header of
 * migration 069 for why this exists.
 */
export type ResumeFieldSource = 'vc' | 'manual'
export type ResumeSources = Record<string, ResumeFieldSource>

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
  }
}
