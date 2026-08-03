import { Lock } from 'lucide-react'
import { TrophyImage } from './TrophyImage'
import { RARITY_CARD, RARITY_LABEL, TIER_LABEL, rarityOf } from '../../lib/achievement-style'
import { cn } from '../../lib/utils'
import type { BadgeDefinition, BadgeRarity, BadgeTier, TrophyAssetMap } from '../../types'
import { Trans, useLingui } from '@lingui/react/macro'

/**
 * The rich trophy card: unlock popup, gallery grid, profile shelf.
 *
 * Deliberately takes loose props rather than a BadgeDefinition, because the
 * unlock payload from check_my_achievements() is a slimmed-down object with no
 * id — building a fake BadgeDefinition just to render it would be worse.
 */

export interface TrophyCardProps {
  name: string
  description: string
  icon: string
  rarity?: BadgeRarity | null
  tier?: BadgeTier | null
  trophyType?: string | null
  imageUrl?: string | null
  points?: number
  category?: string
  assetMap: TrophyAssetMap
  /** Unearned. Shows progress instead of an earn date. */
  locked?: boolean
  earnedAt?: string | null
  progress?: { current: number; target: number } | null
  size?: 'sm' | 'lg'
  /**
   * Grid density. Drops the description so a tile is scannable at a glance —
   * the full text lives in the detail modal the tile opens. 75 tiles each
   * carrying a full sentence is what made the gallery unreadable.
   */
  compact?: boolean
  className?: string
}

export function TrophyCard({
  name,
  description,
  icon,
  rarity,
  tier,
  trophyType,
  imageUrl,
  points,
  assetMap,
  locked,
  earnedAt,
  progress,
  size = 'sm',
  compact = false,
  className,
}: TrophyCardProps) {
    const { t } = useLingui()
  const effectiveRarity = rarityOf(rarity)
  const isLegendary = effectiveRarity === 'legendary' && !locked
  const imageSize = size === 'lg' ? 128 : 72

  const pct =
    progress && progress.target > 0
      ? Math.min(100, Math.round((progress.current / progress.target) * 100))
      : 0
  const started = !!progress && progress.current > 0

  return (
    <div
      className={cn(
        'flex flex-col items-center text-center gap-3 rounded-2xl border p-4 transition-colors',
        // Locked used to differ from earned-common by 20% of one tint, which
        // read as "same card, slightly washed out". A dashed border plus a
        // darker fill makes the two states tell apart without hovering.
        locked
          ? 'border-dashed border-ktip-sand-300 bg-ktip-sand-100/70'
          : RARITY_CARD[effectiveRarity],
        className
      )}
    >
      {locked && (
        <span className="inline-flex items-center gap-1 rounded-full bg-ktip-sand-200/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ktip-sand-600">
          <Lock size={10} aria-hidden="true" />
          {started ? t`In progress` : t`Locked`}
        </span>
      )}

      <TrophyImage
        icon={icon}
        trophyType={trophyType}
        tier={tier}
        imageUrl={imageUrl}
        rarity={rarity}
        assetMap={assetMap}
        name={name}
        size={imageSize}
        locked={locked}
      />

      <div className="space-y-1">
        <h3
          className={cn(
            'font-display font-bold leading-tight',
            size === 'lg' ? 'text-xl' : 'text-sm',
            // Legendary cards are navy-filled, so their text has to invert.
            isLegendary ? 'text-white' : locked ? 'text-ktip-sand-500' : 'text-ktip-sand-900'
          )}
        >
          {name}
        </h3>
        {!compact && (
          <p
            className={cn(
              'text-xs leading-snug',
              isLegendary ? 'text-white/80' : 'text-ktip-sand-600'
            )}
          >
            {description}
          </p>
        )}
      </div>

      {/* Rarity and tier are stated in text, never by colour alone. */}
      <div
        className={cn(
          'flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[11px] font-medium',
          isLegendary ? 'text-ktip-sun-300' : 'text-ktip-sand-500'
        )}
      >
        <span>{RARITY_LABEL[effectiveRarity]}</span>
        {tier && (
          <>
            <span aria-hidden="true">·</span>
            <span>{TIER_LABEL[tier]}</span>
          </>
        )}
        {typeof points === 'number' && (
          <>
            <span aria-hidden="true">·</span>
            <span><Trans>{points} pts</Trans></span>
          </>
        )}
      </div>

      {/* A locked tile always says where it stands. It used to render nothing
          at all when the server had no progress row, which left most of the
          grid as cards with no visible path to unlocking. */}
      {locked &&
        (progress && progress.target > 0 ? (
          <div className="w-full space-y-1">
            <div
              className="h-1.5 w-full rounded-full bg-ktip-sand-200 overflow-hidden"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={progress.target}
              aria-valuenow={progress.current}
              aria-label={t`${name} progress`}
            >
              <div
                className="h-full rounded-full bg-ktip-ocean-500 transition-[width]"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-[11px] text-ktip-sand-500 tabular-nums">
              {progress.current} / {progress.target}
            </p>
          </div>
        ) : (
          <p className="text-[11px] text-ktip-sand-500"><Trans>Awarded automatically</Trans></p>
        ))}

      {!locked && earnedAt && (
        <p className={cn('text-[11px]', isLegendary ? 'text-white/70' : 'text-ktip-sand-500')}>
          <Trans>Earned {new Date(earnedAt).toLocaleDateString()}</Trans>
        </p>
      )}
    </div>
  )
}

/**
 * A hidden achievement the member has not found yet. Shows the shape of the
 * thing without spoiling it — the count of these is the whole hook.
 */
export function SecretTrophyCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-ktip-sand-300 bg-ktip-sand-50/40 p-4 text-center min-h-[180px]',
        className
      )}
    >
      <span className="text-3xl text-ktip-sand-400" aria-hidden="true">
        ?
      </span>
      <p className="text-sm font-medium text-ktip-sand-500"><Trans>Secret achievement</Trans></p>
      <p className="text-xs text-ktip-sand-400"><Trans>Keep exploring to find it</Trans></p>
    </div>
  )
}

/** Compact variant for showcases, dashboard rows and leaderboard entries. */
export function MiniTrophy({
  badge,
  assetMap,
  size = 40,
}: {
  badge: BadgeDefinition
  assetMap: TrophyAssetMap
  size?: number
}) {
  return (
    <TrophyImage
      icon={badge.icon}
      trophyType={badge.trophy_type}
      tier={badge.tier}
      imageUrl={badge.image_url}
      rarity={badge.rarity}
      assetMap={assetMap}
      name={badge.name}
      size={size}
      className="shrink-0"
    />
  )
}
