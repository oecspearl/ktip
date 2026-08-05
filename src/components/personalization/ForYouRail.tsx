import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Sparkles, X, CalendarDays, Clock, ChevronRight, ChevronUp } from 'lucide-react'
import { Segmented } from '../ui/Segmented'
import { useAuth } from '../../contexts/AuthContext'
import { usePersonalizationActive } from '../../hooks/usePersonalization'
import {
  fallbackFeedImage,
  useFeedImages,
  usePersonalizedFeed,
  type FeedItem,
} from '../../hooks/usePersonalizedFeed'
import { hasSignals, personalizedHref, type RankableEntity } from '../../lib/personalization'
import { cn, formatDate } from '../../lib/utils'
import { Trans, useLingui } from '@lingui/react/macro'
import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'

const ENTITY_LABELS: Record<FeedItem['entity'], MessageDescriptor> = {
  project: msg`Project`,
  resource: msg`Resource`,
  event: msg`Event`,
  grant: msg`Grant`,
}

/** Section headings and toggle labels for the expanded view, in display order. */
const ENTITY_SECTIONS: { entity: RankableEntity; label: MessageDescriptor }[] = [
  { entity: 'project', label: msg`Projects` },
  { entity: 'resource', label: msg`Resources` },
  { entity: 'event', label: msg`Events` },
  { entity: 'grant', label: msg`Grants` },
]

const PROMPT_DISMISSED_KEY = 'ktip_personalization_prompt_dismissed'

/** Filter value: an entity slug, or everything. */
type Category = RankableEntity | 'all'

/** How many of each type the expanded view shows. */
const PER_SECTION = 5

/** Facets per card. The landscape card gives them one short line, no wrap. */
const MAX_FACETS = 2

/**
 * Seconds one card takes to cross, tuned to the home page's actual pace.
 *
 * The shared 35s keyframe is a duration, not a speed: the home band moves one
 * copy of four short stat tiles in 35s, so borrowing the number outright with
 * forty wide cards would run several times faster over the same clock. Pacing
 * per card instead keeps the two surfaces reading alike however long the list
 * turns out to be.
 */
const SECONDS_PER_CARD = 8
const MIN_DURATION = 25

/** Landscape: roughly 3.5:1, wide enough for a two-line title beside the photo. */
const MARQUEE_CARD = 'w-[22rem] h-24 shrink-0'

/**
 * The expanded view. Fixed 6rem rows so a section reads as a stack of bars the
 * same shape as the marquee's, and two columns until there is real width —
 * three landscape cards across is a lot of short lines.
 */
const SECTION_GRID = 'grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3 auto-rows-[6rem]'

interface ForYouRailProps {
  title?: string
  limit?: number
}

function FeedCard({
  item,
  image,
  className,
  decorative,
}: {
  item: FeedItem
  /** The entity's own artwork; falls back to the seeded pick the cards use */
  image?: string
  className?: string
  /** The marquee's second copy: present for the loop, absent to assistive tech */
  decorative?: boolean
}) {
  const { i18n, t } = useLingui()
  const closesDate = item.deadline_at ? formatDate(item.deadline_at) : ''
  const when = item.deadline_at
    ? { icon: <Clock size={12} />, text: t`Closes ${closesDate}` }
    : item.occurs_at
      ? { icon: <CalendarDays size={12} />, text: formatDate(item.occurs_at) }
      : null

  return (
    <Link
      to={personalizedHref(item.entity, item.id)}
      // aria-hidden alone would still leave the duplicate in the tab order,
      // which is how you end up tabbing the same rail twice
      aria-hidden={decorative}
      tabIndex={decorative ? -1 : undefined}
      className={cn(
        'group flex flex-row overflow-hidden bg-ktip-cream border border-ktip-sand-200 rounded-2xl hover:border-ktip-ocean-300 transition-colors',
        className
      )}
    >
      {/* Photo down the leading edge rather than across the top: that is what
          keeps the card landscape. A full-width band forces the content under
          it and the card is portrait again however short the band is. */}
      <div className="relative w-24 shrink-0 self-stretch overflow-hidden bg-ktip-sand-100 sm:w-28">
        <img
          src={image || fallbackFeedImage(item)}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 px-3 py-2.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-ktip-ocean-600">
          {i18n._(ENTITY_LABELS[item.entity])}
        </span>

        <h3 className="font-display text-sm font-bold leading-snug text-ktip-sand-900 line-clamp-2 group-hover:text-ktip-ocean-700">
          {item.title}
        </h3>

        {/* No summary. At this height it is one clipped line that says less
            than the category does. */}
        <div className="flex items-center gap-x-2 overflow-hidden text-[11px] text-ktip-sand-500">
          {when && (
            <span className="flex shrink-0 items-center gap-1">
              {when.icon}
              {when.text}
            </span>
          )}
          <FacetList item={item} divided={!!when} />
        </div>
      </div>
    </Link>
  )
}

