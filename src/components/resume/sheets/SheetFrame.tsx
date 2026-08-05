import type { ReactNode } from 'react'
import { Github, Globe, Linkedin, Mail, MapPin, Phone } from 'lucide-react'
import type { ResumeData, ResumeTheme } from '../../../types/resume'
import type { ResumeDesign } from '../../../lib/resume-designs'
import { cn } from '../../../lib/utils'
import { Trans, useLingui } from '@lingui/react/macro'

/**
 * The A4 page every design is drawn on, plus the pieces they share.
 *
 * Authored in real print units — millimetres for geometry, points for every
 * piece of type — so what is on screen is exactly what window.print() →
 * "Save as PDF" produces. Do not convert any of it to rem or px: the whole
 * point is that the browser and the print engine measure the same thing.
 *
 * The print isolation rules (the @page box, the bleed strip, the
 * hide-everything-then-reveal-the-sheet trick) live in index.css and are
 * heavily load-bearing — read the comments there before touching them.
 */

/** A4 width. */
export const SHEET_WIDTH = '210mm'

/**
 * The printable body of one page: A4's 297mm less the 8mm/12mm margins that
 * `@page` adds back at print time. A sheet taller than this paginates, and one
 * shorter than this leaves white space — but a sheet with a min-height LARGER
 * than this fragments and emits a trailing page carrying nothing, which is the
 * bug the previous 296mm value shipped. Every design measures against this
 * constant so they cannot disagree about where a page ends.
 */
export const PAGE_BODY = '277mm'

export interface SheetProps {
  data: ResumeData
  avatarUrl: string | null
  theme?: ResumeTheme
  design: ResumeDesign
  /**
   * Renders as a design-picker thumbnail. Drops the print identity — the id and
   * the `.resume-sheet` class — because the print block matches those with
   * `!important` and would otherwise stack every candidate design at the page
   * origin and print all of them on top of each other.
   */
  thumbnail?: boolean
}

/**
 * Dashed page-break guides.
 *
 * Real client-side pagination (measure, split, reflow) is expensive and fragile
 * against font loading. These lines are the honest cheap alternative: with one
 * continuous sheet on screen, a two-page CV breaks somewhere the member cannot
 * see, and "what you see is what prints" quietly stops being true. Showing
 * where the paper ends turns that back into something visible.
 */
function PageGuides() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-10 print:hidden"
      style={{
        backgroundImage:
          'repeating-linear-gradient(to bottom, transparent 0, transparent calc(277mm - 1px), rgba(4,30,66,0.18) calc(277mm - 1px), rgba(4,30,66,0.18) 277mm)',
      }}
    />
  )
}

/** The paper itself. Designs supply their own grid and padding via className. */
export function SheetFrame({
  theme = 'mono',
  design,
  thumbnail,
  className,
  children,
}: {
  theme?: ResumeTheme
  design: ResumeDesign
  thumbnail?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <div
      id={thumbnail ? undefined : 'resume-sheet'}
      data-theme={theme}
      data-design={design.id}
      className={cn(
        thumbnail ? 'resume-thumb' : 'resume-sheet',
        'relative w-[210mm] min-h-[277mm] shrink-0 bg-white text-neutral-900',
        className
      )}
    >
      {children}
      {!thumbnail && <PageGuides />}
    </div>
  )
}

/**
 * Two-letter mark from a name — first and last initial.
 *
 * ResumePortrait has its own private copy for the photo fallback. This one is
 * exported because several designs use the mark as the design itself rather
 * than as a fallback, and a CV whose monogram disagrees with its portrait
 * placeholder would be a strange thing to print.
 */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '—'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * Monogram disc. Drawn as an outlined circle rather than a filled one so it
 * survives a print run with "Background graphics" off — the ring is a border,
 * and borders always print.
 */
export function Monogram({
  name,
  size = '22mm',
  color,
  className,
}: {
  name: string
  size?: string
  color: string
  className?: string
}) {
  return (
    <div
      aria-hidden
      className={cn('grid shrink-0 place-items-center rounded-full border-[3px]', className)}
      style={{ width: size, height: size, borderColor: color }}
    >
      <span className="font-display text-[16pt] font-bold leading-none tracking-[0.06em]" style={{ color }}>
        {initialsOf(name)}
      </span>
    </div>
  )
}

/**
 * Section heading with a rule that bleeds past the column before fading.
 *
 * h2, not h3: the sheet's own name is the h1 and there is nothing between them.
 * `bleed` cancels the parent's horizontal padding, so a design that changes its
 * padding must pass the matching value or the rule stops at the text.
 */
export function RuleHeading({
  children,
  color,
  design,
  bleed = '2.25rem',
}: {
  children: ReactNode
  color: boolean
  design: ResumeDesign
  bleed?: string
}) {
  const line = color ? design.accent : '#171717'
  return (
    <div className="resume-avoid-break mb-5">
      <div
        className="h-[3px] rounded-full"
        style={{
          width: `calc(100% + ${bleed})`,
          background: `linear-gradient(to right, ${line}, ${line}66, transparent)`,
        }}
      />
      <h2
        className="mt-2 font-display text-[13pt] font-bold uppercase tracking-[0.3em]"
        style={{ color: color ? design.accentText : '#171717' }}
      >
        {children}
      </h2>
    </div>
  )
}

