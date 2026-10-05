import { useState, type CSSProperties, type ReactNode } from 'react'
import { ArrowUpRight, BadgeCheck, Building2, Calendar } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { ResponsiveImage } from '../../ui/ResponsiveImage'
import { CountryFlag } from '../../ui/CountryFlag'
import { BannerAurora } from '../BannerAurora'
import {
  avatarBackdropImage,
  avatarGradientSpec,
  isCutoutStyle,
  type AvatarStyle,
} from '../../../lib/avatar-backdrop'
import { bannerImage, bannerPosition, isGradientBanner, type BannerSpec } from '../../../lib/banner'
import { IMAGE_PRESETS } from '../../../lib/constants'
import { COVER_VARIANT_WIDTH } from '../../../lib/upload-variants'
import type { SubjectSide } from '../../../lib/portrait-mask'
import { cn } from '../../../lib/utils'
import { useCountUp } from './useCountUp'

/** One figure in the hero's count-up row. */
export interface HeroStat {
  key: string
  label: string
  value: number
}

/** Level, rank and progress — the glass card on the portrait. */
export interface HeroStanding {
  level: number
  name: string
  earned: number
  nextRequired: number | null
  nextName: string | null
  /** Days in a row — returned to the member alone (get_profile_stats). */
  streak?: number | null
}

export interface ProfileHeroProps {
  name: string
  verified: boolean
  /** Every role, already labelled — the eyebrow. */
  roleLabels: string[]
  /** The line under the name: the member's tagline, or organisation and industry. */
  tagline: string | null
  bio: string | null
  country: string | null
  orgName: string | null
  /** The first thing they are open to, labelled — the pulsing pill. */
  openTo: string | null
  joinedYear: string
  joinedLabel: string
  avatarUrl: string | null
  style: AvatarStyle
  banner: BannerSpec | null
  align: SubjectSide
  stats: HeroStat[]
  standing: HeroStanding | null
  /** Where the standing card's arrow goes — the Achievements tab. */
  onStanding?: () => void
  actions?: ReactNode
  /** Owner controls on the portrait: the photo and look pencils. */
  photoTools?: ReactNode
  /** Owner control beside the name: the name-and-roles pencil. */
  nameTools?: ReactNode
  /** `page`/`pane`: the full hero. `panel`: the drawer's photo card + identity card. */
  variant: 'page' | 'pane' | 'panel'
  /** Drawer only: the close button on the photo card. */
  closeButton?: ReactNode
  spy?: string | null
}

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')

/**
 * What the member stands in front of. Same precedence as the old hero, so the
 * backdrops chosen in the photo studio carry straight over: a gradient banner,
 * a banner image or preset, then the cut-out's own gradient or backdrop.
 * Nothing chosen → nothing drawn, and the plain panel with its band shows.
 */
function heroArt({
  banner,
  style,
  surface,
}: {
  banner: BannerSpec | null
  style: AvatarStyle
  surface: 'page' | 'panel'
}): { node: ReactNode; photo: boolean } | null {
  const cutout = isCutoutStyle(style) ? style : null
  const animated = !!cutout?.animated
  const img = bannerImage(banner)
  if (isGradientBanner(banner)) {
    return { node: <BannerAurora spec={banner} animated={surface === 'page' && animated} />, photo: false }
  }
  if (img) {
    return {
      node: (
        <ResponsiveImage
          src={img}
          alt=""
          sizes={surface === 'page' ? '100vw' : '40rem'}
          style={{ objectPosition: bannerPosition(banner, surface) }}
          loading="eager"
          decoding="async"
          uploadVariant={{ width: COVER_VARIANT_WIDTH, originalWidth: IMAGE_PRESETS.BANNER.maxDim }}
        />
      ),
      // An upload is a photograph and gets the soft blur; a preset is drawn art.
      photo: banner?.kind === 'image',
    }
  }
  if (cutout?.kind === 'gradient') {
    return { node: <BannerAurora spec={avatarGradientSpec(cutout)} animated={surface === 'page' && animated} />, photo: false }
  }
  if (cutout?.kind === 'backdrop') {
    const src = avatarBackdropImage(cutout)
    return src ? { node: <img src={src} alt="" decoding="async" />, photo: false } : null
  }
  return null
}