/**
 * What the thing is about — its category and its own tags, divided by rules.
 *
 * This replaced the match-reason chip. "Popular right now +3" explains why the
 * ranker surfaced the card, which is the ranker's business; on a card the
 * reader is scanning, the useful line is what the thing actually is.
 *
 * `item.reasons` is still on the payload and MatchReasonChip still exists, so
 * the why can come back as a hover or a detail row — it just no longer costs
 * the card its last line.
 */
function FacetList({ item, divided }: { item: FeedItem; divided?: boolean }) {
  // Category first, then tags — most general to most specific, deduped because
  // a record often repeats its category as a tag
  const seen = new Set<string>()
  const facets: string[] = []
  for (const raw of [item.category, item.type_key, ...item.tags]) {
    const value = raw?.trim()
    if (!value) continue
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    facets.push(value)
    if (facets.length === MAX_FACETS) break
  }

  if (!facets.length) return null

  return (
    <>
      {facets.map((facet, i) => (
        <span key={facet} className="flex items-center gap-2">
          {(divided || i > 0) && (
            <span aria-hidden="true" className="h-3 w-px shrink-0 bg-ktip-sand-300" />
          )}
          <span className="truncate capitalize">{facet.replace(/[_-]/g, ' ')}</span>
        </span>
      ))}
    </>
  )
}

/**
 * The cross-entity recommendation rail for Dashboard and Discover.
 *
 * Owns all three of its states so the host pages stay thin:
 *   * signed out, or personalization off  -> renders nothing at all
 *   * on, but no signals to work with     -> a dismissible prompt, because a
 *                                            recency list labelled "For You"
 *                                            is worse than an honest ask
 *   * otherwise                           -> the ranked rail
 *
 * The rail itself is a marquee, matching the platform-stats band on the home
 * page: one `w-max` track holding two copies of the list, sliding right to
 * left, paused on hover so the cards can be clicked. Under reduced motion the
 * animation is switched off in index.css and the track becomes a scrollable
 * row, so nothing goes unreachable.
 *
 * "View all" expands in place instead of navigating, because there is no route
 * that means "everything the ranker likes for me" — the ranking only exists
 * here. The expansion pushes the sections below it down, which is the point:
 * it is a drawer on this page, not a different page.
 */