/** Quieter heading for designs without the full-width rule. */
export function PlainHeading({
  children,
  color,
  design,
  size = '11pt',
  className,
}: {
  children: ReactNode
  color: boolean
  design: ResumeDesign
  size?: string
  className?: string
}) {
  return (
    <h2
      className={cn(
        'resume-avoid-break mb-2 border-b border-neutral-300 pb-1 font-display font-bold uppercase tracking-[0.22em]',
        className
      )}
      style={{ fontSize: size, color: color ? design.accentText : '#171717' }}
    >
      {children}
    </h2>
  )
}

export interface TimelineItem {
  key: string
  period: string
  children: ReactNode
}

/**
 * Date-left timeline. The rail sits at 100px and the dot spans 96–106px, so the
 * dot straddles it; changing either column width means re-tuning both.
 */
export function Timeline({
  items,
  color,
  design,
}: {
  items: TimelineItem[]
  color: boolean
  design: ResumeDesign
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
              style={{ borderColor: color ? design.accent : '#171717' }}
            />
          </span>
          <div>{item.children}</div>
        </li>
      ))}
    </ol>
  )
}

/** Dateless variant for narrow columns: period sits above the entry. */
export function StackedList({ items }: { items: TimelineItem[] }) {
  if (items.length === 0) return null
  return (
    <ol className="space-y-3.5">
      {items.map((item) => (
        <li key={item.key} className="resume-avoid-break">
          <p className="text-[7.5pt] font-semibold uppercase tracking-wide text-neutral-500">
            {item.period}
          </p>
          <div className="mt-0.5">{item.children}</div>
        </li>
      ))}
    </ol>
  )
}

const SOCIAL_ICONS: Record<string, typeof Globe> = {
  GitHub: Github,
  LinkedIn: Linkedin,
}

/**
 * Contact block.
 *
 * The email and every social are real anchors. On paper they render as plain
 * text, and Chrome's "Save as PDF" keeps them as live links in the file — so a
 * CV mailed to an employer has a clickable address. The old print-only sheet
 * dropped `social.href` on the floor and rendered the label alone.
 */
