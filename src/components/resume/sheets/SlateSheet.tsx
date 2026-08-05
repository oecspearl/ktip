import type { ReactNode } from 'react'
import {
  AcademicTable,
  AwardList,
  ContactList,
  CourseTable,
  CredentialList,
  ProjectList,
  SheetFrame,
  type SheetProps,
} from './SheetFrame'
import { Trans, useLingui } from '@lingui/react/macro'

/**
 * "Slate" — numbered sections under a heavy double rule.
 *
 * Ink only: no fills, no panels, no bleed strip. Every mark on the page is a
 * border or a glyph, so it prints identically with "Background graphics" off —
 * the setting members most often miss — and it paginates the same in Firefox
 * and Safari, which do not repeat fixed boxes.
 *
 * The numbers are assigned from the sections that actually render, not from a
 * fixed list, so a member with no projects gets 01–05 rather than 01, 02, 04,
 * 05, 07. That is why the sections are built as an array first and mapped
 * second — the alternative is a running counter mutated inside JSX, which is
 * exactly the kind of thing that silently double-counts under StrictMode.
 */
export function SlateSheet({ data, theme = 'mono', design, thumbnail }: SheetProps) {
  const { t } = useLingui()
  const color = theme === 'color'
  const { profile } = data
  const ink = color ? design.accentText : '#171717'

  const entry = (period: string, primary: string, secondary: string, points?: string[]) => (
    <div className="resume-avoid-break mb-3.5 last:mb-0">
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-[9.5pt] font-bold leading-tight">{primary}</p>
        <p className="shrink-0 font-display text-[8pt] font-bold tracking-[0.12em] text-neutral-500">
          {period}
        </p>
      </div>
      {secondary && <p className="text-[8pt] text-neutral-600">{secondary}</p>}
      {points && points.length > 0 && (
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[8pt] leading-snug text-neutral-700">
          {points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      )}
    </div>
  )

  // Built, then numbered. Only sections with content are pushed, so the
  // sequence never has a hole in it.
  const sections: Array<{ key: string; heading: string; body: ReactNode }> = []
  const add = (key: string, heading: string, body: ReactNode) =>
    sections.push({ key, heading, body })

  if (profile.about.length > 0) {
    add(
      'profile',
      t`Profile`,
      <div className="space-y-2 text-[8.5pt] leading-relaxed text-neutral-700">
        {profile.about.map((paragraph) => (
          <p key={paragraph.slice(0, 32)}>{paragraph}</p>
        ))}
      </div>
    )
  }

  if (data.roles.length > 0) {
    add(
      'experience',
      t`Experience`,
      data.roles.map((role) => (
        <div key={`${role.org}-${role.period}`}>
          {entry(
            role.period,
            role.title,
            [role.org, role.location].filter(Boolean).join(' · '),
            role.points
          )}
        </div>
      ))
    )
  }

  if (data.education.length > 0) {
    add(
      'education',
      t`Education`,
      data.education.map((item) => (
        <div key={`${item.credential}-${item.year}`}>
          {entry(item.year, item.credential, item.school)}
        </div>
      ))
    )
  }

  if (data.projects.length > 0) add('projects', t`Projects`, <ProjectList data={data} />)
  if (data.courses.length > 0) add('courses', t`Courses`, <CourseTable data={data} />)
  if (data.credentials.length > 0)
    add('certificates', t`Certificates`, <CredentialList data={data} />)
  if (data.awards.length > 0) add('awards', t`Awards & Recognition`, <AwardList data={data} />)

  if (data.skills.length > 0) {
    add(
      'skills',
      t`Skills`,
      <div className="grid grid-cols-2 gap-x-8 gap-y-2">
        {data.skills.map((group) => (
          <div key={group.area} className="resume-avoid-break">
            <p className="text-[8pt] font-bold">{group.area}</p>
            <p className="text-[7.5pt] leading-snug text-neutral-600">{group.skills.join(' · ')}</p>
          </div>
        ))}
      </div>
    )
  }

  if (data.academic.length > 0) {
    add(
      'academic',
      t`Academic Competencies`,
      <AcademicTable data={data} color={color} design={design} />
    )
  }

  if (data.languages.length > 0 || data.professionalSkills.length > 0) {
    add(
      'strengths',
      t`Languages & Strengths`,
      <div className="grid grid-cols-2 gap-8 text-[8pt] text-neutral-700">
        {data.languages.length > 0 && <p>{data.languages.join(' · ')}</p>}
        {data.professionalSkills.length > 0 && (
          <ul className="list-disc space-y-0.5 pl-4">
            {data.professionalSkills.map((skill) => (
              <li key={skill}>{skill}</li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  if (data.interests.trim() !== '') {
    add(
      'interests',
      t`Interests`,
      <p className="text-[8pt] leading-relaxed text-neutral-700">{data.interests}</p>
    )
  }

  return (
    <SheetFrame
      theme={theme}
      design={design}
      thumbnail={thumbnail}
      className="px-[18mm] pb-[12mm] pt-[16mm]"
    >
      <header className="resume-avoid-break">
        <h1 className="font-display text-[30pt] font-bold uppercase leading-[0.9] tracking-[-0.01em]">
          {profile.name}
        </h1>
        {/* The double rule: heavy over hairline, the masthead device the whole
            design hangs off. */}
        <div className="mt-4 h-[5px] w-full" style={{ background: ink }} />
        <div className="mt-[3px] h-px w-full" style={{ background: ink }} />
        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
          {profile.role && (
            <p className="text-[9.5pt] font-semibold uppercase tracking-[0.16em] text-neutral-700">
              {profile.role}
            </p>
          )}
          <ContactList
            data={data}
            iconClass="text-neutral-500"
            className="flex flex-wrap items-center gap-x-5 gap-y-1 space-y-0 text-neutral-700"
          />
        </div>
      </header>

      {sections.map((section, index) => (
        <section key={section.key} className="mt-6 grid grid-cols-[14mm_1fr] gap-x-4">
          <p
            className="resume-avoid-break font-display text-[15pt] font-bold leading-none"
            style={{ color: ink }}
          >
            {String(index + 1).padStart(2, '0')}
          </p>
          <div className="min-w-0">
            <h2
              className="resume-avoid-break mb-2 border-b pb-1 font-display text-[10pt] font-bold uppercase tracking-[0.2em]"
              style={{ color: ink, borderColor: '#d4d4d4' }}
            >
              {section.heading}
            </h2>
            {section.body}
          </div>
        </section>
      ))}

      {sections.length === 0 && (
        <p className="mt-8 text-[8pt] text-neutral-500">
          <Trans>Nothing has been added to this CV yet.</Trans>
        </p>
      )}
    </SheetFrame>
  )
}