export function ForYouRail({ title = 'For You', limit = 40 }: ForYouRailProps) {
  const { i18n, t } = useLingui()
  const auth = useAuth()
  const { active, personalization } = usePersonalizationActive()
  const { items, loading } = usePersonalizedFeed({ limit })
  const images = useFeedImages(items)
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(PROMPT_DISMISSED_KEY) === '1'
  )
  const [category, setCategory] = useState<Category>('all')
  const [expanded, setExpanded] = useState(false)

  // One query covers every category, so switching costs nothing and the
  // marquee restarts instantly rather than flashing a loading state
  const shown = useMemo(
    () => (category === 'all' ? items : items.filter((i) => i.entity === category)),
    [items, category]
  )

  // Only offer a filter for types the feed actually returned — a Grants tab
  // that always lands on an empty rail is a broken promise
  const present = useMemo(() => new Set(items.map((i) => i.entity)), [items])

  const sections = useMemo(
    () =>
      ENTITY_SECTIONS.filter((s) => category === 'all' || s.entity === category)
        .map((s) => ({
          ...s,
          // The feed arrives ranked, so head of the list is top of the list
          items: items.filter((i) => i.entity === s.entity).slice(0, PER_SECTION),
        }))
        .filter((s) => s.items.length > 0),
    [items, category]
  )

  if (!auth.user || !active) return null

  if (!hasSignals(personalization, auth.profile)) {
    if (dismissed) return null
    return (
      <div className="mb-8 flex items-start gap-4 bg-ktip-ocean-50 border border-ktip-ocean-200 rounded-2xl p-5">
        <div className="w-10 h-10 bg-ktip-ocean-100 rounded-xl flex items-center justify-center shrink-0">
          <Sparkles size={20} className="text-ktip-ocean-600" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-display font-bold text-ktip-sand-900">
            <Trans>Tell us what you are interested in</Trans>
          </h3>
          <p className="text-sm text-ktip-sand-600 mt-0.5">
            <Trans>Pick a few topics and we will put the projects, resources, events and grants that suit you at the top of every list. Nothing gets hidden.</Trans>
          </p>
          <Link
            to="/settings?tab=personalization"
            className="inline-flex items-center gap-1 mt-2 text-sm font-medium text-ktip-ocean-600 hover:text-ktip-ocean-700"
          >
            <Trans>Choose my topics</Trans>
            <ChevronRight size={14} />
          </Link>
        </div>
        <button
          type="button"
          aria-label={t`Dismiss`}
          onClick={() => {
            localStorage.setItem(PROMPT_DISMISSED_KEY, '1')
            setDismissed(true)
          }}
          className="text-ktip-sand-400 hover:text-ktip-sand-600 shrink-0"
        >
          <X size={18} />
        </button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles size={18} className="text-ktip-ocean-600" />
          <h2 className="font-display font-bold text-xl text-ktip-sand-900">{title}</h2>
        </div>
        {/* Landscape bars, not the portrait SkeletonCard — a tall placeholder
            that resolves into a short card is a visible jump */}
        <div className={SECTION_GRID}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="animate-pulse-soft rounded-2xl border border-ktip-sand-200 bg-ktip-sand-50"
            />
          ))}
        </div>
      </div>
    )
  }

  // No recommendations is a normal outcome on a small or freshly seeded
  // corpus; an empty rail with a heading would just look broken.
  if (!items.length) return null

  const options: { value: Category; label: string }[] = [
    { value: 'all', label: t`All` },
    ...ENTITY_SECTIONS.filter((s) => present.has(s.entity)).map((s) => ({
      value: s.entity as Category,
      label: i18n._(s.label),
    })),
  ]

  return (
    <div className="mb-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-ktip-ocean-600" />
          <h2 className="font-display font-bold text-xl text-ktip-sand-900">{title}</h2>
        </div>

        <div className="flex items-center gap-3">
          {options.length > 2 && (
            <Segmented
              value={category}
              options={options}
              onChange={setCategory}
              label={t`Filter recommendations by type`}
              radius="sm"
            />
          )}
          <button
            type="button"
            onClick={() => setExpanded((open) => !open)}
            aria-expanded={expanded}
            className="inline-flex items-center gap-1 text-sm font-medium text-ktip-ocean-600 hover:text-ktip-ocean-700"
          >
            {expanded ? <Trans>Collapse</Trans> : <Trans>View all</Trans>}
            {expanded ? <ChevronUp size={14} /> : <ChevronRight size={14} />}
          </button>
          <Link
            to="/settings?tab=personalization"
            className="text-sm font-medium text-ktip-ocean-600 hover:text-ktip-ocean-700"
          >
            <Trans>Tune this</Trans>
          </Link>
        </div>
      </div>

      {expanded ? (
        <div className="space-y-6">
          {sections.map((section) => (
            <section key={section.entity}>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ktip-sand-500">
                {i18n._(section.label)}
              </h3>
              <div className={SECTION_GRID}>
                {section.items.map((item) => (
                  <FeedCard
                    key={`${item.entity}:${item.id}`}
                    item={item}
                    image={images[`${item.entity}:${item.id}`]}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : shown.length ? (
        <div className="relative max-w-full overflow-hidden motion-reduce:overflow-x-auto [mask-image:linear-gradient(to_right,transparent,black_4%,black_96%,transparent)]">
          {/* Keyed on the category so switching restarts the loop from the
              left edge rather than resuming mid-track with new content.

              Two copies of the row as sibling groups rather than one doubled
              list: translateX(-50%) only loops seamlessly if the halves are
              exactly equal, and grouping keeps the trailing gap identical. */}
          <div
            key={category}
            style={{
              animationDuration: `${Math.max(MIN_DURATION, shown.length * SECONDS_PER_CARD)}s`,
            }}
            className="flex w-max animate-marquee-left hover:[animation-play-state:paused]"
          >
            {[0, 1].map((copy) => (
              <div key={copy} className="flex items-stretch gap-4 pr-4 py-1">
                {shown.map((item) => (
                  <FeedCard
                    key={`${item.entity}:${item.id}`}
                    item={item}
                    image={images[`${item.entity}:${item.id}`]}
                    decorative={copy === 1}
                    className={MARQUEE_CARD}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
