import { Lock, X } from 'lucide-react'
import { TrophyImage } from './TrophyImage'
import {
  RARITY_ACCENT,
  RARITY_BLOOM,
  RARITY_CHIP,
  RARITY_CORE,
  RARITY_EDGE,
  RARITY_GROUND,
  RARITY_LABEL,
  TIER_ACCENT,
  TIER_LABEL,
  TIER_ORDER,
  rarityOf,
} from '../../lib/achievement-style'
import { categoryMeaning, holderText, requirementText } from '../../lib/achievement-copy'
import { resolveCopy } from '../../i18n/copy'
import { cn } from '../../lib/utils'
import type { BadgeDefinition, BadgeRarity, BadgeTier, TrophyAssetMap } from '../../types'
import { Trans, useLingui } from '@lingui/react/macro'

/**
 * The rich trophy card: gallery grid, detail popup, unlock celebration.
 *
 * Deliberately takes loose props rather than a BadgeDefinition, because the
 * unlock payload from check_my_achievements() is a slimmed-down object with no
 * id — building a fake BadgeDefinition just to render it would be worse.
 *
 * WHY THE CARD IS DARK IN BOTH MODES
 * The artwork is 42 renders of gold, silver, bronze and clear crystal on
 * transparent backgrounds. Metal only reads as metal against something dark:
 * on ktip-cream a silver trophy is a grey smudge and a crystal one is close to
 * invisible. Every colour on this card therefore comes from the fixed
 * metal-* / rarity-* / trophy-ground-* tokens, which are absent from the
 * html.dark block on purpose. This is the escape hatch described in rule 2 at
 * index.css:413, not an oversight.
 *
 * WHAT DRIVES THE COLOUR
 * Rarity owns the card — the bloom, the edge, the accent on the name. Tier
 * owns the metal, which is already carried by the artwork itself, so it only
 * needs its chip. Colouring by both at once double-encoded and made a
 * bronze-tier epic unreadable; half the badges are untiered anyway.
 *
 * Rarity and tier are BOTH always stated in text. Colour is reinforcement,
 * never the only carrier.
 */

/** Row alignment. SecretTrophyCard matches it so mixed rows stay level. */
const COMPACT_MIN_H = 'min-h-[15.5rem]'

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
  /** Raw category slug, for the meaning copy. `category` is its display label. */
  categoryKey?: string | null
  /** From the badge definition — drives the "What it takes" line. */
  checkKey?: string | null
  checkValue?: number | null
  /** How many members hold this badge, and the membership it is measured against. */
  holders?: number
  eligible?: number
  assetMap: TrophyAssetMap
  /** Unearned. Shows progress instead of an earn date. */
  locked?: boolean
  earnedAt?: string | null
  progress?: { current: number; target: number } | null
  size?: 'sm' | 'lg'
  /**
   * Grid density. Drops the description so a tile is scannable at a glance —
   * the full text lives in the detail popup the tile opens. 68 tiles each
   * carrying a full sentence is what made the gallery unreadable.
   */
  compact?: boolean
  /**
   * Mesh mode. The tile fills its grid track edge-to-edge with no radius,
   * border or hover lift — the grid's hairline gaps are the only separator,
   * and hover motion belongs to the cell wrapper so a lift can't reveal the
   * gap under the tile.
   */
  flush?: boolean
  /** Renders a close control inside the card. `lg` only — the card is the dialog. */
  onClose?: () => void
  className?: string
}

/**
 * Splits a name so the tail can take the rarity accent, as in the reference
 * designs ("Night **Owl**"). Single-word names keep their one word white
 * rather than colouring the whole title, which would read as a state change.
 */
function splitName(name: string): [string, string] {
  const words = name.trim().split(/\s+/)
  if (words.length < 2) return [name, '']
  return [words.slice(0, -1).join(' '), words[words.length - 1]]
}

export function TrophyCard(props: TrophyCardProps) {
  return props.size === 'lg' ? <TrophyShowcase {...props} /> : <TrophyTile {...props} />
}

