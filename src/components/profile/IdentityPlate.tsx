import { useState, type CSSProperties, type ReactNode, type Ref } from 'react'
import { useLingui } from '@lingui/react/macro'
import { DiamondAvatar } from '../ui/DiamondAvatar'
import { VerifiedBadge } from '../ui/VerifiedBadge'
import { ROLE_LABELS } from '../../lib/constants'
import { resolveCopy } from '../../i18n/copy'
import { cn } from '../../lib/utils'
import type { UserRole } from '../../types'

interface IdentityPlateProps {
  /** URL fragment. English and stable — see the note in ProfileSection. */
  id?: string
  /** Scroll-spy marker. The member-page tutorial anchors its first step on
   *  `[data-spy="Profile"]`, so this string is load-bearing, not decoration. */
  spy?: string
  name: string
  avatarUrl?: string | null
  verified?: boolean
  roles?: UserRole[] | null
  /** The one-line summary under the role chips — country, employer, joined. */
  meta?: ReactNode
  /** Connect / Message / overflow. Laid out beside the name on the page,
   *  and left to the drawer's pinned footer, which passes nothing. */
  actions?: ReactNode
  /** A StandingMeter, or nothing when the member has earned no badges. */
  standing?: ReactNode
  /**
   * `page`  — L2 of the ladder: a raised plate that overlaps the hero band, so
   *           the banner becomes its backdrop instead of a stripe above a gap.
   * `panel` — no surface of its own. The drawer is already a surface, and a
   *           plate inside it would be a card inside a card.
   * `rail`  — the top of the member page's sticky rail: a rail-tone card with
   *           the diamond, the name and the credentials stacked, so the person
   *           stays on screen beside whatever is being read about them. The
   *           hero's portrait flies into this diamond (PortraitHero).
   */
  variant?: 'page' | 'panel' | 'rail'
  /** The box around the DiamondAvatar — the flight's landing rectangle. */
  avatarRef?: Ref<HTMLDivElement>
  avatarStyle?: CSSProperties
  /**
   * Drop the diamond. For a surface that is already showing the member's
   * portrait somewhere else — the member panel's cover — where a second copy
   * of the same face a centimetre below the first reads as a rendering fault.
   */
  hideAvatar?: boolean
  /** Rendered while the profile is still loading. */
  loading?: boolean
  className?: string
}

/**
 * The identity object: who this is, and the two things you can do about it.
 *
 * On the page this fixes a real defect rather than a stylistic one. The hero
 * band printed the name as the page h1, and the card below it then carried an
 * avatar and a meta row with no name at all — the two were written to avoid a
 * "stutter" and the result reads as broken markup, an orphaned photo floating
 * over unattributed facts. The name belongs on the object that represents the
 * person.
 */
