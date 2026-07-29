import type { ReactNode } from 'react'
import { Github, Globe, Linkedin, Mail, MapPin, Phone } from 'lucide-react'
import { Reveal } from './Reveal'
import { ResumePortrait } from './ResumePortrait'
import type { ResumeData, ResumeVariant } from '../../types/resume'
import type { ResumeTemplate } from '../../lib/resume-templates'

/**
 * On-screen CV.
 *
 * Same skeleton as the printable ResumeSheet — identity + portrait +
 * about/contact sidebar, date-left timelines, skill circles — dressed in KTIP's
 * own skin and rendered from the same `resumes.data` document, so the two can
 * never drift.
 *
 * Curated vs full changes only what is shown here. The printed sheet is always
 * the complete CV; the toolbar says so.
 */

const SOCIAL_ICONS: Record<string, typeof Globe> = {
  GitHub: Github,
  LinkedIn: Linkedin,
}

function ScreenHeading({ children, accent }: { children: ReactNode; accent: string }) {
  return (
    <div className="mb-8">
      <div
        className="h-[3px] w-full rounded-full"
        style={{ background: `linear-gradient(to right, ${accent}, ${accent}66, transparent)` }}
      />
      <h3 className="mt-3 font-display text-2xl font-bold uppercase tracking-[0.25em] text-ktip-ocean-700 dark:text-ktip-sand-100">
        {children}
      </h3>
    </div>
  )
}

function Timeline({
  items,
  accent,
}: {
  items: { key: string; period: string; children: ReactNode }[]
  accent: string
}) {
  if (items.length === 0) return null
  return (
    <ol className="relative space-y-14">
      <span
        aria-hidden
        className="absolute bottom-3 left-[10px] top-1 w-[2px] bg-ktip-sand-200 dark:bg-ktip-sand-700 md:left-[120px]"
      />
      {items.map((item) => (
        <Reveal key={item.key}>
          <li className="relative grid grid-cols-[26px_1fr] md:grid-cols-[110px_26px_1fr]">
            <span className="hidden pt-[3px] text-xs font-semibold leading-tight text-ktip-sand-500 md:block">
              {item.period}
            </span>
            <span className="relative">
              <span
                className="absolute left-[6px] top-[5px] h-[10px] w-[10px] rounded-full border-2 bg-ktip-cream dark:bg-ktip-sand-900"
                style={{ borderColor: accent }}
              />
            </span>
            <div>
              <p className="mb-1 text-xs font-semibold text-ktip-sand-500 md:hidden">{item.period}</p>
              {item.children}
            </div>
          </li>
        </Reveal>
      ))}
    </ol>
  )
}

function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-ktip-sand-200 bg-ktip-sand-50 px-3 py-1 text-xs font-medium text-ktip-sand-700 dark:border-ktip-sand-700 dark:bg-ktip-sand-800 dark:text-ktip-sand-200">
      {children}
    </span>
  )
}

/** Empty sections are omitted rather than rendered as headings with nothing under them. */
function Section({
  title,
  accent,
  children,
  className = 'mt-14',
}: {
  title: string
  accent: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={className}>
      <ScreenHeading accent={accent}>{title}</ScreenHeading>
      {children}
    </section>
  )
}

