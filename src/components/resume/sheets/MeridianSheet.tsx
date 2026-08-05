import {
  AcademicTable,
  AwardList,
  ContactList,
  CourseTable,
  CredentialList,
  PlainHeading,
  ProjectList,
  SheetFrame,
  StackedList,
  type SheetProps,
} from './SheetFrame'
import { Trans } from '@lingui/react/macro'

/**
 * "Meridian" — centred masthead over two equal columns split by a hairline.
 *
 * Symmetry is the point: a thin rule, the name, a thick rule, then the page
 * divides down the middle. The narrative (experience, education, projects) runs
 * left; the evidence (contact, skills, credentials, awards) runs right, so a
 * reader skimming for either one only ever looks at half the page.
 *
 * The divider is a border on the right column rather than an absolutely
 * positioned line, so it fragments correctly across a page break instead of
 * being painted once at the top of the document.
 */
export function MeridianSheet({ data, theme = 'mono', design, thumbnail }: SheetProps) {
  const color = theme === 'color'
  const { profile } = data
  const rule = color ? design.accent : '#171717'

  return (
    <SheetFrame
      theme={theme}
      design={design}
      thumbnail={thumbnail}
      className="px-[15mm] pb-[12mm] pt-[15mm]"
    >
      <header className="resume-avoid-break text-center">
        <div className="mx-auto h-px w-24" style={{ background: rule }} />
        <h1 className="mt-4 font-display text-[25pt] font-bold uppercase leading-none tracking-[0.22em]">
          {profile.name}
        </h1>
        {profile.role && (
          <p className="mt-3 text-[9pt] font-medium uppercase tracking-[0.18em] text-neutral-600">
            {profile.role}
          </p>
        )}
        <div className="mx-auto mt-4 h-[3px] w-40" style={{ background: rule }} />
        {profile.motto && (
          <p className="mx-auto mt-3 max-w-[120mm] text-[8pt] italic leading-snug text-neutral-500">
            {profile.motto}
          </p>
        )}
      </header>

      {profile.about.length > 0 && (
        <section className="resume-avoid-break mx-auto mt-6 max-w-[150mm] text-center">
          <div className="space-y-2 text-[8.5pt] leading-relaxed text-neutral-700">
            {profile.about.map((paragraph) => (
              <p key={paragraph.slice(0, 32)}>{paragraph}</p>
            ))}
          </div>
        </section>
      )}

      <div className="mt-7 grid grid-cols-2 gap-8">
        {/* ── Narrative ── */}
        <div className="min-w-0">
          {data.roles.length > 0 && (
            <section>
              <PlainHeading color={color} design={design} size="10pt">
                <Trans>Experience</Trans>
              </PlainHeading>
              <StackedList
                items={data.roles.map((role) => ({
                  key: `${role.org}-${role.period}`,
                  period: role.period,
                  children: (
                    <>
                      <p className="text-[9.5pt] font-bold leading-tight">{role.title}</p>
                      <p className="text-[8pt] text-neutral-500">
                        {[role.org, role.location].filter(Boolean).join(' · ')}
                      </p>
                      <ul className="mt-1 list-disc space-y-0.5 pl-3.5 text-[8pt] leading-snug text-neutral-700">
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
            <section className="mt-6">
              <PlainHeading color={color} design={design} size="10pt">
                <Trans>Education</Trans>
              </PlainHeading>
              <StackedList
                items={data.education.map((item) => ({
                  key: `${item.credential}-${item.year}`,
                  period: item.year,
                  children: (
                    <>
                      <p className="text-[9.5pt] font-bold leading-tight">{item.credential}</p>
                      <p className="text-[8pt] text-neutral-500">{item.school}</p>
                    </>
                  ),
                }))}
              />
            </section>
          )}

          {data.projects.length > 0 && (
            <section className="mt-6">
              <PlainHeading color={color} design={design} size="10pt">
                <Trans>Projects</Trans>
              </PlainHeading>
              <ProjectList data={data} />
            </section>
          )}

          {data.courses.length > 0 && (
            <section className="mt-6">
              <PlainHeading color={color} design={design} size="10pt">
                <Trans>Courses</Trans>
              </PlainHeading>
              <CourseTable data={data} dense />
            </section>
          )}
        </div>

        {/* ── Evidence. The divider lives on this column's left border. ── */}
        <div className="min-w-0 border-l border-neutral-300 pl-8">
          <PlainHeading color={color} design={design} size="10pt">
            <Trans>Contact</Trans>
          </PlainHeading>
          <ContactList data={data} iconClass="text-neutral-500" className="text-neutral-700" />

          {data.skills.length > 0 && (
            <section className="resume-avoid-break">
              <PlainHeading color={color} design={design} size="10pt" className="mt-6">
                <Trans>Skills</Trans>
              </PlainHeading>
              <div className="space-y-2">
                {data.skills.map((group) => (
                  <div key={group.area}>
                    <p className="text-[8pt] font-bold">{group.area}</p>
                    <p className="text-[7.5pt] leading-snug text-neutral-600">
                      {group.skills.join(' · ')}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {data.credentials.length > 0 && (
            <section className="mt-6">
              <PlainHeading color={color} design={design} size="10pt">
                <Trans>Certificates</Trans>
              </PlainHeading>
              <CredentialList data={data} dense />
            </section>
          )}

          {data.awards.length > 0 && (
            <section className="mt-6">
              <PlainHeading color={color} design={design} size="10pt">
                <Trans>Awards &amp; Recognition</Trans>
              </PlainHeading>
              <AwardList data={data} dense />
            </section>
          )}

          {data.academic.length > 0 && (
            <section className="resume-avoid-break mt-6">
              <PlainHeading color={color} design={design} size="10pt">
                <Trans>Academic Competencies</Trans>
              </PlainHeading>
              <AcademicTable data={data} color={color} design={design} />
            </section>
          )}

          {data.languages.length > 0 && (
            <section className="resume-avoid-break mt-6">
              <PlainHeading color={color} design={design} size="10pt">
                <Trans>Languages</Trans>
              </PlainHeading>
              <p className="text-[8pt] text-neutral-700">{data.languages.join(' · ')}</p>
            </section>
          )}

          {data.professionalSkills.length > 0 && (
            <section className="resume-avoid-break mt-6">
              <PlainHeading color={color} design={design} size="10pt">
                <Trans>Professional Skills</Trans>
              </PlainHeading>
              <ul className="list-disc space-y-0.5 pl-3.5 text-[8pt] text-neutral-700">
                {data.professionalSkills.map((skill) => (
                  <li key={skill}>{skill}</li>
                ))}
              </ul>
            </section>
          )}

          {data.interests.trim() !== '' && (
            <section className="resume-avoid-break mt-6">
              <PlainHeading color={color} design={design} size="10pt">
                <Trans>Interests</Trans>
              </PlainHeading>
              <p className="text-[8pt] leading-relaxed text-neutral-700">{data.interests}</p>
            </section>
          )}
        </div>
      </div>
    </SheetFrame>
  )
}
