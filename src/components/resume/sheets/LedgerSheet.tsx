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
 * "Ledger" — editorial single column with every heading set in a left gutter.
 *
 * The gutter is the whole idea: headings live at 30mm, body copy starts after
 * it, and the eye runs down one clean edge instead of stepping over a heading
 * every few centimetres. It reads like a well-set report rather than a form.
 *
 * Ink only — every rule is a border, nothing is filled — so it prints
 * identically with "Background graphics" off and paginates the same in every
 * browser. The gutter is a grid column, not a float, so a section that spans a
 * page break keeps its alignment on the second page.
 */
export function LedgerSheet({ data, theme = 'mono', design, thumbnail }: SheetProps) {
  const { t } = useLingui()
  const color = theme === 'color'
  const { profile } = data
  const ink = color ? design.accentText : '#171717'
  const rule = color ? design.accent : '#171717'

  /** One gutter row: heading left, content right, hairline across the top. */
  const row = (heading: string, children: ReactNode, first = false) => (
    <section
      className={`grid grid-cols-[30mm_1fr] gap-x-7 border-t pt-4 ${first ? 'mt-6' : 'mt-5'}`}
      style={{ borderColor: '#d4d4d4' }}
    >
      <h2
        className="resume-avoid-break font-display text-[9pt] font-bold uppercase leading-snug tracking-[0.2em]"
        style={{ color: ink }}
      >
        {heading}
      </h2>
      <div className="min-w-0">{children}</div>
    </section>
  )

  /** Entry with the period on its own line above — the gutter already owns the left edge. */
  const entry = (period: string, primary: string, secondary: string, points?: string[]) => (
    <div className="resume-avoid-break mb-4 last:mb-0">
      <p className="text-[7.5pt] font-semibold uppercase tracking-[0.14em] text-neutral-500">
        {period}
      </p>
      <p className="mt-0.5 text-[10pt] font-bold leading-tight">{primary}</p>
      {secondary && <p className="text-[8pt] text-neutral-600">{secondary}</p>}
      {points && points.length > 0 && (
        <ul className="mt-1.5 space-y-1 text-[8pt] leading-snug text-neutral-700">
          {points.map((point) => (
            <li key={point} className="border-l pl-3" style={{ borderColor: rule }}>
              {point}
            </li>
          ))}
        </ul>
      )}
    </div>
  )

  return (
    <SheetFrame
      theme={theme}
      design={design}
      thumbnail={thumbnail}
      className="px-[22mm] pb-[12mm] pt-[16mm]"
    >
      {/* Masthead: name in the body column, so the gutter stays empty above the
          first rule and the column edge is established before anything is read. */}
      <header className="resume-avoid-break grid grid-cols-[30mm_1fr] gap-x-7">
        <div className="h-[3px] self-start" style={{ background: rule }} />
        <div className="min-w-0">
          <h1 className="font-display text-[26pt] font-bold uppercase leading-[0.95] tracking-[0.04em]">
            {profile.name}
          </h1>
          {profile.role && (
            <p className="mt-2 text-[9.5pt] font-medium tracking-wide text-neutral-600">
              {profile.role}
            </p>
          )}
          {profile.motto && (
            <p className="mt-1.5 text-[8pt] italic leading-snug text-neutral-500">
              {profile.motto}
            </p>
          )}
        </div>
      </header>

      {row(
        t`Contact`,
        <ContactList
          data={data}
          iconClass="text-neutral-500"
          className="flex flex-wrap gap-x-6 gap-y-1 space-y-0 text-neutral-700"
        />,
        true
      )}

      {profile.about.length > 0 &&
        row(
          t`Profile`,
          <div className="space-y-2 text-[8.5pt] leading-relaxed text-neutral-700">
            {profile.about.map((paragraph) => (
              <p key={paragraph.slice(0, 32)}>{paragraph}</p>
            ))}
          </div>
        )}

      {data.roles.length > 0 &&
        row(
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
        )}

      {data.education.length > 0 &&
        row(
          t`Education`,
          data.education.map((item) => (
            <div key={`${item.credential}-${item.year}`}>
              {entry(item.year, item.credential, item.school)}
            </div>
          ))
        )}

      {data.courses.length > 0 && row(t`Courses`, <CourseTable data={data} />)}

      {data.credentials.length > 0 && row(t`Certificates`, <CredentialList data={data} />)}

      {data.projects.length > 0 && row(t`Projects`, <ProjectList data={data} />)}

      {data.awards.length > 0 && row(t`Awards`, <AwardList data={data} />)}

      {data.skills.length > 0 &&
        row(
          t`Skills`,
          <dl className="space-y-1.5">
            {data.skills.map((group) => (
              <div key={group.area} className="flex gap-3 text-[8pt]">
                <dt className="w-[30%] shrink-0 font-bold">{group.area}</dt>
                <dd className="text-neutral-700">{group.skills.join(' · ')}</dd>
              </div>
            ))}
          </dl>
        )}

      {data.academic.length > 0 &&
        row(t`Academic Competencies`, <AcademicTable data={data} color={color} design={design} />)}

      {data.languages.length > 0 &&
        row(t`Languages`, <p className="text-[8pt] text-neutral-700">{data.languages.join(' · ')}</p>)}

      {data.professionalSkills.length > 0 &&
        row(
          t`Professional Skills`,
          <p className="text-[8pt] text-neutral-700">{data.professionalSkills.join(' · ')}</p>
        )}

      {data.interests.trim() !== '' &&
        row(
          t`Interests`,
          <p className="text-[8pt] leading-relaxed text-neutral-700">{data.interests}</p>
        )}

      {/* Closing rule — the gutter needs a bottom edge or the last section
          floats. Decorative, hence the Trans-free markup. */}
      <div className="mt-5 h-px w-full" style={{ background: '#d4d4d4' }} aria-hidden />
      <p className="sr-only">
        <Trans>End of résumé</Trans>
      </p>
    </SheetFrame>
  )
}
