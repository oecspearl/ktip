import {
  AcademicTable,
  AwardList,
  ContactList,
  CourseTable,
  CredentialList,
  Monogram,
  ProjectList,
  RuleHeading,
  SheetFrame,
  Timeline,
  type SheetProps,
} from './SheetFrame'
import { sheetSidebar } from '../../../lib/resume-designs'
import { Trans, useLingui } from '@lingui/react/macro'

/**
 * "Atlas" — Signature mirrored: the navy rail runs down the RIGHT edge.
 *
 * The only other design with a full-height filled panel, so the only other one
 * that needs the printed bleed strip (index.css, and `bleedVars` in
 * resume-designs.ts). `bleed: 'right'` was in the BleedSide type from the start
 * and nothing exercised it until now — the 68mm here and `bleedWidth` in the
 * registry are one measurement written twice and must not drift, or the printed
 * page shows a seam where the panel ends and the strip carries on.
 *
 * Differs from Signature by more than the side: no photograph. A monogram disc
 * reads as a mark rather than as a portrait that failed to load, which is the
 * better default for a member who has never uploaded an avatar — and the name
 * gets the top of the page to itself instead of sharing it with a face.
 */
export function AtlasSheet({ data, theme = 'mono', design, thumbnail }: SheetProps) {
  const { t } = useLingui()
  const color = theme === 'color'
  const { accent } = design
  const { profile } = data

  const sidebar = sheetSidebar(theme, design)
  const sideHead = color ? accent : '#ffffff'

  const railHeading = (label: string, first = false) => (
    <>
      <h2
        className={`font-display text-[10pt] font-bold uppercase tracking-[0.28em] ${first ? '' : 'mt-7'}`}
        style={{ color: sideHead }}
      >
        {label}
      </h2>
      <div className="mb-4 mt-2 h-[2px] w-8" style={{ background: sideHead }} />
    </>
  )

  return (
    <SheetFrame
      theme={theme}
      design={design}
      thumbnail={thumbnail}
      className="grid grid-cols-[1fr_68mm]"
    >
      {/* ── Main column ── */}
      <div className="bg-white px-[16mm] pb-10 pt-[14mm]">
        <header className="resume-avoid-break">
          <h1 className="font-display text-[23pt] font-bold uppercase leading-[1.05] tracking-[0.12em]">
            {profile.name}
          </h1>
          <div className="mt-3 h-[3px] w-20" style={{ background: color ? accent : '#171717' }} />
          {profile.role && (
            <p className="mt-2.5 text-[9pt] font-medium tracking-wide text-neutral-600">
              {profile.role}
            </p>
          )}
          {profile.about.length > 0 && (
            <div className="mt-4 space-y-2 text-[8.5pt] leading-relaxed text-neutral-700">
              {profile.about.map((paragraph) => (
                <p key={paragraph.slice(0, 32)}>{paragraph}</p>
              ))}
            </div>
          )}
        </header>

        {data.roles.length > 0 && (
          <section className="mt-8">
            <RuleHeading color={color} design={design} bleed="1.5rem">
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

        {data.education.length > 0 && (
          <section className="mt-8">
            <RuleHeading color={color} design={design} bleed="1.5rem">
              <Trans>Education</Trans>
            </RuleHeading>
            <Timeline
              color={color}
              design={design}
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

        {data.projects.length > 0 && (
          <section className="mt-8">
            <RuleHeading color={color} design={design} bleed="1.5rem">
              <Trans>Projects</Trans>
            </RuleHeading>
            <ProjectList data={data} />
          </section>
        )}

        {data.courses.length > 0 && (
          <section className="mt-8">
            <RuleHeading color={color} design={design} bleed="1.5rem">
              <Trans>Courses</Trans>
            </RuleHeading>
            <CourseTable data={data} />
          </section>
        )}

        {data.credentials.length > 0 && (
          <section className="mt-8">
            <RuleHeading color={color} design={design} bleed="1.5rem">
              <Trans>Certificates</Trans>
            </RuleHeading>
            <CredentialList data={data} />
          </section>
        )}

        {data.awards.length > 0 && (
          <section className="mt-8">
            <RuleHeading color={color} design={design} bleed="1.5rem">
              <Trans>Awards &amp; Recognition</Trans>
            </RuleHeading>
            <AwardList data={data} />
          </section>
        )}

        {data.academic.length > 0 && (
          <section className="resume-avoid-break mt-8">
            <RuleHeading color={color} design={design} bleed="1.5rem">
              <Trans>Academic Competencies</Trans>
            </RuleHeading>
            <AcademicTable data={data} color={color} design={design} />
          </section>
        )}
      </div>

      {/* ── Right rail ── */}
      <aside
        className="px-8 pb-10 pt-[14mm] text-neutral-300"
        style={{ background: sidebar }}
      >
        <Monogram name={profile.name} color={sideHead} className="mb-8" />

        {railHeading(t`Contact`, true)}
        <ContactList data={data} />

        {data.skills.length > 0 && (
          <>
            {railHeading(t`Skills`)}
            <div className="space-y-2.5">
              {data.skills.map((group) => (
                <div key={group.area}>
                  <p className="text-[8pt] font-bold" style={{ color: sideHead }}>
                    {group.area}
                  </p>
                  <p className="text-[7.5pt] leading-snug">{group.skills.join(' · ')}</p>
                </div>
              ))}
            </div>
          </>
        )}

        {data.languages.length > 0 && (
          <>
            {railHeading(t`Languages`)}
            <p className="text-[8pt]">{data.languages.join(' · ')}</p>
          </>
        )}

        {data.professionalSkills.length > 0 && (
          <>
            {railHeading(t`Professional Skills`)}
            <ul className="space-y-1.5 text-[8pt]">
              {data.professionalSkills.map((skill) => (
                <li key={skill}>{skill}</li>
              ))}
            </ul>
          </>
        )}

        {data.interests.trim() !== '' && (
          <>
            {railHeading(t`Interests`)}
            <p className="text-[8pt] leading-relaxed">{data.interests}</p>
          </>
        )}
      </aside>
    </SheetFrame>
  )
}
