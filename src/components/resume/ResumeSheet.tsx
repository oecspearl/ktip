import type { ReactNode } from 'react'
import { Github, Globe, Linkedin, Mail, MapPin, Phone } from 'lucide-react'
import { ResumePortrait } from './ResumePortrait'
import type { ResumeData, ResumeTheme } from '../../types/resume'
import { sheetSidebar, type ResumeTemplate } from '../../lib/resume-templates'

/**
 * A4 CV sheet (210mm × 296mm).
 *
 * Authored in real print units — millimetres for geometry, points for every
 * piece of type — so what is on screen is exactly what window.print() →
 * "Save as PDF" produces. Do not convert any of it to rem or px: the whole
 * point is that the browser and the print engine measure the same thing.
 *
 * The print isolation rules (the @page box, the dark sidebar bleed, the
 * hide-everything-then-reveal-the-sheet trick) live in index.css and are
 * heavily load-bearing — read the comments there before touching them.
 *
 * Two themes, picked by the download button:
 *  • mono  — B&W: black rules, grayscale portrait. The photocopier-safe one.
 *  • color — brand accents and a full-colour portrait.
 *
 * This always renders the COMPLETE document. The curated/full switch is a
 * screen affordance; a CV somebody hands to an employer is not abridged.
 */

const SOCIAL_ICONS: Record<string, typeof Globe> = {
  GitHub: Github,
  LinkedIn: Linkedin,
}

function RuleHeading({
  children,
  color,
  accent,
  accentText,
}: {
  children: ReactNode
  color: boolean
  accent: string
  accentText: string
}) {
  return (
    <div className="resume-avoid-break mb-5">
      {/* Bleeds past the column's px-9 before fading out, matching the screen. */}
      <div
        className="h-[3px] w-[calc(100%+2.25rem)] rounded-full"
        style={{
          background: color
            ? `linear-gradient(to right, ${accent}, ${accent}66, transparent)`
            : 'linear-gradient(to right, #171717, #17171766, transparent)',
        }}
      />
      <h3
        className="mt-2 font-display text-[13pt] font-bold uppercase tracking-[0.3em]"
        style={{ color: color ? accentText : '#171717' }}
      >
        {children}
      </h3>
    </div>
  )
}

function Timeline({
  items,
  color,
  accent,
}: {
  items: { key: string; period: string; children: ReactNode }[]
  color: boolean
  accent: string
}) {
  if (items.length === 0) return null
  return (
    <ol className="relative">
      <span aria-hidden className="absolute bottom-2 left-[100px] top-1 w-[2px] bg-neutral-300" />
      {items.map((item) => (
        <li
          key={item.key}
          className="resume-avoid-break relative grid grid-cols-[88px_26px_1fr] pb-8 last:pb-0"
        >
          <span className="pt-[2px] text-[8pt] font-semibold leading-tight text-neutral-500">
            {item.period}
          </span>
          <span className="relative">
            <span
              className="absolute left-[8px] top-[3px] h-[10px] w-[10px] rounded-full border-2 bg-white"
              style={{ borderColor: color ? accent : '#171717' }}
            />
          </span>
          <div>{item.children}</div>
        </li>
      ))}
    </ol>
  )
}

