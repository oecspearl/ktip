import type { ReactNode } from 'react'
import {
  AcademicTable,
  AwardList,
  ContactList,
  CourseTable,
  CredentialList,
  ProjectList,
  RuleHeading,
  SheetFrame,
  Timeline,
  type SheetProps,
} from './SheetFrame'
import { Trans, useLingui } from '@lingui/react/macro'

/**
 * "Marquee" — oversized name over a gold bar and a three-up facts strip.
 *
 * A cover, then the document. The name is set as large as A4 allows without
 * wrapping a two-word name, the accent bar carries the eye across, and the
 * strip under it answers the three questions a reader has before they start
 * reading: how to reach you, what you speak, what you do.
 *
 * The bar is brand yellow, which is 1.7:1 on white — it is a bar, never text.
 * Every letter on this page is navy or neutral ink (`design.accentText`), and
 * that separation is the reason ResumeDesign carries two colours at all. If
 * the bar fails to print because "Background graphics" is off, nothing becomes
 * unreadable: it is decoration sitting between two ink rules.
 */
export function MarqueeSheet({ data, theme = 'mono', design, thumbnail }: SheetProps) {
  const { t } = useLingui()
  const color = theme === 'color'
  const { profile } = data
  const bar = color ? design.accent : '#171717'
  const ink = color ? design.accentText : '#171717'

  /** One column of the facts strip. */
  const fact = (heading: string, body: ReactNode) => (
    <div className="min-w-0">
      <p
        className="mb-1.5 font-display text-[7.5pt] font-bold uppercase tracking-[0.24em]"
        style={{ color: ink }}
      >
        {heading}
      </p>
      {body}
    </div>
  )

  return (
    <SheetFrame
      theme={theme}
      design={design}
      thumbnail={thumbnail}
      className="px-[16mm] pb-[12mm] pt-[18mm]"
    >
      <header className="resume-avoid-break">
        <h1 className="font-display text-[34pt] font-bold uppercase leading-[0.88] tracking-[-0.015em]">
          {profile.name}
        </h1>
        {profile.role && (
          <p className="mt-3 text-[10pt] font-medium tracking-[0.06em] text-neutral-600">
            {profile.role}
          </p>
        )}
        {/* Ink rule, gold bar, ink rule. The bar is the only filled thing on
            the page and it is sandwiched so it cannot go missing unnoticed. */}
        <div className="mt-4 h-px w-full" style={{ background: ink }} />
        <div className="h-[7px] w-full" style={{ background: bar }} />
        <div className="h-px w-full" style={{ background: ink }} />
      </header>

      {/* Three-up facts strip. Columns are equal even when one is empty — a
          ragged strip reads as a rendering fault rather than as a short CV. */}
      <div className="resume-avoid-break mt-5 grid grid-cols-3 gap-7 border-b border-neutral-300 pb-5">
        {fact(
          t`Contact`,
          <ContactList
            data={data}
            iconClass="text-neutral-500"
            className="space-y-1.5 text-neutral-700"
          />
        )}
        {fact(
          t`Languages`,
          <p className="text-[8pt] leading-relaxed text-neutral-700">
            {data.languages.length > 0 ? data.languages.join(' · ') : '—'}
          </p>
        )}
        {fact(
          t`Strengths`,
          data.professionalSkills.length > 0 ? (
            <ul className="space-y-1 text-[8pt] leading-snug text-neutral-700">
              {data.professionalSkills.map((skill) => (
                <li key={skill}>{skill}</li>
              ))}
            </ul>
          ) : (
            <p className="text-[8pt] text-neutral-700">—</p>
          )
        )}
      </div>

      {profile.about.length > 0 && (
        <section className="mt-6">
          <div className="space-y-2 text-[9pt] leading-relaxed text-neutral-700">
            {profile.about.map((paragraph) => (
              <p key={paragraph.slice(0, 32)}>{paragraph}</p>
            ))}
          </div>
        </section>
      )}

      {data.roles.length > 0 && (
        <section className="mt-7">
          <RuleHeading color={color} design={design} bleed="0rem">
            <Trans>Experience</Trans>
          </RuleHeading>
          <Timeline
            color={color}
            design={design}
            items={data.roles.map((role) => ({
              key: `${role.org}-${role.period}`,
              period: role.period,
              children: (
                <>
                  <p className="text-[10pt] font-bold leading-tight">{role.title}</p>
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

      {data.education.length > 0 && (
        <section className="mt-7">
          <RuleHeading color={color} design={design} bleed="0rem">
            <Trans>Education</Trans>
          </RuleHeading>
          <Timeline
            color={color}
            design={design}
            items={data.education.map((item) => ({
              key: `${item.credential}-${item.year}`,
              period: item.year,
              children: (
                <>
                  <p className="text-[10pt] font-bold leading-tight">{item.credential}</p>
                  <p className="text-[8pt] text-neutral-500">{item.school}</p>
                </>
              ),
            }))}
          />
        </section>
      )}

      {data.skills.length > 0 && (
        <section className="resume-avoid-break mt-7">
          <RuleHeading color={color} design={design} bleed="0rem">
            <Trans>Skills</Trans>
          </RuleHeading>
          <div className="grid grid-cols-3 gap-x-7 gap-y-3">
            {data.skills.map((group) => (
              <div key={group.area} className="resume-avoid-break">
                <p className="text-[8.5pt] font-bold">{group.area}</p>
                <p className="text-[7.5pt] leading-snug text-neutral-600">
                  {group.skills.join(' · ')}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {data.projects.length > 0 && (
        <section className="mt-7">
          <RuleHeading color={color} design={design} bleed="0rem">
            <Trans>Projects</Trans>
          </RuleHeading>
          <ProjectList data={data} />
        </section>
      )}

      {data.courses.length > 0 && (
        <section className="mt-7">
          <RuleHeading color={color} design={design} bleed="0rem">
            <Trans>Courses</Trans>
          </RuleHeading>
          <CourseTable data={data} />
        </section>
      )}

      {data.credentials.length > 0 && (
        <section className="mt-7">
          <RuleHeading color={color} design={design} bleed="0rem">
            <Trans>Certificates</Trans>
          </RuleHeading>
          <CredentialList data={data} />
        </section>
      )}

      {data.awards.length > 0 && (
        <section className="mt-7">
          <RuleHeading color={color} design={design} bleed="0rem">
            <Trans>Awards &amp; Recognition</Trans>
          </RuleHeading>
          <AwardList data={data} />
        </section>
      )}

      {data.academic.length > 0 && (
        <section className="resume-avoid-break mt-7">
          <RuleHeading color={color} design={design} bleed="0rem">
            <Trans>Academic Competencies</Trans>
          </RuleHeading>
          <AcademicTable data={data} color={color} design={design} />
        </section>
      )}

      {data.interests.trim() !== '' && (
        <section className="resume-avoid-break mt-7">
          <RuleHeading color={color} design={design} bleed="0rem">
            <Trans>Interests</Trans>
          </RuleHeading>
          <p className="text-[8pt] leading-relaxed text-neutral-700">{data.interests}</p>
        </section>
      )}
    </SheetFrame>
  )
}
