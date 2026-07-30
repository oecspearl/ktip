import { ResumePortrait } from '../ResumePortrait'
import {
  AcademicTable,
  ContactList,
  CourseTable,
  RuleHeading,
  SheetFrame,
  SkillCircles,
  Timeline,
  type SheetProps,
} from './SheetFrame'
import { sheetSidebar } from '../../../lib/resume-designs'

/**
 * "Signature" — the branded two-column sheet: navy sidebar, pop-out portrait,
 * date-left timelines, skill circles.
 *
 * The only design with a filled panel running the full height of the page, so
 * the only one that needs the printed bleed strip (see index.css, and
 * `bleedVars` in resume-designs.ts). The panel colour here and the strip colour
 * there MUST come from the same function or the printed page shows a seam.
 *
 * Two themes, picked by the download button:
 *  • mono  — B&W: black rules, grayscale portrait. The photocopier-safe one.
 *  • color — brand accents and a full-colour portrait.
 */
export function SignatureSheet({ data, avatarUrl, theme = 'mono', design, thumbnail }: SheetProps) {
  const color = theme === 'color'
  const { accent } = design
  const { profile } = data

  const sidebar = sheetSidebar(theme, design)
  const sideHead = color ? accent : '#ffffff'
  const sideRule = color ? accent : 'rgba(255,255,255,0.8)'

  const sideHeading = (label: string, gap: string, first = false) => (
    <>
      <h2
        className={`font-display text-[11pt] font-bold uppercase tracking-[0.3em] ${first ? '' : 'mt-8'}`}
        style={{ color: sideHead }}
      >
        {label}
      </h2>
      <div className={`${gap} mt-2 h-[2px] w-10`} style={{ background: sideRule }} />
    </>
  )

  return (
    <SheetFrame
      theme={theme}
      design={design}
      thumbnail={thumbnail}
      className="grid grid-cols-[74mm_1fr]"
    >
      {/* ── Left column ── */}
      <aside className="flex flex-col">
        <div className="bg-white px-8 pb-5 pt-0">
          <h1 className="font-display text-[22pt] font-bold uppercase leading-none tracking-[0.12em]">
            {profile.name}
          </h1>
          <div className="mt-3 h-[3px] w-14" style={{ background: color ? accent : '#171717' }} />
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
            and the printed bleed strip is dark anyway. */}
        <div
          className="-mt-[14mm] flex-1 px-8 pb-10 pt-[18mm] text-neutral-300"
          style={{ background: sidebar }}
        >
          {profile.about.length > 0 && (
            <>
              {sideHeading('About Me', 'mb-6', true)}
              <div className="space-y-3 text-[8pt] leading-relaxed">
                {profile.about.map((paragraph) => (
                  <p key={paragraph.slice(0, 32)}>{paragraph}</p>
                ))}
              </div>
            </>
          )}

          {sideHeading('Contact', 'mb-5', profile.about.length === 0)}
          <ContactList data={data} />

          {data.languages.length > 0 && (
            <>
              {sideHeading('Languages', 'mb-4')}
              <p className="text-[8pt]">{data.languages.join(' · ')}</p>
            </>
          )}

          {data.professionalSkills.length > 0 && (
            <>
              {sideHeading('Professional Skills', 'mb-4')}
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
            <RuleHeading color={color} design={design}>
              Education
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

        {data.roles.length > 0 && (
          <section className="mt-8">
            <RuleHeading color={color} design={design}>
              Experience
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

        {data.courses.length > 0 && (
          <section className="mt-8">
            <RuleHeading color={color} design={design}>
              Courses
            </RuleHeading>
            <CourseTable data={data} />
          </section>
        )}

        {data.skills.length > 0 && (
          <section className="resume-avoid-break mt-8">
            <RuleHeading color={color} design={design}>
              Skills
            </RuleHeading>
            <SkillCircles data={data} color={color} design={design} />
          </section>
        )}

        {data.academic.length > 0 && (
          <section className="resume-avoid-break mt-8">
            <RuleHeading color={color} design={design}>
              Academic Competencies
            </RuleHeading>
            <AcademicTable data={data} color={color} design={design} />
          </section>
        )}

        {data.interests.trim() !== '' && (
          <section className="resume-avoid-break mt-8">
            <RuleHeading color={color} design={design}>
              Interests
            </RuleHeading>
            <p className="text-[8pt] leading-relaxed text-neutral-700">{data.interests}</p>
          </section>
        )}
      </div>
    </SheetFrame>
  )
}
