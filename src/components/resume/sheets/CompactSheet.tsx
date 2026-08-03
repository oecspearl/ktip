import {
  AcademicTable,
  AwardList,
  CredentialList,
  ContactList,
  CourseTable,
  PlainHeading,
  ProjectList,
  SheetFrame,
  StackedList,
  type SheetProps,
} from './SheetFrame'
import { Trans } from '@lingui/react/macro'

/**
 * "Compact" — dense two-column at 7.5–8pt with a narrow facts column.
 *
 * For a long history that has to land on one page. The facts column is drawn
 * with a hairline border, not a fill: a filled full-height column would need
 * the printed bleed strip and inherit its Chrome-only behaviour, and a light
 * panel that stops halfway down page two looks like a mistake rather than a
 * design. Borders paginate the same everywhere.
 *
 * DOM order is content-then-facts so the reading order is the CV, not the
 * sidebar; the visual order is the same, the aside simply sits to its right.
 */
export function CompactSheet({ data, theme = 'mono', design, thumbnail }: SheetProps) {
  const color = theme === 'color'
  const { profile } = data
  const rule = color ? design.accent : '#171717'

  return (
    <SheetFrame theme={theme} design={design} thumbnail={thumbnail} className="px-[12mm] pb-[10mm] pt-0">
      <header
        className="resume-avoid-break flex items-end justify-between gap-6 border-b-2 pb-3"
        style={{ borderColor: rule }}
      >
        <div className="min-w-0">
          <h1 className="font-display text-[20pt] font-bold uppercase leading-none tracking-[0.1em]">
            {profile.name}
          </h1>
          {profile.role && (
            <p className="mt-1.5 text-[8.5pt] font-medium text-neutral-600">{profile.role}</p>
          )}
        </div>
        {profile.motto && (
          <p className="max-w-[70mm] shrink-0 text-right text-[7.5pt] italic leading-snug text-neutral-500">
            {profile.motto}
          </p>
        )}
      </header>

      <div className="grid grid-cols-[1fr_46mm] gap-6 pt-5">
        {/* ── Main column ── */}
        <div className="min-w-0">
          {profile.about.length > 0 && (
            <section>
              <PlainHeading color={color} design={design} size="9.5pt">
                <Trans>Profile</Trans>
              </PlainHeading>
              <div className="space-y-1.5 text-[8pt] leading-snug text-neutral-700">
                {profile.about.map((paragraph) => (
                  <p key={paragraph.slice(0, 32)}>{paragraph}</p>
                ))}
              </div>
            </section>
          )}

          {data.roles.length > 0 && (
            <section className="mt-5">
              <PlainHeading color={color} design={design} size="9.5pt">
                <Trans>Experience</Trans>
              </PlainHeading>
              <StackedList
                items={data.roles.map((role) => ({
                  key: `${role.org}-${role.period}`,
                  period: role.period,
                  children: (
                    <>
                      <p className="text-[9pt] font-bold leading-tight">{role.title}</p>
                      <p className="text-[7.5pt] text-neutral-500">
                        {[role.org, role.location].filter(Boolean).join(' · ')}
                      </p>
                      <ul className="mt-1 list-disc space-y-0.5 pl-3.5 text-[7.5pt] leading-snug text-neutral-700">
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

          {data.education.length > 0 && (
            <section className="mt-5">
              <PlainHeading color={color} design={design} size="9.5pt">
                <Trans>Education</Trans>
              </PlainHeading>
              <StackedList
                items={data.education.map((item) => ({
                  key: `${item.credential}-${item.year}`,
                  period: item.year,
                  children: (
                    <>
                      <p className="text-[9pt] font-bold leading-tight">{item.credential}</p>
                      <p className="text-[7.5pt] text-neutral-500">{item.school}</p>
                    </>
                  ),
                }))}
              />
            </section>
          )}

          {data.courses.length > 0 && (
            <section className="mt-5">
              <PlainHeading color={color} design={design} size="9.5pt">
                <Trans>Courses</Trans>
              </PlainHeading>
              <CourseTable data={data} dense />
            </section>
          )}

          {data.credentials.length > 0 && (
            <section className="mt-5">
              <PlainHeading color={color} design={design} size="9.5pt">
                <Trans>Certificates</Trans>
              </PlainHeading>
              <CredentialList data={data} dense />
            </section>
          )}

          {data.projects.length > 0 && (
            <section className="mt-5">
              <PlainHeading color={color} design={design} size="9.5pt">
                <Trans>Projects</Trans>
              </PlainHeading>
              {/* Dense, like everything else in this design's main column. */}
              <ProjectList data={data} dense />
            </section>
          )}

          {data.awards.length > 0 && (
            <section className="mt-5">
              <PlainHeading color={color} design={design} size="9.5pt">
                <Trans>Awards &amp; Recognition</Trans>
              </PlainHeading>
              <AwardList data={data} dense />
            </section>
          )}

          {data.academic.length > 0 && (
            <section className="resume-avoid-break mt-5">
              <PlainHeading color={color} design={design} size="9.5pt">
                <Trans>Academic Competencies</Trans>
              </PlainHeading>
              <AcademicTable data={data} color={color} design={design} />
            </section>
          )}

          {data.interests.trim() !== '' && (
            <section className="resume-avoid-break mt-5">
              <PlainHeading color={color} design={design} size="9.5pt">
                <Trans>Interests</Trans>
              </PlainHeading>
              <p className="text-[7.5pt] leading-snug text-neutral-700">{data.interests}</p>
            </section>
          )}
        </div>

        {/* ── Facts column ── */}
        <aside className="border-l border-neutral-300 pl-4">
          <PlainHeading color={color} design={design} size="9pt">
            <Trans>Contact</Trans>
          </PlainHeading>
          <ContactList data={data} iconClass="text-neutral-500" className="text-neutral-700" />

          {data.languages.length > 0 && (
            <>
              <PlainHeading color={color} design={design} size="9pt" className="mt-5">
                <Trans>Languages</Trans>
              </PlainHeading>
              <ul className="space-y-1 text-[7.5pt] text-neutral-700">
                {data.languages.map((language) => (
                  <li key={language}>{language}</li>
                ))}
              </ul>
            </>
          )}

          {data.skills.length > 0 && (
            <section className="resume-avoid-break">
              <PlainHeading color={color} design={design} size="9pt" className="mt-5">
                <Trans>Skills</Trans>
              </PlainHeading>
              <div className="space-y-2">
                {data.skills.map((group) => (
                  <div key={group.area}>
                    <p className="text-[7.5pt] font-bold">{group.area}</p>
                    <p className="text-[7pt] leading-snug text-neutral-600">
                      {group.skills.join(' · ')}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {data.professionalSkills.length > 0 && (
            <section className="resume-avoid-break">
              <PlainHeading color={color} design={design} size="9pt" className="mt-5">
                <Trans>Strengths</Trans>
              </PlainHeading>
              <ul className="list-disc space-y-0.5 pl-3.5 text-[7.5pt] text-neutral-700">
                {data.professionalSkills.map((skill) => (
                  <li key={skill}>{skill}</li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </SheetFrame>
  )
}