function Portrait({ name, avatarUrl, style }: { name: string; avatarUrl: string | null; style: AvatarStyle }) {
  const cutout = isCutoutStyle(style) ? style : null
  // The box takes the cut-out's own proportions once it has loaded, so the
  // side fade lands on the picture's edges rather than the column's.
  const [ratio, setRatio] = useState<number | null>(null)

  if (cutout) {
    return (
      <div className="pf-cutbox pf-a-reveal" style={ratio ? ({ '--ar': ratio } as CSSProperties) : undefined}>
        <img
          className="pf-portrait"
          src={cutout.cutout}
          alt={name}
          decoding="async"
          onLoad={(e) => {
            const el = e.currentTarget
            if (el.naturalWidth && el.naturalHeight) setRatio(el.naturalWidth / el.naturalHeight)
          }}
        />
      </div>
    )
  }
  if (avatarUrl) {
    return (
      <div className="pf-arch pf-a-reveal">
        <img className="pf-portrait" src={avatarUrl} alt={name} decoding="async" />
      </div>
    )
  }
  return (
    <div className="pf-arch pf-arch--mono pf-a-reveal" aria-hidden="true">
      <span>{initialsOf(name)}</span>
    </div>
  )
}

function Stat({ stat }: { stat: HeroStat }) {
  const { i18n } = useLingui()
  const shown = useCountUp(stat.value)
  return (
    <div className={cn('pf-stat', `pf-stat--${stat.key}`)}>
      <dt>{stat.label}</dt>
      <dd>{new Intl.NumberFormat(i18n.locale, { maximumFractionDigits: 0 }).format(Math.round(shown ?? 0))}</dd>
    </div>
  )
}

/**
 * The member page opener, after the editorial handoff: the name large in the
 * platform's display face, the cut-out standing on the panel's diagonal band
 * (or on the backdrop they chose), and their standing on a glass card.
 *
 * One markup for every width. Below 640px of container the stylesheet turns
 * it into the phone layout — photo card first, identity card overlapping it —
 * which is also exactly what the drawer is.
 */