/**
 * The landscape showcase: detail popup and unlock celebration.
 *
 * The artwork stands taller than the panel and breaks its top and bottom
 * edges, which is the whole gesture — a trophy sitting neatly inside a box
 * looks like a product photo, one overflowing it looks like an object on a
 * shelf. Nothing in the chain may clip it: the panel is not overflow-hidden,
 * and Modal has a `bare` mode for exactly this.
 *
 * Below `sm` it stacks, artwork first, because there is no room for a column
 * of text beside a 260px trophy on a phone.
 */
function TrophyShowcase({
  name,
  description,
  icon,
  rarity,
  tier,
  trophyType,
  imageUrl,
  points,
  category,
  categoryKey,
  checkKey,
  checkValue,
  holders,
  eligible,
  assetMap,
  locked,
  earnedAt,
  progress,
  onClose,
  className,
}: TrophyCardProps) {
  const { t, i18n } = useLingui()
  const effectiveRarity = rarityOf(rarity)
  const [head, tail] = splitName(name)
  const accent = locked ? 'text-trophy-ink/60' : RARITY_ACCENT[effectiveRarity]

  // Falls back to the progress target so a badge whose definition did not
  // reach this component still gets its requirement line.
  const requirement = requirementText(checkKey, checkValue ?? progress?.target)
  const meaning = categoryMeaning(i18n, categoryKey)

  const pct =
    progress && progress.target > 0
      ? Math.min(100, Math.round((progress.current / progress.target) * 100))
      : 0

  return (
    <div className={cn('group relative flex flex-col items-center sm:block', className)}>
      {/* Bloom, centred on the artwork rather than the panel so the light
          appears to come off the trophy. Two discs: a wide soft one and a
          tighter hot core, because a single flat disc reads as a coloured
          rectangle behind the trophy rather than as light. */}
      {!locked && (
        <>
          <span
            aria-hidden="true"
            className={cn(
              // Night only: by day the pastel ground wash carries the rarity
              // colour, and a dark bloom on a pastel reads as a stain.
              'pointer-events-none absolute z-underlay hidden h-[30rem] w-[30rem] rounded-full blur-3xl dark:block',
              'left-1/2 top-0 -translate-x-1/2 sm:left-auto sm:right-[2%] sm:top-[38%] sm:translate-x-0 sm:-translate-y-1/2',
              RARITY_BLOOM[effectiveRarity]
            )}
          />
          <span
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute z-underlay hidden h-64 w-64 rounded-full blur-2xl dark:block',
              'left-1/2 top-20 -translate-x-1/2 sm:left-auto sm:right-[9%] sm:top-[38%] sm:translate-x-0 sm:-translate-y-1/2',
              RARITY_CORE[effectiveRarity]
            )}
          />
        </>
      )}

      {/* Artwork. Static and above the panel on mobile; on sm+ absolutely
          placed so it straddles the panel's right edge and stands taller than
          the panel itself. The asymmetric inset (-top-24 / -bottom-4) is what
          lifts it: a trophy centred on the panel looks parked, one riding high
          out of the top edge looks like it is standing on the card. Nothing in
          the chain may be overflow-hidden. */}
      <div className="sm:absolute sm:-top-36 sm:-bottom-2 sm:right-0 sm:z-raised sm:flex sm:w-[46%] sm:items-center sm:justify-center">
        <TrophyImage
          icon={icon}
          trophyType={trophyType}
          tier={tier}
          imageUrl={imageUrl}
          rarity={rarity}
          assetMap={assetMap}
          name={name}
          size={440}
          locked={locked}
          glare
          // Scales past its own box on sm+. The renders carry ~8% transparent
          // margin of their own, so the drawn trophy is smaller than the box
          // and needs the overshoot to actually clear the panel edges.
          className="sm:scale-[1.32]"
        />
      </div>

      <div
        className={cn(
          'relative w-full rounded-2xl border p-6 text-left sm:w-[78%] sm:py-10 sm:pl-9',
          locked ? RARITY_GROUND.common : RARITY_GROUND[effectiveRarity],
          locked ? 'border-dashed border-trophy-ink/12' : RARITY_EDGE[effectiveRarity]
        )}
      >
        {/* Close rides the top-left corner, half off the card. Hover-only on
            pointer devices; always visible on touch, where there is no hover
            and a hidden close button is a trap. Shares the artwork's layer and
            comes after it in the tree, so it stays clickable where the two
            corners meet. */}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={t`Close`}
            className={cn(
              'absolute -left-3 -top-3 z-raised inline-flex h-8 w-8 items-center justify-center rounded-full',
              'border border-trophy-ink/20 bg-trophy-ground text-trophy-ink/70 shadow-lg',
              'transition-[opacity,transform,background-color] duration-200',
              'hover:scale-105 hover:bg-trophy-ink/15 hover:text-trophy-ink',
              'sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 focus-visible:opacity-100'
            )}
          >
            <X size={15} aria-hidden="true" />
          </button>
        )}

        {/* Chips flush left. They were right-aligned and the artwork, which
            overlaps that corner, sat on top of them. */}
        <div className="flex flex-wrap items-center gap-2">
          <RarityChip rarity={effectiveRarity} locked={locked} />
          {locked && <LockChip started={!!progress && progress.current > 0} />}
        </div>

        {/* Two columns from sm up. Everything used to stack in one column
            capped at 70% of the panel, which made a "landscape" card come out
            very nearly square — the width was there, the text just was not
            using it. Title left, prose right, details across the full run
            underneath. `sm:max-w-[74%]` is the width clear of the artwork,
            which straddles the panel's right edge. */}
        <div className="mt-6 sm:max-w-[74%]">
          <div className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
            <div>
              {category && (
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-trophy-ink/60">
                  {category}
                </p>
              )}

              <h3
                className={cn(
                  'font-display text-4xl font-bold leading-[1.02] tracking-tight',
                  category ? 'mt-2' : '',
                  locked ? 'text-trophy-ink/65' : 'text-trophy-ink'
                )}
              >
                {head}
                {tail && (
                  <>
                    <br />
                    <span className={accent}>{tail}</span>
                  </>
                )}
              </h3>

              <p
                className={cn(
                  'mt-3 text-sm leading-relaxed',
                  locked ? 'text-trophy-ink/60' : 'text-trophy-ink/65'
                )}
              >
                {description}
              </p>

              {/* Locked cards get the bar in the title column: the percentage
                  is the headline for something you have not won. */}
              {locked && progress && progress.target > 0 && (
                <div className="mt-5">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-trophy-ink/60">
                      <Trans>Progress</Trans>
                    </span>
                    <span className="font-display text-sm font-bold tabular-nums text-trophy-ink/90">
                      {pct}%
                    </span>
                  </div>
                  <div
                    className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-trophy-ink/10"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={progress.target}
                    aria-valuenow={progress.current}
                    aria-label={t`${name} progress`}
                  >
                    <div
                      className="h-full rounded-full bg-trophy-ink/60 transition-[width]"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Prose. Two questions the card could not previously answer: what
                the bar actually was, and why anyone should care it was met.
                Headers are part of the rhythm here, not decoration — they are
                what let the second column be read as two answers rather than
                one run-on paragraph. */}
            {(requirement || meaning) && (
              <div className="space-y-5">
                {requirement && (
                  <section>
                    <h4 className="text-[9px] font-semibold uppercase tracking-[0.18em] text-trophy-ink/60">
                      <Trans>What it takes</Trans>
                    </h4>
                    <p
                      className={cn(
                        'mt-1.5 text-sm leading-relaxed',
                        locked ? 'text-trophy-ink/60' : 'text-trophy-ink/90'
                      )}
                    >
                      {requirement}
                    </p>
                  </section>
                )}

                {meaning && (
                  <section>
                    <h4 className="text-[9px] font-semibold uppercase tracking-[0.18em] text-trophy-ink/60">
                      {locked ? (
                        <Trans>What it would say</Trans>
                      ) : (
                        <Trans>What it says about you</Trans>
                      )}
                    </h4>
                    <p
                      className={cn(
                        'mt-1.5 text-sm leading-relaxed',
                        locked ? 'text-trophy-ink/60' : 'text-trophy-ink/65'
                      )}
                    >
                      {meaning}
                    </p>
                  </section>
                )}
              </div>
            )}
          </div>
        </div>

        <DetailGrid
          className="mt-7 sm:max-w-[74%]"
          points={points}
          earnedAt={earnedAt}
          tier={tier}
          category={category}
          progress={progress}
          locked={locked}
          accent={accent}
          holders={holders}
          eligible={eligible}
        />
      </div>
    </div>
  )
}

