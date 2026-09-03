import { useState, type ReactNode } from 'react'
import { CheckCircle } from 'lucide-react'
import { useLingui } from '@lingui/react/macro'
import { DiamondAvatar } from '../ui/DiamondAvatar'
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
   */
  variant?: 'page' | 'panel'
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
  loading,
  className,
}: IdentityPlateProps) {
  const { t } = useLingui()
  const page = variant === 'page'

  return (
    <header
      id={id}
      data-spy={spy}
      className={cn(
        'scroll-mt-24',
        page &&
          'neu-surface relative z-raised -mt-16 rounded-surface-lg bg-ktip-cream p-card-pad shadow-hard',
        className
      )}
    >
      <div className={cn('flex gap-5', page ? 'flex-wrap items-start' : 'flex-col')}>
        <DiamondAvatar
          src={avatarUrl}
          name={loading ? '' : name}
          size={page ? 112 : 88}
          colorClass={loading ? 'bg-ktip-sand-300' : undefined}
          // Pulled up so the diamond breaks the plate's top edge on the page
          // and the drawer's cover fade in the panel. Half in, half out is what
          // ties the two planes together.
          className={page ? '-mt-14' : '-mt-11'}
          frameClassName="ring-4 ring-ktip-cream shadow-soft"
        />

        <div className="min-w-0 flex-1">
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
                  'flex min-w-0 items-center gap-2 font-display font-bold leading-tight text-ktip-sand-900',
                  page ? 'text-title-lg' : 'text-title'
                )}
              >
                <span className="min-w-0 break-words">{name}</span>
                {verified && (
                  <CheckCircle
                    size={20}
                    className="shrink-0 text-ktip-ocean-500"
                    aria-label={t`Verified member`}
                  />
                )}
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

        {actions && <div className="flex shrink-0 flex-wrap items-start gap-2">{actions}</div>}
      </div>

      {standing && <div className="mt-5">{standing}</div>}
    </header>
  )
}

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