export function ResumeScreen({
  data,
  avatarUrl,
  variant = 'curated',
  template,
}: {
  data: ResumeData
  avatarUrl: string | null
  variant?: ResumeVariant
  template: ResumeTemplate
}) {
  const isFull = variant === 'full'
  const { accent, accentText } = template
  const { profile } = data

  // Curated swaps each role's long bullets for its short ones. Roles flagged
  // curatedHide drop out entirely — they stay in the printed sheet.
  const roles = isFull
    ? data.roles
    : data.roles
        .filter((role) => !role.curatedHide)
        .map((role) => ({ ...role, points: role.pointsCurated ?? role.points }))

  const courses = isFull ? data.courses : data.courses.filter((c) => c.status === 'completed')

  return (
    // min-w-0 on both children: grid items default to min-width:auto, so long
    // unbreakable content (emails, URLs) would otherwise overflow 320px phones.
    <div className="grid gap-10 lg:grid-cols-[minmax(280px,340px)_1fr]">
      {/* ── Sidebar: identity, portrait, about, contact ── */}
      <Reveal className="min-w-0 self-start lg:sticky lg:top-24">
        <aside className="overflow-hidden rounded-lg border border-ktip-sand-200 bg-ktip-cream dark:border-ktip-sand-700 dark:bg-ktip-sand-900">
          <ResumePortrait
            name={profile.name}
            avatarUrl={avatarUrl}
            theme="screen"
            accent={accent}
            className="h-72"
          />

          <div className="px-7 pb-8 pt-2">
            <h3 className="font-display text-3xl font-bold uppercase leading-none tracking-[0.1em] text-ktip-ocean-700 dark:text-ktip-sand-50">
              {profile.name}
            </h3>
            <div className="mt-3 h-[3px] w-14" style={{ background: accent }} />
            <p className="mt-2 text-sm text-ktip-sand-600 dark:text-ktip-sand-300">{profile.role}</p>

            {profile.about.length > 0 && (
              <>
                <h4
                  className="mt-8 text-xs font-medium uppercase tracking-widest"
                  style={{ color: accentText }}
                >
                  About Me
                </h4>
                <div className="mt-3 space-y-3 text-sm leading-relaxed text-ktip-sand-600 dark:text-ktip-sand-300">
                  {profile.about.map((paragraph) => (
                    <p key={paragraph.slice(0, 32)}>{paragraph}</p>
                  ))}
                </div>
              </>
            )}

            <h4
              className="mt-8 text-xs font-medium uppercase tracking-widest"
              style={{ color: accentText }}
            >
              Contact
            </h4>
            <ul className="mt-3 space-y-2.5 text-sm text-ktip-sand-600 dark:text-ktip-sand-300">
              {profile.location && (
                <li className="flex items-center gap-3">
                  <MapPin size={15} className="shrink-0" style={{ color: accentText }} />
                  {profile.location}
                </li>
              )}
              {profile.phone && (
                <li className="flex items-center gap-3">
                  <Phone size={15} className="shrink-0" style={{ color: accentText }} />
                  {profile.phone}
                </li>
              )}
              {profile.email && (
                <li className="flex items-center gap-3">
                  <Mail size={15} className="shrink-0" style={{ color: accentText }} />
                  <a href={`mailto:${profile.email}`} className="break-all hover:underline">
                    {profile.email}
                  </a>
                </li>
              )}
              {profile.socials.map((social) => {
                const Icon = SOCIAL_ICONS[social.label] ?? Globe
                return (
                  <li key={social.label} className="flex items-center gap-3">
                    <Icon size={15} className="shrink-0" style={{ color: accentText }} />
                    <a
                      href={social.href}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:underline"
                    >
                      {social.label}
                    </a>
                  </li>
                )
              })}
            </ul>

            {isFull && data.languages.length > 0 && (
              <>
                <h4
                  className="mt-8 text-xs font-medium uppercase tracking-widest"
                  style={{ color: accentText }}
                >
                  Languages
                </h4>
                <div className="mt-3 flex flex-wrap gap-2">
                  {data.languages.map((language) => (
                    <Tag key={language}>{language}</Tag>
                  ))}
                </div>
              </>
            )}

            {isFull && data.professionalSkills.length > 0 && (
              <>
                <h4
                  className="mt-8 text-xs font-medium uppercase tracking-widest"
                  style={{ color: accentText }}
                >
                  Professional Skills
                </h4>
                <ul className="mt-3 space-y-1.5 text-sm text-ktip-sand-600 dark:text-ktip-sand-300">
                  {data.professionalSkills.map((skill) => (
                    <li key={skill}>{skill}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </aside>
      </Reveal>

      {/* ── Main column ── */}
      <div className="min-w-0">
        {data.education.length > 0 && (
          <Section title="Education" accent={accent} className="">
            <Timeline
              accent={accent}
              items={data.education.map((entry) => ({
                key: `${entry.credential}-${entry.year}`,
                period: entry.year,
                children: (
                  <>
                    <p className="font-semibold leading-tight text-ktip-ocean-700 dark:text-ktip-sand-50">
                      {entry.credential}
                    </p>
                    <p className="text-sm text-ktip-sand-500">{entry.school}</p>
                  </>
                ),
              }))}
            />
          </Section>
        )}

        {roles.length > 0 && (
          <Section title="Experience" accent={accent}>
            <Timeline
              accent={accent}
              items={roles.map((role) => ({
                key: `${role.org}-${role.period}`,
                period: role.period,
                children: (
                  <>
                    <h4 className="text-lg font-semibold leading-tight text-ktip-ocean-700 dark:text-ktip-sand-50">
                      {role.title} · <span style={{ color: accentText }}>{role.org}</span>
                    </h4>
                    {role.location && <p className="text-sm text-ktip-sand-500">{role.location}</p>}
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ktip-sand-600 dark:text-ktip-sand-300">
                      {role.points.map((point) => (
                        <li key={point}>{point}</li>
                      ))}
                    </ul>
                  </>
                ),
              }))}
            />
          </Section>
        )}

        {courses.length > 0 && (
          <Section title="Courses" accent={accent}>
            <ul className="grid gap-3 sm:grid-cols-2">
              {courses.map((course) => (
                <Reveal key={course.courseId}>
                  <li className="h-full rounded-lg border border-ktip-sand-200 p-4 dark:border-ktip-sand-700">
                    <p className="font-semibold leading-snug text-ktip-ocean-700 dark:text-ktip-sand-50">
                      {course.title}
                    </p>
                    <p className="mt-1 text-xs text-ktip-sand-500">
                      {[course.provider, course.subjectArea].filter(Boolean).join(' · ')}
                    </p>
                    {course.status === 'completed' ? (
                      <p className="mt-2 text-xs font-semibold" style={{ color: accentText }}>
                        Completed
                      </p>
                    ) : (
                      <div className="mt-2">
                        <div
                          className="h-1.5 w-full overflow-hidden rounded-full bg-ktip-sand-200 dark:bg-ktip-sand-700"
                          role="progressbar"
                          aria-valuenow={course.progressPercentage}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`${course.title} progress`}
                        >
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${course.progressPercentage}%`, background: accent }}
                          />
                        </div>
                        <p className="mt-1 text-xs text-ktip-sand-500">
                          {course.progressPercentage}% complete
                        </p>
                      </div>
                    )}
                  </li>
                </Reveal>
              ))}
            </ul>
          </Section>
        )}

        {data.skills.length > 0 && (
          <Section title="Skills" accent={accent}>
            <div className="grid gap-6 sm:grid-cols-2">
              {data.skills.map((group) => (
                <Reveal key={group.area}>
                  <div className="h-full rounded-lg border border-ktip-sand-200 p-6 dark:border-ktip-sand-700">
                    <div className="flex items-center gap-4">
                      <div
                        className="grid h-14 w-14 shrink-0 place-items-center rounded-full border-2"
                        style={{ borderColor: accent }}
                      >
                        <span className="font-display text-lg font-bold text-ktip-ocean-700 dark:text-ktip-sand-50">
                          {group.abbr}
                        </span>
                      </div>
                      <h4 className="font-semibold" style={{ color: accentText }}>
                        {group.area}
                      </h4>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {group.skills.map((skill) => (
                        <Tag key={skill}>{skill}</Tag>
                      ))}
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </Section>
        )}

        {isFull && data.academic.length > 0 && (
          <Section title="Academic Competencies" accent={accent}>
            <dl className="divide-y divide-ktip-sand-200 overflow-hidden rounded-lg border border-ktip-sand-200 dark:divide-ktip-sand-700 dark:border-ktip-sand-700">
              {data.academic.map((entry) => (
                <div key={entry.subject} className="grid gap-1 px-5 py-3 sm:grid-cols-[200px_1fr] sm:gap-4">
                  <dt className="font-semibold" style={{ color: accentText }}>
                    {entry.subject}
                  </dt>
                  <dd className="text-sm text-ktip-sand-600 dark:text-ktip-sand-300">{entry.skills}</dd>
                </div>
              ))}
            </dl>
          </Section>
        )}

        {isFull && data.interests.trim() !== '' && (
          <Section title="Interests" accent={accent}>
            <p className="text-sm leading-relaxed text-ktip-sand-600 dark:text-ktip-sand-300">
              {data.interests}
            </p>
          </Section>
        )}
      </div>
    </div>
  )
}