/**
 * The showcase's detail block. Every row is derived from data the badge
 * already carries — there is deliberately no "held by the top 8% of members"
 * row, because nothing in the schema supports that figure and a made-up
 * statistic on a page members screenshot and share is not acceptable.
 */
function DetailGrid({
  className,
  points,
  earnedAt,
  tier,
  category,
  progress,
  locked,
  accent,
  holders,
  eligible,
}: {
  className?: string
  points?: number
  earnedAt?: string | null
  tier?: BadgeTier | null
  category?: string
  progress?: { current: number; target: number } | null
  locked?: boolean
  accent: string
  holders?: number
  eligible?: number
}) {
  // Called here rather than taken as a prop. The Lingui macro cannot transform
  // a `t` that arrives as a parameter, and the untransformed template silently
  // resolves to an empty string — which is exactly how this grid once shipped
  // with no labels at all. See the note in lib/achievement-copy.ts.
  const { t, i18n } = useLingui()

  const rows: { label: string; value: string; accent?: string }[] = []

  rows.push({
    label: t`Date acquired`,
    value:
      !locked && earnedAt
        ? new Date(earnedAt).toLocaleDateString(undefined, {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })
        : t`Not yet earned`,
  })

  if (typeof points === 'number') {
    rows.push({
      label: t`Worth`,
      value: t`+${points} pts`,
      accent: locked ? undefined : accent,
    })
  }

  const heldBy = holderText(holders, eligible)
  if (heldBy) rows.push({ label: t`Held by`, value: heldBy })

  if (tier) {
    const rung = TIER_ORDER.indexOf(tier) + 1
    // Position in the ladder, which the tier name alone does not give you —
    // "Silver" means little until you know it is 2 of 4 and there are two more.
    rows.push({
      label: t`Tier`,
      value: t`${resolveCopy(i18n, TIER_LABEL[tier])} — ${rung} of ${TIER_ORDER.length}`,
      accent: locked ? undefined : TIER_ACCENT[tier],
    })
  }

  // No Rarity row: the chip in the card's top-left already states it, and this
  // was the only row that repeated something else on the same card.

  if (locked && progress && progress.target > 0) {
    rows.push({
      label: t`Remaining`,
      value: t`${Math.max(0, progress.target - progress.current)} to go`,
    })
  }

  if (category) rows.push({ label: t`Category`, value: category })

  // No "Trophy: Key" row. The sculpture is right there on the card, four times
  // the size of any text on it; naming it is caption, not information.

  return (
    <dl
      className={cn(
        // Three across, not two: in a landscape card the detail block is what
        // sets the floor on card height, and two columns of five rows was
        // adding a third of it back.
        'grid grid-cols-2 gap-x-8 gap-y-3 border-t border-trophy-ink/10 pt-4 sm:grid-cols-3',
        className
      )}
    >
      {rows.map((row) => (
        <div key={row.label} className="min-w-0">
          <dt className="truncate text-[9px] font-medium uppercase tracking-wider text-trophy-ink/60">
            {row.label}
          </dt>
          <dd
            className={cn(
              'font-display mt-0.5 truncate text-sm font-bold',
              row.accent || 'text-trophy-ink/90'
            )}
          >
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** The portrait grid tile. */
function TrophyTile({
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
  compact = false,
  flush = false,
  className,
}: TrophyCardProps) {
  const { t } = useLingui()
  const effectiveRarity = rarityOf(rarity)
  // The artwork is the content of this card, so it gets the room. 144 was 104.
  const imageSize = 144

  const pct =
    progress && progress.target > 0
      ? Math.min(100, Math.round((progress.current / progress.target) * 100))
      : 0
  const started = !!progress && progress.current > 0

  const [head, tail] = splitName(name)
  const accent = locked ? 'text-trophy-ink/60' : RARITY_ACCENT[effectiveRarity]

  return (
    <div
      className={cn(
        'relative isolate flex flex-col overflow-hidden',
        locked ? RARITY_GROUND.common : RARITY_GROUND[effectiveRarity],
        'gap-2 p-4',
        compact && COMPACT_MIN_H,
        flush
          ? 'h-full w-full'
          : [
              'rounded-2xl border',
              locked ? 'border-dashed border-trophy-ink/12' : RARITY_EDGE[effectiveRarity],
              'transition-[transform,box-shadow] motion-safe:hover:-translate-y-0.5 hover:shadow-lg',
            ],
        className
      )}
    >
      {/* Rarity bloom behind the artwork — same two-disc build as the
          showcase. The underlay layer keeps it beneath the content without
          needing a positioned wrapper for every child; the tile's `isolate`
          is what stops it sinking past the card itself. */}
      {!locked && (
        <>
          <span
            aria-hidden="true"
            className={cn(
              // Night only — see the showcase bloom note.
              'pointer-events-none absolute left-1/2 top-2 z-underlay hidden h-48 w-48 -translate-x-1/2 rounded-full blur-3xl dark:block',
              RARITY_BLOOM[effectiveRarity]
            )}
          />
          <span
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute left-1/2 top-8 z-underlay hidden h-28 w-28 -translate-x-1/2 rounded-full blur-2xl dark:block',
              RARITY_CORE[effectiveRarity]
            )}
          />
        </>
      )}

      {/* Status / rarity row. Rarity sits top-right on every card so the eye
          learns one place to look; locked state takes the left. */}
      <div className="flex w-full items-center justify-between gap-2">
        {locked ? <LockChip started={started} /> : <span />}
        <RarityChip rarity={effectiveRarity} locked={locked} />
      </div>

      {/* Artwork left, name right — the row is what makes the bigger art fit
          without the card growing taller. Below sm the cell is too narrow for
          both, so it stacks and centers like the old layout. */}
      <div className="flex w-full flex-1 flex-col items-center gap-2 text-center sm:flex-row sm:gap-3 sm:text-left">
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
          // Scale is visual only: the layout box stays 144px so the row —
          // and with it the tile — keeps its height while the art fills more
          // of the card. The renders carry transparent margin, so the small
          // overflow past the box never clips anything visible.
          className="shrink-0 scale-[1.6]"
        />

        <div className="min-w-0 space-y-1">
          <h3
            className={cn(
              'font-display text-lg font-bold italic leading-tight tracking-tight',
              locked ? 'text-trophy-ink/65' : 'text-trophy-ink'
            )}
          >
            {head}
            {tail && (
              <>
                {' '}
                <span className={accent}>{tail}</span>
              </>
            )}
          </h3>
          {!compact && (
            <p className={cn('text-sm leading-snug', locked ? 'text-trophy-ink/60' : 'text-trophy-ink/65')}>
              {description}
            </p>
          )}
        </div>
      </div>

      {/* Tier is stated once, in the stat strip below. It used to appear as a
          chip here as well, which said the same word twice on every tiered
          card — and roughly half of them are tiered. */}

      {/* Pinned to the bottom so figures line up across a row of cards whose
          names wrap to different heights. */}
      <StatStrip
        className="mt-auto w-full pt-3"
        points={points}
        earnedAt={earnedAt}
        tier={tier}
        progress={progress}
        locked={locked}
        accent={accent}
        progressBarLabel={t`${name} progress`}
        pct={pct}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ parts */

function RarityChip({ rarity, locked }: { rarity: BadgeRarity; locked?: boolean }) {
  const { i18n } = useLingui()
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider',
        locked ? 'border-trophy-ink/15 bg-trophy-ink/5 text-trophy-ink/60' : RARITY_CHIP[rarity]
      )}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      {resolveCopy(i18n, RARITY_LABEL[rarity])}
    </span>
  )
}

function LockChip({ started }: { started: boolean }) {
  const { t } = useLingui()
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-trophy-ink/15 bg-trophy-ink/5 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-trophy-ink/70">
      <Lock size={12} aria-hidden="true" />
      {started ? t`In progress` : t`Locked`}
    </span>
  )
}

/**
 * Points / earned / tier, divided by hairlines. Shared by both layouts so a
 * trophy reports the same figures in the grid and in the popup.
 *
 * A locked card always says where it stands — it used to render nothing at all
 * when the server had no progress row, which left most of the grid as cards
 * with no visible path to unlocking.
 */
function StatStrip({
  className,
  points,
  earnedAt,
  tier,
  progress,
  locked,
  accent,
  hideProgress,
  progressBarLabel,
  pct,
}: {
  className?: string
  points?: number
  earnedAt?: string | null
  tier?: BadgeTier | null
  progress?: { current: number; target: number } | null
  locked?: boolean
  accent: string
  /** The showcase shows progress as its own bar above, so it suppresses this column. */
  hideProgress?: boolean
  progressBarLabel?: string
  pct?: number
}) {
  // Local, not a prop — see the note in DetailGrid.
  const { t, i18n } = useLingui()

  return (
    <div className={className}>
      <div className="flex items-stretch divide-x divide-trophy-ink/10 border-t border-trophy-ink/10 pt-3">
        {typeof points === 'number' && (
          <Stat value={`+${points}`} label={t`Points`} accent={locked ? undefined : accent} />
        )}

        {!locked && earnedAt && (
          <Stat value={new Date(earnedAt).toLocaleDateString()} label={t`Earned`} />
        )}

        {locked && !hideProgress && progress && progress.target > 0 && (
          <Stat value={`${progress.current}/${progress.target}`} label={t`Progress`} />
        )}

        {tier && (
          <Stat
            value={resolveCopy(i18n, TIER_LABEL[tier])}
            label={t`Tier`}
            accent={locked ? undefined : TIER_ACCENT[tier]}
            dot={locked ? undefined : TIER_ACCENT[tier]}
          />
        )}
      </div>

      {locked && !hideProgress && (
        <div className="mt-3">
          {progress && progress.target > 0 ? (
            <div
              className="h-1 w-full overflow-hidden rounded-full bg-trophy-ink/10"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={progress.target}
              aria-valuenow={progress.current}
              aria-label={progressBarLabel}
            >
              <div
                className="h-full rounded-full bg-trophy-ink/55 transition-[width]"
                style={{ width: `${pct ?? 0}%` }}
              />
            </div>
          ) : (
            <p className="text-xs uppercase tracking-wider text-trophy-ink/60">
              <Trans>Awarded automatically</Trans>
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function Stat({
  value,
  label,
  accent,
  dot,
}: {
  value: string
  label: string
  accent?: string
  dot?: string
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5 px-3 first:pl-0">
      <span
        className={cn(
          'font-display flex items-center gap-1.5 truncate text-base font-bold tabular-nums',
          accent || 'text-trophy-ink/90'
        )}
      >
        {dot && (
          <span aria-hidden="true" className={cn('h-1.5 w-1.5 shrink-0 rounded-full bg-current', dot)} />
        )}
        <span className="truncate">{value}</span>
      </span>
      <span className="truncate text-[10px] font-medium uppercase tracking-wider text-trophy-ink/60">
        {label}
      </span>
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
        'flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-trophy-ink/12 bg-gradient-to-b from-trophy-ground to-trophy-ground-deep p-4 text-center',
        COMPACT_MIN_H,
        className
      )}
    >
      <span className="font-display text-4xl text-trophy-ink/25" aria-hidden="true">
        ?
      </span>
      <p className="text-sm font-medium text-trophy-ink/70"><Trans>Secret achievement</Trans></p>
      <p className="text-xs text-trophy-ink/50"><Trans>Keep exploring to find it</Trans></p>
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