export function ContactList({
  data,
  iconClass = 'text-white',
  className,
}: {
  data: ResumeData
  iconClass?: string
  className?: string
}) {
  const { profile } = data
  return (
    <ul className={cn('space-y-2.5 text-[8pt]', className)}>
      {profile.location && (
        <li className="flex items-center gap-2.5">
          <MapPin size={13} className={cn('shrink-0', iconClass)} />
          {profile.location}
        </li>
      )}
      {profile.phone && (
        <li className="flex items-center gap-2.5">
          <Phone size={13} className={cn('shrink-0', iconClass)} />
          <a href={`tel:${profile.phone.replace(/\s+/g, '')}`} className="text-inherit no-underline">
            {profile.phone}
          </a>
        </li>
      )}
      {profile.email && (
        <li className="flex items-start gap-2.5">
          <Mail size={13} className={cn('mt-[2px] shrink-0', iconClass)} />
          <a href={`mailto:${profile.email}`} className="break-all text-inherit no-underline">
            {profile.email}
          </a>
        </li>
      )}
      {profile.socials.map((social) => {
        const Icon = SOCIAL_ICONS[social.label] ?? Globe
        return (
          <li key={social.label} className="flex items-center gap-2.5">
            <Icon size={13} className={cn('shrink-0', iconClass)} />
            {social.href ? (
              <a href={social.href} className="text-inherit no-underline">
                {social.label}
              </a>
            ) : (
              social.label
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** Skill groups as outlined circles with the two-letter abbreviation. */
export function SkillCircles({
  data,
  color,
  design,
  columns = 4,
}: {
  data: ResumeData
  color: boolean
  design: ResumeDesign
  columns?: number
}) {
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {data.skills.map((group) => (
        <div key={group.area} className="text-center">
          <div
            className="mx-auto grid h-[52px] w-[52px] place-items-center rounded-full border-[3px]"
            style={{ borderColor: color ? design.accent : '#171717' }}
          >
            <span className="font-display text-[12pt] font-bold">{group.abbr}</span>
          </div>
          <p className="mt-1.5 text-[7.5pt] font-semibold uppercase tracking-wide">{group.area}</p>
          <p className="mt-1 text-[7pt] leading-snug text-neutral-500">
            {group.skills.join(' · ')}
          </p>
        </div>
      ))}
    </div>
  )
}

/** Courses, as rows rather than cards — the column is too narrow for cards. */
export function CourseTable({ data, dense = false }: { data: ResumeData; dense?: boolean }) {
    const { t } = useLingui()
  const size = dense ? 'text-[7.5pt]' : 'text-[8pt]'
  return (
    <table className="w-full border-collapse text-left">
      <tbody>
        {data.courses.map((course) => (
          <tr key={course.courseId} className="resume-avoid-break align-top">
            <td className={cn('border-b border-neutral-200 py-1.5 pr-3 font-bold', size)}>
              {course.title}
            </td>
            <td className="w-[26%] border-b border-neutral-200 py-1.5 pr-3 text-[7.5pt] text-neutral-500">
              {course.subjectArea ?? course.provider}
            </td>
            <td className="w-[18%] border-b border-neutral-200 py-1.5 text-right text-[7.5pt] font-semibold text-neutral-700">
              {course.status === 'completed' ? t`Completed` : `${course.progressPercentage}%`}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/**
 * Projects the member owns on KTIP.
 *
 * Not a Timeline: a project has no period, and inventing one from the row's
 * created_at would date the work rather than the record of it. Category and
 * phase ride along as a quiet meta line — a reader needs to know a prototype is
 * a prototype.
 */
export function ProjectList({ data, dense = false }: { data: ResumeData; dense?: boolean }) {
  const body = dense ? 'text-[7.5pt]' : 'text-[8pt]'
  return (
    <ul className="space-y-3">
      {data.projects.map((project) => {
        const meta = [project.category, project.phase].filter(Boolean).join(' · ')
        return (
          <li key={project.title} className="resume-avoid-break">
            <p className={cn('font-bold leading-tight', dense ? 'text-[8.5pt]' : 'text-[9.5pt]')}>
              {project.title}
            </p>
            {meta && (
              <p className="text-[7.5pt] uppercase tracking-wide text-neutral-500">{meta}</p>
            )}
            {project.summary && (
              <p className={cn('mt-0.5 leading-snug text-neutral-700', body)}>{project.summary}</p>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Certificates issued elsewhere and vouched for by their issuer.
 *
 * The verification code is printed rather than hidden behind the link, because
 * this sheet is a PDF as often as it is a web page and a reader holding paper
 * cannot click anything. The URL is shown as bare text for the same reason.
 */
export function CredentialList({ data, dense = false }: { data: ResumeData; dense?: boolean }) {
  const { t } = useLingui()
  const body = dense ? 'text-[7.5pt]' : 'text-[8pt]'
  return (
    <ul className="space-y-2.5">
      {data.credentials.map((credential) => {
        const year = credential.date ? new Date(credential.date).getUTCFullYear() : null
        const meta = [
          credential.issuer,
          year && !Number.isNaN(year) ? String(year) : null,
          // Only claimed when the issuer claimed it. An unverified certificate
          // is still worth listing; calling it verified is not ours to do.
          credential.verified ? t`Verified` : null,
        ]
          .filter(Boolean)
          .join(' · ')

        return (
          <li key={`${credential.title}-${credential.code}`} className="resume-avoid-break">
            <p className={cn('font-bold leading-tight', dense ? 'text-[8.5pt]' : 'text-[9pt]')}>
              {credential.title}
            </p>
            {meta && (
              <p className="text-[7.5pt] uppercase tracking-wide text-neutral-500">{meta}</p>
            )}
            {(credential.code || credential.verifyUrl) && (
              <p className={cn('leading-snug text-neutral-700', body)}>
                {credential.code && (
                  <Trans>Code {credential.code}</Trans>
                )}
                {credential.code && credential.verifyUrl && ' · '}
                {credential.verifyUrl && (
                  <a href={credential.verifyUrl} className="underline">
                    {credential.verifyUrl.replace(/^https?:\/\//, '')}
                  </a>
                )}
              </p>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Badges and recognitions.
 *
 * The year alone, never the full timestamp: `awarded_at` is precise to the
 * second, and "14 March 2026, 09:41" on a printed CV reads as a database dump.
 */
export function AwardList({ data, dense = false }: { data: ResumeData; dense?: boolean }) {
  const body = dense ? 'text-[7.5pt]' : 'text-[8pt]'
  return (
    <ul className="space-y-2.5">
      {data.awards.map((award) => {
        const year = award.date ? new Date(award.date).getUTCFullYear() : null
        return (
          <li key={`${award.name}-${award.date}`} className="resume-avoid-break">
            <p className={cn('font-bold leading-tight', dense ? 'text-[8.5pt]' : 'text-[9pt]')}>
              {award.name}
              {year && !Number.isNaN(year) && (
                <span className="ml-1.5 font-semibold text-neutral-500">{year}</span>
              )}
            </p>
            {award.description && (
              <p className={cn('leading-snug text-neutral-700', body)}>{award.description}</p>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** Academic competencies: subject in the stub column, skills in the body. */
export function AcademicTable({
  data,
  color,
  design,
}: {
  data: ResumeData
  color: boolean
  design: ResumeDesign
}) {
  return (
    <table className="w-full border-collapse text-left">
      <tbody>
        {data.academic.map((entry) => (
          <tr key={entry.subject} className="resume-avoid-break align-top">
            <th
              className="w-[34%] border-b border-neutral-200 py-1.5 pr-3 text-[8pt] font-bold"
              style={{ color: color ? design.accentText : '#171717' }}
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
  )
}
