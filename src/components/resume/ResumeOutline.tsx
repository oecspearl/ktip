import type { ResumeData } from '../../types/resume'

/**
 * The CV as plain text.
 *
 * An A4 sheet cannot satisfy WCAG 1.4.10 (Reflow) — at 320 CSS px there is no
 * scale at which 8pt type is legible without two-dimensional scrolling. Rather
 * than pretend otherwise, this is the same document with no layout at all:
 * headings, lists, and reading order. Offered as "Read as text", and the
 * default below 768px.
 *
 * Layout-free on purpose — it costs nothing per design, so adding a fourth
 * sheet never adds a second thing to keep in step here.
 */
export function ResumeOutline({ data }: { data: ResumeData }) {
  const { profile } = data

  return (
    <article className="mx-auto max-w-2xl space-y-8 rounded-xl border border-ktip-sand-200 bg-ktip-cream p-6 dark:border-ktip-sand-700">
      <header>
        <h1 className="font-display text-2xl font-bold text-ktip-sand-900">{profile.name}</h1>
        {profile.role && <p className="mt-1 text-ktip-sand-600">{profile.role}</p>}
        <ul className="mt-3 space-y-1 text-sm text-ktip-sand-700">
          {profile.location && <li>{profile.location}</li>}
          {profile.phone && (
            <li>
              <a href={`tel:${profile.phone.replace(/\s+/g, '')}`} className="hover:underline">
                {profile.phone}
              </a>
            </li>
          )}
          {profile.email && (
            <li>
              <a href={`mailto:${profile.email}`} className="break-all hover:underline">
                {profile.email}
              </a>
            </li>
          )}
          {profile.socials.map((social) => (
            <li key={social.label}>
              {social.href ? (
                <a href={social.href} className="hover:underline">
                  {social.label}
                </a>
              ) : (
                social.label
              )}
            </li>
          ))}
        </ul>
      </header>

      {profile.about.length > 0 && (
        <Block title="Profile">
          <div className="space-y-2">
            {profile.about.map((paragraph) => (
              <p key={paragraph.slice(0, 32)}>{paragraph}</p>
            ))}
          </div>
        </Block>
      )}

      {data.roles.length > 0 && (
        <Block title="Experience">
          <ul className="space-y-4">
            {data.roles.map((role) => (
              <li key={`${role.org}-${role.period}`}>
                <p className="font-semibold text-ktip-sand-900">{role.title}</p>
                <p className="text-ktip-sand-600">
                  {[role.org, role.location, role.period].filter(Boolean).join(' · ')}
                </p>
                {role.points.length > 0 && (
                  <ul className="mt-1 list-disc space-y-0.5 pl-5">
                    {role.points.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </Block>
      )}

      {data.education.length > 0 && (
        <Block title="Education">
          <ul className="space-y-2">
            {data.education.map((item) => (
              <li key={`${item.credential}-${item.year}`}>
                <p className="font-semibold text-ktip-sand-900">{item.credential}</p>
                <p className="text-ktip-sand-600">
                  {[item.school, item.year].filter(Boolean).join(' · ')}
                </p>
              </li>
            ))}
          </ul>
        </Block>
      )}

      {data.courses.length > 0 && (
        <Block title="Courses">
          <ul className="space-y-1">
            {data.courses.map((course) => (
              <li key={course.courseId}>
                {course.title}
                <span className="text-ktip-sand-500">
                  {' — '}
                  {course.status === 'completed'
                    ? 'completed'
                    : `${course.progressPercentage}% complete`}
                </span>
              </li>
            ))}
          </ul>
        </Block>
      )}

      {data.skills.length > 0 && (
        <Block title="Skills">
          <dl className="space-y-2">
            {data.skills.map((group) => (
              <div key={group.area}>
                <dt className="font-semibold text-ktip-sand-900">{group.area}</dt>
                <dd>{group.skills.join(', ')}</dd>
              </div>
            ))}
          </dl>
        </Block>
      )}

      {data.academic.length > 0 && (
        <Block title="Academic competencies">
          <dl className="space-y-2">
            {data.academic.map((entry) => (
              <div key={entry.subject}>
                <dt className="font-semibold text-ktip-sand-900">{entry.subject}</dt>
                <dd>{entry.skills}</dd>
              </div>
            ))}
          </dl>
        </Block>
      )}

      {data.languages.length > 0 && (
        <Block title="Languages">
          <p>{data.languages.join(', ')}</p>
        </Block>
      )}

      {data.professionalSkills.length > 0 && (
        <Block title="Professional skills">
          <ul className="list-disc space-y-0.5 pl-5">
            {data.professionalSkills.map((skill) => (
              <li key={skill}>{skill}</li>
            ))}
          </ul>
        </Block>
      )}

      {data.interests.trim() !== '' && (
        <Block title="Interests">
          <p>{data.interests}</p>
        </Block>
      )}
    </article>
  )
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="text-sm text-ktip-sand-700 dark:text-ktip-sand-200">
      <h2 className="mb-2 font-display text-xs font-bold uppercase tracking-[0.14em] text-ktip-sand-500">
        {title}
      </h2>
      {children}
    </section>
  )
}