export function ResumeSheet({
  data,
  avatarUrl,
  theme = 'mono',
  template,
}: {
  data: ResumeData
  avatarUrl: string | null
  theme?: ResumeTheme
  template: ResumeTemplate
}) {
  const color = theme === 'color'
  const { accent, accentText } = template
  const { profile } = data

  // Must match what CvPage publishes as --resume-sidebar, or the printed page
  // shows a seam where this panel ends and the full-height bleed carries on.
  const sidebar = sheetSidebar(theme, template)
  const sideHeadColor = color ? accent : '#ffffff'
  const sideBarColor = color ? accent : 'rgba(255,255,255,0.8)'

  return (
    <div
      id="resume-sheet"
      data-theme={theme}
      className="resume-sheet mx-auto grid min-h-[296mm] w-[210mm] shrink-0 grid-cols-[74mm_1fr] bg-white text-neutral-900 shadow-2xl shadow-black/60"
    >
      {/* ── Left column ── */}
      <aside className="flex flex-col">
        <div className="bg-white px-8 pb-5 pt-0">
          <h1 className="font-display text-[22pt] font-bold uppercase leading-none tracking-[0.12em]">
            {profile.name}
          </h1>
          <div
            className="mt-3 h-[3px] w-14"
            style={{ background: color ? accent : '#171717' }}
          />
          <p className="mt-2 text-[8.5pt] font-medium tracking-wide text-neutral-500">
            {profile.role}
          </p>
        </div>

        <ResumePortrait
          name={profile.name}
          avatarUrl={avatarUrl}
          theme={color ? 'color' : 'mono'}
          accent={accent}
          className="h-[70mm]"
        />

        {/* Dark panel. No clip-path: it crops content on later page fragments,
            and the printed sidebar strip is dark anyway. */}
        <div
          className="-mt-[14mm] flex-1 px-8 pb-10 pt-[18mm] text-neutral-300"
          style={{ background: sidebar }}
        >
          {profile.about.length > 0 && (
            <>
              <h3
                className="font-display text-[11pt] font-bold uppercase tracking-[0.3em]"
                style={{ color: sideHeadColor }}
              >
                About Me
              </h3>
              <div className="mb-6 mt-2 h-[2px] w-10" style={{ background: sideBarColor }} />
              <div className="space-y-3 text-[8pt] leading-relaxed">
                {profile.about.map((paragraph) => (
                  <p key={paragraph.slice(0, 32)}>{paragraph}</p>
                ))}
              </div>
            </>
          )}

          <h3
            className="mt-8 font-display text-[11pt] font-bold uppercase tracking-[0.3em]"
            style={{ color: sideHeadColor }}
          >
            Contact
          </h3>
          <div className="mb-5 mt-2 h-[2px] w-10" style={{ background: sideBarColor }} />
          <ul className="space-y-2.5 text-[8pt]">
            {profile.location && (
              <li className="flex items-center gap-2.5">
                <MapPin size={13} className="shrink-0 text-white" />
                {profile.location}
              </li>
            )}
            {profile.phone && (
              <li className="flex items-center gap-2.5">
                <Phone size={13} className="shrink-0 text-white" />
                {profile.phone}
              </li>
            )}
            {profile.email && (
              <li className="flex items-start gap-2.5">
                <Mail size={13} className="mt-[2px] shrink-0 text-white" />
                <span className="break-all">{profile.email}</span>
              </li>
            )}
            {profile.socials.map((social) => {
              const Icon = SOCIAL_ICONS[social.label] ?? Globe
              return (
                <li key={social.label} className="flex items-center gap-2.5">
                  <Icon size={13} className="shrink-0 text-white" />
                  {social.label}
                </li>
              )
            })}
          </ul>

          {data.languages.length > 0 && (
            <>
              <h3
                className="mt-8 font-display text-[11pt] font-bold uppercase tracking-[0.3em]"
                style={{ color: sideHeadColor }}
              >
                Languages
              </h3>
              <div className="mb-4 mt-2 h-[2px] w-10" style={{ background: sideBarColor }} />
              <p className="text-[8pt]">{data.languages.join(' · ')}</p>
            </>
          )}

          {data.professionalSkills.length > 0 && (
            <>
              <h3
                className="mt-8 font-display text-[11pt] font-bold uppercase tracking-[0.3em]"
                style={{ color: sideHeadColor }}
              >
                Professional Skills
              </h3>
              <div className="mb-4 mt-2 h-[2px] w-10" style={{ background: sideBarColor }} />
              <ul className="space-y-1.5 text-[8pt]">
                {data.professionalSkills.map((skill) => (
                  <li key={skill}>{skill}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      </aside>

      {/* ── Right column ── */}
      <div className="bg-white px-9 pb-10 pt-0">
        {data.education.length > 0 && (
          <section>
            <RuleHeading color={color} accent={accent} accentText={accentText}>
              Education
            </RuleHeading>
            <Timeline
              color={color}
              accent={accent}
              items={data.education.map((entry) => ({
                key: `${entry.credential}-${entry.year}`,
                period: entry.year,
                children: (
                  <>
                    <p className="text-[9.5pt] font-bold leading-tight">{entry.credential}</p>
                    <p className="text-[8pt] text-neutral-500">{entry.school}</p>
                  </>
                ),
              }))}
            />
          </section>
        )}

        {data.roles.length > 0 && (
          <section className="mt-8">
            <RuleHeading color={color} accent={accent} accentText={accentText}>
              Experience
            </RuleHeading>
            <Timeline
              color={color}
              accent={accent}
              items={data.roles.map((role) => ({
                key: `${role.org}-${role.period}`,
                period: role.period,
                children: (
                  <>
                    <p className="text-[9.5pt] font-bold leading-tight">{role.title}</p>
                    <p className="text-[8pt] text-neutral-500">
                      {[role.org, role.location].filter(Boolean).join(' · ')}
                    </p>
                    <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[8pt] leading-snug text-neutral-700">
                      {role.points.map((point) => (
                        <li key={point}>{point}</li>
                      ))}
                    </ul>
                  </>
                ),
              }))}
            />
          </section>
        )}

        {data.courses.length > 0 && (
          <section className="mt-8">
            <RuleHeading color={color} accent={accent} accentText={accentText}>
              Courses
            </RuleHeading>
            <table className="w-full border-collapse text-left">
              <tbody>
                {data.courses.map((course) => (
                  <tr key={course.courseId} className="resume-avoid-break align-top">
                    <td className="border-b border-neutral-200 py-1.5 pr-3 text-[8pt] font-bold">
                      {course.title}
                    </td>
                    <td className="w-[26%] border-b border-neutral-200 py-1.5 pr-3 text-[7.5pt] text-neutral-500">
                      {course.subjectArea ?? course.provider}
                    </td>
                    <td className="w-[18%] border-b border-neutral-200 py-1.5 text-right text-[7.5pt] font-semibold text-neutral-700">
                      {course.status === 'completed'
                        ? 'Completed'
                        : `${course.progressPercentage}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {data.skills.length > 0 && (
          <section className="resume-avoid-break mt-8">
            <RuleHeading color={color} accent={accent} accentText={accentText}>
              Skills
            </RuleHeading>
            <div className="grid grid-cols-4 gap-4">
              {data.skills.map((group) => (
                <div key={group.area} className="text-center">
                  <div
                    className="mx-auto grid h-[52px] w-[52px] place-items-center rounded-full border-[3px]"
                    style={{ borderColor: color ? accent : '#171717' }}
                  >
                    <span className="font-display text-[12pt] font-bold">{group.abbr}</span>
                  </div>
                  <p className="mt-1.5 text-[7.5pt] font-semibold uppercase tracking-wide">
                    {group.area}
                  </p>
                  <p className="mt-1 text-[7pt] leading-snug text-neutral-500">
                    {group.skills.join(' · ')}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {data.academic.length > 0 && (
          <section className="resume-avoid-break mt-8">
            <RuleHeading color={color} accent={accent} accentText={accentText}>
              Academic Competencies
            </RuleHeading>
            <table className="w-full border-collapse text-left">
              <tbody>
                {data.academic.map((entry) => (
                  <tr key={entry.subject} className="align-top">
                    <th
                      className="w-[34%] border-b border-neutral-200 py-1.5 pr-3 text-[8pt] font-bold"
                      style={{ color: color ? accentText : '#171717' }}
                    >
                      {entry.subject}
                    </th>
                    <td className="border-b border-neutral-200 py-1.5 text-[8pt] text-neutral-700">
                      {entry.skills}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {data.interests.trim() !== '' && (
          <section className="resume-avoid-break mt-8">
            <RuleHeading color={color} accent={accent} accentText={accentText}>
              Interests
            </RuleHeading>
            <p className="text-[8pt] leading-relaxed text-neutral-700">{data.interests}</p>
          </section>
        )}
      </div>
    </div>
  )
}