export function ProfileHero(props: ProfileHeroProps) {
  const { t } = useLingui()
  const {
    name,
    verified,
    roleLabels,
    tagline,
    bio,
    country,
    orgName,
    openTo,
    joinedYear,
    joinedLabel,
    avatarUrl,
    style,
    banner,
    align,
    stats,
    standing,
    onStanding,
    actions,
    photoTools,
    nameTools,
    variant,
    closeButton,
    spy,
  } = props

  const words = name.trim().split(/\s+/)
  const last = words.length > 1 ? words.pop()! : null
  const first = words.join(' ')
  const art = heroArt({ banner, style, surface: variant === 'panel' ? 'panel' : 'page' })
  const pct =
    standing && standing.nextRequired ? Math.min(100, (standing.earned / standing.nextRequired) * 100) : 100

  const standingNote = standing
    ? standing.nextRequired && standing.nextName
      ? t`${standing.earned} of ${standing.nextRequired} achievements toward ${standing.nextName}`
      : t`Highest rank reached`
    : null
  const streakNote = standing?.streak ? t`${standing.streak}-day streak` : null

  const openPill = openTo ? (
    <>
      <i className="pf-dot" aria-hidden="true" />
      <Trans>Open to {openTo}</Trans>
    </>
  ) : null

  return (
    <section
      className="pf-hero"
      data-align={align}
      data-bg={art ? 'art' : 'plain'}
      id={spy ? 'page-top' : undefined}
      data-spy={spy ?? undefined}
      aria-label={name}
    >
      {art && (
        <>
          <div className={cn('pf-bg pf-bg--hero', art.photo && 'pf-bg--photo')} aria-hidden="true">
            {art.node}
          </div>
          <div className="pf-bgwash" aria-hidden="true" />
        </>
      )}
      <svg className="pf-band pf-band--hero" viewBox="0 0 1200 640" preserveAspectRatio="none" aria-hidden="true">
        <path pathLength={1} d="M-20 470 H520 L720 250 H1240" />
      </svg>

      <div className="pf-text" {...(variant === 'panel' ? {} : { id: 'profile', 'data-spy': 'Profile' })}>
        <div className="pf-text-a group">
          {(openPill || verified) && variant !== 'panel' && (
            <div className="pf-pills pf-a-pills">
              {openPill && <span className="pf-pill pf-pill--solid">{openPill}</span>}
              {verified && (
                <span className="pf-pill pf-pill--line">
                  <BadgeCheck size={16} strokeWidth={1.7} aria-hidden="true" />
                  <Trans>Verified member</Trans>
                </span>
              )}
            </div>
          )}
          <div className="pf-id pf-a-name">
            {nameTools && <div className="pf-name-tools">{nameTools}</div>}
            {roleLabels.length > 0 && <p className="pf-eyebrow">{roleLabels.join(' · ')}</p>}
            <h1 className="pf-name">
              {first}
              {last && (
                <>
                  {first ? ' ' : ''}
                  <span className="pf-last">
                    {last}
                    <svg className="pf-ellipse" viewBox="0 0 100 50" preserveAspectRatio="none" aria-hidden="true">
                      <ellipse pathLength={1} cx="50" cy="25" rx="48" ry="23" />
                    </svg>
                  </span>
                </>
              )}
              {verified && (
                <span className="pf-vbadge">
                  <BadgeCheck size={24} strokeWidth={1.8} aria-label={t`Verified`} />
                </span>
              )}
            </h1>
            {tagline && <p className="pf-tagline">{tagline}</p>}
            <p className="pf-meta">
              {country && (
                <span>
                  <CountryFlag country={country} />
                  {country}
                </span>
              )}
              {orgName && (
                <span>
                  <Building2 size={15} strokeWidth={1.7} aria-hidden="true" />
                  {orgName}
                </span>
              )}
              {variant === 'panel' && (
                <span>
                  <Calendar size={15} strokeWidth={1.7} aria-hidden="true" />
                  {joinedLabel}
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="pf-text-b">
          {bio && variant !== 'panel' && <p className="pf-bio pf-a-bio">{bio}</p>}
          {actions && <div className="pf-actions pf-a-btns">{actions}</div>}
          {stats.length > 0 && (
            <dl className="pf-stats pf-a-stats">
              {stats.map((stat) => (
                <Stat key={stat.key} stat={stat} />
              ))}
            </dl>
          )}
          {standing && (
            <div className="pf-mini">
              <span>
                <Trans>
                  Level {standing.level} · <b>{standing.name}</b>
                </Trans>
              </span>
              {standing.nextRequired && standing.nextName ? (
                <span>
                  {standing.earned} / {standing.nextRequired}
                </span>
              ) : (
                <span />
              )}
              <div className="pf-bar">
                <i style={{ '--w': `${pct}%` } as CSSProperties} />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="pf-photo">
        {art && (
          <div className={cn('pf-bg pf-bg--card', art.photo && 'pf-bg--photo')} aria-hidden="true">
            {art.node}
          </div>
        )}
        <svg className="pf-band pf-band--card" viewBox="0 0 360 420" preserveAspectRatio="none" aria-hidden="true">
          <path d="M-10 300 H120 L210 190 H380" />
        </svg>
        <Portrait name={name} avatarUrl={avatarUrl} style={style} />
        {variant !== 'panel' && (
          <span className="pf-chip pf-a-chip">
            <Calendar size={16} strokeWidth={1.7} aria-hidden="true" />
            <Trans>Member since {joinedYear}</Trans>
          </span>
        )}
        {variant === 'panel' ? (
          <span className="pf-gpill">
            <Trans>Member</Trans>
          </span>
        ) : (
          openPill && <span className="pf-gpill">{openPill}</span>
        )}
        {standing && variant !== 'panel' && (
          <div className="pf-glass pf-a-glass" id="standing" data-spy="Standing" data-spy-skip>
            <p className="pf-glass-eye">
              <Trans>Level {standing.level}</Trans>
            </p>
            <p className="pf-glass-title">{standing.name}</p>
            {onStanding && (
              <button type="button" className="pf-glass-go" onClick={onStanding} aria-label={t`See achievements`}>
                <ArrowUpRight size={20} strokeWidth={1.7} className="pf-arrow" aria-hidden="true" />
              </button>
            )}
            <div className="pf-bar">
              <i style={{ '--w': `${pct}%` } as CSSProperties} />
            </div>
            {standingNote && (
              <p className="pf-glass-note">{[standingNote, streakNote].filter(Boolean).join(' · ')}</p>
            )}
          </div>
        )}
        {photoTools && <div className="pf-photo-tools">{photoTools}</div>}
        {closeButton}
      </div>
    </section>
  )
}
