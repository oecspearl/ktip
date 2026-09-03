import { Link } from 'react-router'
import { useLingui } from '@lingui/react/macro'
import { TrophyImage } from '../achievements/TrophyImage'
import { TIER_ACCENT, TIER_LABEL } from '../../lib/achievement-style'
import { resolveCopy } from '../../i18n/copy'
import { cn } from '../../lib/utils'
import type { BadgeDefinition, TrophyAssetMap, UserBadge } from '../../types'

interface TrophyShelfProps {
  badges: UserBadge[]
  assetMap: TrophyAssetMap
  /**
   * Unearned badges, shown muted beneath the earned ones. Optional because the
   * drawer does not fetch the badge catalogue — it is a preview, and one more
   * request per card open is not worth a teaser row.
   */
  locked?: BadgeDefinition[]
  /** Cap on the earned grid. The remainder collapse into one "View all" tile. */
  max?: number
  /** Destination for the overflow tile. Omit and the overflow renders inert. */
  moreHref?: string
  /** Artwork edge in px. 56 on the page, 48 in the drawer. */
  size?: number
  className?: string
}

/**
 * Earned trophies as artwork.
 *
 * Both surfaces previously rendered these as `AchievementBadge` pills — nine
 * grey chips reading "First Ask (Bronze)", "Funded (Gold)". The whole trophy
 * system (TrophyImage, the tier metals, the per-rarity grounds) already
 * shipped and neither surface used it; the profile page imported `MiniTrophy`
 * and spent it only on pinned showcase items.
 *
 * The artwork is the reward. Rendering it as text was the single largest
 * reason a profile looked like a database row.
 *
 * The tiles auto-fill rather than sitting on a breakpoint, because the same
 * component renders inside a 34rem drawer and a 1fr page column.
 */
export function TrophyShelf({
  badges,
  assetMap,
  locked,
  max,
  moreHref,
  size = 56,
  className,
}: TrophyShelfProps) {
  const { t, i18n } = useLingui()
  if (!badges.length) return null

  const shown = max ? badges.slice(0, max) : badges
  const overflow = badges.length - shown.length

  return (
    <div className={className}>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-3">
        {shown.map((userBadge) =>
          userBadge.badge ? (
            <Tile
              key={userBadge.id}
              badge={userBadge.badge}
              assetMap={assetMap}
              size={size}
              tierLabel={
                userBadge.badge.tier
                  ? resolveCopy(i18n, TIER_LABEL[userBadge.badge.tier])
                  : undefined
              }
            />
          ) : null
        )}

        {overflow > 0 && (
          <li>
            <Well
              as={moreHref ? Link : 'div'}
              to={moreHref}
              className={cn(
                'border border-dashed border-ktip-sand-300 bg-transparent shadow-none',
                moreHref && 'transition-colors hover:border-ktip-ocean-300 hover:bg-ktip-sand-50'
              )}
            >
              <span className="font-display text-title-sm font-bold tabular-nums text-ktip-sand-500">
                +{overflow}
              </span>
            </Well>
            <p className="mt-1.5 text-center text-micro leading-tight text-ktip-sand-500">
              {t`View all`}
            </p>
          </li>
        )}
      </ul>

      {locked && locked.length > 0 && (
        <div className="mt-5 border-t border-dashed border-ktip-sand-300 pt-4">
          <p className="mb-2.5 text-micro font-semibold uppercase tracking-[0.14em] text-ktip-sand-400">
            {t`Locked`}
          </p>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-3">
            {locked.map((badge) => (
              <Tile
                key={badge.id}
                badge={badge}
                assetMap={assetMap}
                size={size}
                locked
                tierLabel={badge.tier ? resolveCopy(i18n, TIER_LABEL[badge.tier]) : undefined}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/** One trophy: artwork in a recessed well, name, tier. */
function Tile({
  badge,
  assetMap,
  size,
  tierLabel,
  locked,
}: {
  badge: BadgeDefinition
  assetMap: TrophyAssetMap
  size: number
  tierLabel?: string
  locked?: boolean
}) {
  return (
    <li className="text-center">
      <Well>
        <TrophyImage
          icon={badge.icon}
          trophyType={badge.trophy_type}
          tier={badge.tier}
          imageUrl={badge.image_url}
          rarity={badge.rarity}
          assetMap={assetMap}
          name={badge.name}
          size={size}
          locked={locked}
        />
      </Well>
      <p
        className={cn(
          'mt-1.5 text-micro font-semibold leading-tight',
          locked ? 'text-ktip-sand-400' : 'text-ktip-sand-800'
        )}
      >
        {badge.name}
      </p>
      {tierLabel && (
        <p
          className={cn(
            'text-micro font-semibold uppercase tracking-[0.1em]',
            locked ? 'text-ktip-sand-400' : badge.tier && TIER_ACCENT[badge.tier]
          )}
        >
          {tierLabel}
        </p>
      )}
    </li>
  )
}

/**
 * The recessed square the artwork sits in — L3 of the ladder. Carving a well
 * out of the card is what makes a flat PNG read as an object placed in it.
 */
function Well({
  as: As = 'div',
  to,
  className,
  children,
}: {
  as?: typeof Link | 'div'
  to?: string
  className?: string
  children: React.ReactNode
}) {
  const cls = cn(
    'flex aspect-square w-full items-center justify-center rounded-surface bg-ktip-sand-100 shadow-neu-sm-inset',
    className
  )
  if (As === Link && to) {
    return (
      <Link to={to} className={cls}>
        {children}
      </Link>
    )
  }
  return <div className={cls}>{children}</div>
}
