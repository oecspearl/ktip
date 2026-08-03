import {
  AcademicTable,
  AwardList,
  CredentialList,
  ContactList,
  CourseTable,
  PlainHeading,
  ProjectList,
  SheetFrame,
  type SheetProps,
} from './SheetFrame'
import { Trans } from '@lingui/react/macro'

/**
 * "Classic" — one column, centred header, hairline rules.
 *
 * The employer-safe design: no photo, no filled panels, no bleed strip. Every
 * rule is a border rather than a background, so it prints correctly even with
 * "Background graphics" switched off in the print dialog — the one instruction
 * members most often miss — and it paginates identically in Firefox and Safari,
 * which do not repeat fixed boxes the way Signature's rail relies on.
 *
 * Mono and colour differ only in the heading colour; there is nothing large
 * enough to fill for the difference to matter more than that.
 */
export function ClassicSheet({ data, theme = 'mono', design, thumbnail }: SheetProps) {
  const color = theme === 'color'
  const { profile } = data
  const rule = color ? design.accent : '#171717'

  /** Education and experience share a right-aligned date column. */
  const entry = (period: string, primary: string, secondary: string, points?: string[]) => (
    <div className="resume-avoid-break mb-3.5 last:mb-0">
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-[9.5pt] font-bold leading-tight">{primary}</p>
        <p className="shrink-0 text-[8pt] font-semibold text-neutral-500">{period}</p>
      </div>
      {secondary && <p className="text-[8pt] italic text-neutral-600">{secondary}</p>}
      {points && points.length > 0 && (
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[8pt] leading-snug text-neutral-700">
          {points.map((point) => (
            <li key={point}>{point}</li>
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
      className="px-[18mm] pb-[10mm] pt-0"
    >
      <header className="resume-avoid-break border-b-2 pb-4 text-center" style={{ borderColor: rule }}>
        <h1 className="font-display text-[24pt] font-bold uppercase leading-none tracking-[0.16em]">
          {profile.name}
        </h1>
        {profile.role && (
          <p className="mt-2 text-[9pt] font-medium tracking-wide text-neutral-600">{profile.role}</p>
        )}
        {/* The same contact list every design uses, laid out as one centred row
            instead of a stacked column. Anchors survive into the PDF. */}
        <ContactList
          data={data}
          iconClass="text-neutral-500"
          className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 space-y-0 text-neutral-700"
        />
      </header>

      {profile.about.length > 0 && (
        <section className="mt-6">
          <PlainHeading color={color} design={design}>
            <Trans>Profile</Trans>
          </PlainHeading>
          <div className="space-y-2 text-[8.5pt] leading-relaxed text-neutral-700">
            {profile.about.map((paragraph) => (
              <p key={paragraph.slice(0, 32)}>{paragraph}</p>
            ))}
          </div>
        </section>
      )}

      {data.education.length > 0 && (
        <section className="mt-6">
          <PlainHeading color={color} design={design}>
            <Trans>Education</Trans>
          </PlainHeading>
          {data.education.map((item) => (
            <div key={`${item.credential}-${item.year}`}>
              {entry(item.year, item.credential, item.school)}
            </div>
          ))}
        </section>
      )}

      {data.roles.length > 0 && (
        <section className="mt-6">
          <PlainHeading color={color} design={design}>
            <Trans>Experience</Trans>
          </PlainHeading>
          {data.roles.map((role) => (
            <div key={`${role.org}-${role.period}`}>
              {entry(
                role.period,
                role.title,
                [role.org, role.location].filter(Boolean).join(' · '),
                role.points
              )}
            </div>
          ))}
        </section>
      )}

      {data.courses.length > 0 && (
        <section className="mt-6">
          <PlainHeading color={color} design={design}>
            <Trans>Courses</Trans>
          </PlainHeading>
          <CourseTable data={data} />
        </section>
      )}

      {data.credentials.length > 0 && (
        <section className="mt-6">
          <PlainHeading color={color} design={design}>
            <Trans>Certificates</Trans>
          </PlainHeading>
          <CredentialList data={data} />
        </section>
      )}

      {data.projects.length > 0 && (
        <section className="mt-6">
          <PlainHeading color={color} design={design}>
            <Trans>Projects</Trans>
          </PlainHeading>
          <ProjectList data={data} />
        </section>
      )}

      {data.awards.length > 0 && (
        <section className="mt-6">
          <PlainHeading color={color} design={design}>
            <Trans>Awards &amp; Recognition</Trans>
          </PlainHeading>
          <AwardList data={data} />
        </section>
      )}

      {data.skills.length > 0 && (
        <section className="resume-avoid-break mt-6">
          <PlainHeading color={color} design={design}>
            <Trans>Skills</Trans>
          </PlainHeading>
          <dl className="space-y-1.5">
            {data.skills.map((group) => (
              <div key={group.area} className="flex gap-3 text-[8pt]">
                <dt className="w-[34%] shrink-0 font-bold">{group.area}</dt>
                <dd className="text-neutral-700">{group.skills.join(' · ')}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {data.academic.length > 0 && (
        <section className="resume-avoid-break mt-6">
          <PlainHeading color={color} design={design}>
            <Trans>Academic Competencies</Trans>
          </PlainHeading>
          <AcademicTable data={data} color={color} design={design} />
        </section>
      )}

      {(data.languages.length > 0 || data.professionalSkills.length > 0) && (
        <section className="resume-avoid-break mt-6 grid grid-cols-2 gap-8">
          {data.languages.length > 0 && (
            <div>
              <PlainHeading color={color} design={design} size="10pt">
                <Trans>Languages</Trans>
              </PlainHeading>
              <p className="text-[8pt] text-neutral-700">{data.languages.join(' · ')}</p>
            </div>
          )}
          {data.professionalSkills.length > 0 && (
            <div>
              <PlainHeading color={color} design={design} size="10pt">
                <Trans>Professional Skills</Trans>
              </PlainHeading>
              <ul className="list-disc space-y-0.5 pl-4 text-[8pt] text-neutral-700">
                {data.professionalSkills.map((skill) => (
                  <li key={skill}>{skill}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {data.interests.trim() !== '' && (
        <section className="resume-avoid-break mt-6">
          <PlainHeading color={color} design={design}>
            <Trans>Interests</Trans>
          </PlainHeading>
          <p className="text-[8pt] leading-relaxed text-neutral-700">{data.interests}</p>
        </section>
      )}
    </SheetFrame>
  )
}