export function IdentityPlate({
  id,
  spy,
  name,
  avatarUrl,
  verified,
  roles,
  meta,
  actions,
  standing,
  variant = 'page',
  avatarRef,
  avatarStyle,
  hideAvatar,
  loading,
  className,
}: IdentityPlateProps) {
  const page = variant === 'page'
  const rail = variant === 'rail'

  return (
    <header
      id={id}
      data-spy={spy}
      className={cn(
        'scroll-mt-24',
        page &&
          'neu-surface relative z-raised -mt-16 rounded-surface-lg bg-ktip-cream p-card-pad shadow-hard',
        rail && 'neu-surface rounded-surface-lg bg-ktip-cream p-5 shadow-hard',
        className
      )}
    >
      {/* The rail is a two-column grid — diamond, then the words — with the
          action row spanning both underneath. The page and the panel keep
          their flex arrangements. */}
      <div
        className={cn(
          page && 'flex flex-wrap items-start gap-5',
          rail && 'grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-x-4',
          !page && !rail && 'flex flex-col gap-5'
        )}
      >
        {/* The wrapper is the flight's landing box: the footprint DiamondAvatar
            reserves is exactly the diamond's bounding square.

            In the rail it is full size from the first paint, holding a dashed
            slot until the hero's portrait arrives — the page saying "the face
            lands here", the way the approved design draws it. PortraitHero
            writes `--land` on the rail as the portrait flies, and the `.land-*`
            rules in index.css fade the slot out, the ring and the face in.
            With no flight (no portrait, below lg) `--land` is unset and reads
            as 1: the face is simply there. */}
        {!hideAvatar && (
        <div
          ref={avatarRef}
          style={avatarStyle}
          className={cn('relative shrink-0', rail && 'self-start')}
        >
          {rail && (
            <>
              {/* The empty slot the portrait lands in: the same diamond as the
                  green edge, drawn as a hairline outline on the plate's fill,
                  so the card says "the face belongs here" before it arrives. */}
              <span
                aria-hidden
                className="land-slot pointer-events-none absolute inset-0 bg-ktip-sand-300 [clip-path:polygon(50%_0,100%_50%,50%_100%,0_50%)]"
              >
                <span className="absolute inset-px bg-ktip-cream [clip-path:polygon(50%_0,100%_50%,50%_100%,0_50%)]" />
              </span>
              {/* The green edge. It is the one place the brand colour touches
                  the member's own face, so it is a hairline, not a band. */}
              <span
                aria-hidden
                className="land-ring pointer-events-none absolute inset-[-5px] bg-[linear-gradient(150deg,var(--color-ktip-tropical-400),var(--color-ktip-tropical-600)_38%,transparent_72%)] [clip-path:polygon(50%_0,100%_50%,50%_100%,0_50%)]"
              >
                <span className="absolute inset-[5px] bg-ktip-cream [clip-path:polygon(50%_0,100%_50%,50%_100%,0_50%)]" />
              </span>
            </>
          )}
          <DiamondAvatar
            src={avatarUrl}
            name={loading ? '' : name}
            // 120 in the rail: the plate is 21.25rem wide, which leaves the
            // name about 170px — "Andre Williams" wraps to two lines at
            // title size, which the design accepts.
            size={page ? 112 : rail ? RAIL_AVATAR : 88}
            colorClass={loading ? 'bg-ktip-sand-300' : undefined}
            // Pulled up so the diamond breaks the plate's top edge on the page
            // and the drawer's cover fade in the panel. Half in, half out is what
            // ties the two planes together. The rail's sits flush.
            className={cn(page ? '-mt-14' : rail ? 'land-avatar' : '-mt-11')}
            // `rounded-none` in the rail: DiamondAvatar rounds the tilted
            // square's corners by 11% of its side, and behind it the green
            // edge and the empty slot are true diamonds with points. Two
            // shapes, one inside the other, disagreeing at all four corners.
            // The frame gives way to the sharp one.
            frameClassName={
              rail ? 'relative rounded-none shadow-soft' : 'ring-4 ring-ktip-cream shadow-soft'
            }
          />
        </div>
        )}

        <div className={cn('min-w-0 flex-1', rail && 'land-who')}>
          {loading ? (
            <div className="space-y-2">
              <div className="h-7 w-48 animate-pulse-soft rounded-control bg-ktip-sand-100" />
              <div className="h-4 w-32 animate-pulse-soft rounded-control bg-ktip-sand-100" />
            </div>
          ) : (
            <>
              {/* h1 on the page, where this is the document's subject; h2 in
                  the drawer, which is a complementary region layered over a
                  page that already has one. */}
              <Heading
                level={page ? 1 : 2}
                className={cn(
                  'flex min-w-0 items-center gap-2 font-display text-ktip-sand-900',
                  page
                    ? 'text-title-lg font-bold leading-tight'
                    : rail
                      ? 'text-title font-semibold leading-[1.05]'
                      : 'text-title font-bold leading-tight'
                )}
              >
                <span className="min-w-0 break-words">{name}</span>
                <VerifiedBadge verified={verified} size={20} />
              </Heading>

              {roles?.length ? <RoleLine roles={roles} /> : null}

              {meta && (
                <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-ktip-sand-600">
                  {meta}
                </div>
              )}
            </>
          )}
        </div>

        {actions && (
          <div
            className={cn(
              'flex shrink-0 flex-wrap items-start gap-2',
              // In the rail the row spans both columns under the diamond and
              // the words; the two real actions share the width evenly and the
              // icon-only report keeps its own size at the end of the row —
              // stretching a 16px flag to a third of the card made reporting
              // someone look like a primary thing to do. It fades in as the
              // portrait lands (.land-actions), because until then the hero
              // above still carries the same two buttons.
              rail &&
                'land-actions col-span-full mt-4 w-full flex-nowrap items-center [&>*:not([aria-label])]:min-w-0 [&>*:not([aria-label])]:flex-1 [&>[aria-label]]:shrink-0 [&_button]:w-full'
            )}
          >
            {actions}
          </div>
        )}
      </div>

      {standing && <div className="mt-5">{standing}</div>}
    </header>
  )
}

/** The rail diamond's footprint, px — the box the flight lands in. */
const RAIL_AVATAR = 120

/** Roles shown before the rest fold behind a "+N". */
const ROLE_CAP = 6

/**
 * The credentials line.
 *
 * Roles used to render through ROLE_COLORS, which gives every role its own
 * brand tint. That is right in the directory filter bar, where colour is how
 * you tell one filter from another — and wrong here, because an account can
 * hold seventeen roles and the result was a paragraph of rainbow pills that
 * looked like a bag of highlighter tags rather than a person's standing.
 *
 * A CV states credentials in one voice and lets the words carry the
 * difference, so these are one quiet chip repeated, capped, with the rest a
 * click away. The count is a bare numeral, which needs no translation.
 */
function RoleLine({ roles }: { roles: UserRole[] }) {
  const { i18n } = useLingui()
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? roles : roles.slice(0, ROLE_CAP)
  const hidden = roles.length - shown.length

  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
      {shown.map((role) => (
        <span
          key={role}
          className="inline-flex items-center rounded-control border border-ktip-sand-200 bg-ktip-sand-50 px-2 py-0.5 text-micro font-semibold text-ktip-sand-700"
        >
          {resolveCopy(i18n, ROLE_LABELS[role] || role)}
        </span>
      ))}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="inline-flex items-center rounded-control border border-dashed border-ktip-sand-300 px-2 py-0.5 text-micro font-semibold tabular-nums text-ktip-sand-500 transition-colors hover:border-ktip-ocean-300 hover:text-ktip-ocean-700"
        >
          +{hidden}
        </button>
      )}
    </div>
  )
}

function Heading({
  level,
  className,
  children,
}: {
  level: 1 | 2
  className?: string
  children: ReactNode
}) {
  const Tag = level === 1 ? 'h1' : 'h2'
  return <Tag className={className}>{children}</Tag>
}

/** The interpunct between meta items. Kept here so both surfaces match. */
export function MetaDot() {
  return (
    <span aria-hidden className="text-ktip-sand-300">
      ·
    </span>
  )
}
