import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ArrowLeft, ArrowUpRight, Building2, Link2, Lock, Palette, Plus } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { CountryFlag } from '../ui/CountryFlag'
import { TrophyImage } from '../achievements/TrophyImage'
import {
  COLLABORATION_LABELS,
  COLLAB_EXCLUSIVE_VALUE,
  EVENT_TYPE_LABELS,
  PHASE_LABELS,
  ROLE_LABELS,
} from '../../lib/constants'
import { TIER_LABEL } from '../../lib/achievement-style'
import { resolveCopy } from '../../i18n/copy'
import { cn, formatDate } from '../../lib/utils'
import { entityPath } from '../../lib/slug'
import { parseBanner } from '../../lib/banner'
import { parseAvatarStyle } from '../../lib/avatar-backdrop'
import { lookAttributes, parseProfileLook, resolveAlign } from '../../lib/profile-look'
import { parseSocialLinks, socialEntries } from '../../lib/social-links'
import { hiddenSections } from '../../lib/profile-visibility'
import { EditPencil } from './EditPencil'
import { SectionPrivacy } from './SectionPrivacy'
import { ProfileHero, type HeroStanding, type HeroStat } from './editorial/ProfileHero'
import { ProfileTabs, type ProfileTab } from './editorial/ProfileTabs'
import { SkillsStrip } from './editorial/SkillsStrip'
import { ShareProfileButton } from './editorial/ShareProfileButton'
import './editorial/editorial.css'
import type {
  BadgeDefinition,
  EmployerPortfolioItem,
  Event,
  ProfileSectionKey,
  ProfileStats,
  ProfileView,
  Project,
  PublicEmployer,
  TrophyAssetMap,
  UserBadge,
} from '../../types'

/**
 * The first sentence of a bio, for the line in the hero. Cut at a word once it
 * passes 140 characters; the About card has the whole thing.
 */
export function ledeFrom(bio: string | null | undefined): string | null {
  const text = bio?.replace(/\s+/g, ' ').trim()
  if (!text) return null
  const first = text.split(/(?<=[.!?])\s/)[0]
  if (first.length <= 140) return first
  const cut = first.slice(0, 140)
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 80))}…`
}

/** Where the page's back link goes. */
export interface HeroBack {
  label: string
  href: string
}

/**
 * Every block a pencil can attach to. English and stable, because it is also
 * the value of `?edit=` — a link someone sends must open the same editor
 * whatever language either of them reads the app in.
 */
export type ProfileBlock =
  | 'banner'
  | 'photo'
  | 'identity'
  | 'about'
  | 'details'
  | 'skills'
  | 'interests'
  | 'languages'
  | 'openTo'
  | 'look'

/** Block → open its editor. A block absent from the map renders with no pencil. */
export type ProfileEditMap = Partial<Record<ProfileBlock, () => void>>

/**
 * Who sees each section, and the way to change it (162). The member's own
 * editor passes this; nothing else does, so a visitor never sees a switch.
 */
export interface ProfilePrivacyControls {
  isPrivate: (section: ProfileSectionKey) => boolean
  onChange: (section: ProfileSectionKey, makePrivate: boolean) => void
  disabled?: boolean
}

/** One role from the published CV — the Overview's experience list. */
export interface ExperienceRow {
  period: string
  title: string
  org: string
  location?: string
}

type TabKey = 'overview' | 'projects' | 'events' | 'achievements'
const TAB_KEYS = new Set<string>(['overview', 'projects', 'events', 'achievements'])

const TIER_RANK: Record<string, number> = { diamond: 4, gold: 3, silver: 2, bronze: 1 }
const TIER_COLOUR: Record<string, string> = {
  bronze: 'var(--color-metal-bronze, #9a6b3f)',
  silver: 'var(--color-metal-silver, #7d838a)',
  gold: 'var(--color-metal-gold, #a8842c)',
  diamond: 'var(--color-metal-diamond, #4f7d99)',
}

export interface ProfileCanvasProps {
  /** One row of get_profile_view() — fetched, or built from a local draft. */
  view: ProfileView
  /**
   * Tri-state, exactly as useProfileView reports it. `undefined` means "not
   * known yet" and is deliberately distinct from `false`, so the private
   * panel never flashes while the view is in flight.
   */
  canView: boolean | undefined

  // ---------------------------------------------------------- earned content
  projects?: Project[]
  events?: Event[]
  badges?: UserBadge[]
  /** Unearned badges teased under the earned ones. */
  lockedBadges?: BadgeDefinition[]
  trophyAssets: TrophyAssetMap
  stats?: ProfileStats | null
  connectionCount?: number | null
  employer?: PublicEmployer | null
  employerPortfolio?: EmployerPortfolioItem[]
  /** Where "View CV" goes. Omit and nothing links to the CV. */
  cvHref?: string | null
  /** Roles from the published CV, for the Overview's experience list. */
  experience?: ExperienceRow[]

  // ------------------------------------------------------------------ chrome
  heroActions?: ReactNode
  /** The footer's buttons. Omit and there is no footer — your own page has none. */
  ctaActions?: ReactNode
  /** The phone dock's buttons, page layout only. */
  dockActions?: ReactNode
  /** Where Report goes, in the footer. */
  reportHref?: string | null
  /** The page's own address, for Share. Omit to leave Share out. */
  shareUrl?: string | null
  /** Trailing control on the Achievements tab — "Manage", on your own page. */
  achievementsActions?: ReactNode
  /** Copy for the "this profile is private" panel. */
  privateMessage?: string
  /**
   * One line for a viewer who can see some sections and not others, on a
   * profile whose master switch is open. Omit it and nothing is said.
   */
  partialMessage?: string
  back: HeroBack

  // ----------------------------------------------------------------- editing
  /**
   * Omit it entirely and this renders exactly what a visitor gets — every
   * affordance is gated on a handler being present, in one place.
   */
  edit?: ProfileEditMap
  /**
   * `omit`   — a block with nothing in it is not rendered. What a visitor gets.
   * `prompt` — it renders an invitation instead, so a member with no skills yet
   *            has something to click. Defaults to `prompt` when `edit` is set.
   */
  emptyBlocks?: 'omit' | 'prompt'
  privacy?: ProfilePrivacyControls

  // ------------------------------------------------------------------ layout
  /**
   * `page` — the member page under the navbar, with the footer and the dock.
   * `pane` — inside the dashboard column: no nav offset, no footer, no dock.
   */
  layout?: 'page' | 'pane'
  /** `null` on a surface that already has a page-top marker. */
  heroSpy?: string | null
}

/**
 * A member, rendered — the editorial member page.
 *
 * Shared by the member page and the member's own editor so the preview is the
 * page rather than a second interpretation of it. Data fetching stays with the
 * caller: this takes one `ProfileView` — the shape the privacy gate is written
 * in — plus the earned content, and decides only how it reads.
 *
 * The page is a hero (the person) over four tabs (what they do, what they
 * make, where they show up, what they have earned). Each block answers to its
 * own section (162): a hidden one is left out whole, and the tabs that would
 * be empty for this viewer are not offered.
 */
export function ProfileCanvas({
  view: profile,
  canView,
  projects,
  events,
  badges,
  lockedBadges,
  trophyAssets,
  stats,
  connectionCount,
  employer,
  employerPortfolio,
  cvHref,
  experience,
  heroActions,
  ctaActions,
  dockActions,
  reportHref,
  shareUrl,
  achievementsActions,
  privateMessage,
  partialMessage,
  back,
  edit,
  emptyBlocks,
  privacy,
  layout = 'page',
  heroSpy = 'Top',
}: ProfileCanvasProps) {
  const { t, i18n } = useLingui()
  const pane = layout === 'pane'
  const prompting = (emptyBlocks ?? (edit ? 'prompt' : 'omit')) === 'prompt'
  const hidden = hiddenSections(profile)
  const shows = (section: ProfileSectionKey) => !hidden.has(section)

  const displayName = profile.display_name || t`Member`
  const firstName = displayName.split(' ')[0]
  const joined = new Date(profile.created_at)
  const joinedYear = String(joined.getFullYear())
  const joinedMonth = formatDate(profile.created_at, 'MMMM yyyy')
  const look = parseProfileLook(profile.profile_look)
  const avatarStyle = parseAvatarStyle(profile.avatar_style)
  const banner = parseBanner(profile.banner)
  const align = resolveAlign(look, avatarStyle)
  const lookAttrs = lookAttributes(look)

  /**
   * Where this member works, as the page should say it. The Chamber-verified
   * employer wins over the free text typed at signup wherever both exist: it
   * is the one the platform can vouch for.
   */
  const orgName = employer?.trading_name || employer?.legal_name || profile.organization
  const roleLabels = (profile.roles ?? []).map((role) => resolveCopy(i18n, ROLE_LABELS[role] || role))
  const openTo = (profile.open_to ?? []).filter((v) => v !== COLLAB_EXCLUSIVE_VALUE)
  const notSeeking = (profile.open_to ?? []).includes(COLLAB_EXCLUSIVE_VALUE)
  const tagline =
    profile.tagline?.trim() || [orgName, profile.industry].filter(Boolean).join(' · ') || null
  const links = [
    ...(profile.website
      ? [{ key: 'website', label: profile.website.replace(/^https?:\/\//, '').replace(/\/$/, ''), url: profile.website }]
      : []),
    ...socialEntries(parseSocialLinks(profile.social_links)),
  ]

  // ------------------------------------------------------------- standing
  const showcase = stats?.showcase || []
  const pinnedIds = new Set(showcase.map((pin) => pin.badge.id))
  const shelfBadges = badges
    ? [...badges.filter((b) => pinnedIds.has(b.badge_id)), ...badges.filter((b) => !pinnedIds.has(b.badge_id))]
    : []
  const showStanding = shows('standing') && !!stats?.rank && stats.badge_count > 0
  const standing: HeroStanding | null =
    showStanding && stats?.rank
      ? {
          level: stats.rank.level,
          name: stats.rank.name,
          earned: stats.rank.earned,
          nextRequired: stats.rank.next_required,
          nextName: stats.rank.next_name,
          streak: stats.streak_days,
        }
      : null
  const heroStats: HeroStat[] = []
  if (showStanding && stats?.points != null) heroStats.push({ key: 'points', label: t`Points`, value: stats.points })
  if (shows('achievements') && stats && stats.badge_count > 0)
    heroStats.push({ key: 'achievements', label: t`Achievements`, value: stats.badge_count })
  if (connectionCount != null) heroStats.push({ key: 'connections', label: t`Connections`, value: connectionCount })

  // ------------------------------------------------------------------ tabs
  const [searchParams, setSearchParams] = useSearchParams()

  // The phone dock repeats the hero's buttons, so it stays down while those
  // are on screen and slides up once they have scrolled away.
  const rootRef = useRef<HTMLDivElement>(null)
  const [heroButtonsShown, setHeroButtonsShown] = useState(true)
  useEffect(() => {
    const target = rootRef.current?.querySelector('.pf-hero .pf-actions')
    if (!target) return
    const observer = new IntersectionObserver(([entry]) => setHeroButtonsShown(entry.isIntersecting))
    observer.observe(target)
    return () => observer.disconnect()
  }, [])
  const hasAchievements = (shows('achievements') && shelfBadges.length > 0) || showStanding
  const tabs: ProfileTab<TabKey>[] = [{ key: 'overview', label: t`Overview` }]
  if (shows('projects') && (projects?.length || prompting)) tabs.push({ key: 'projects', label: t`Projects` })
  if (shows('events') && (events?.length || prompting)) tabs.push({ key: 'events', label: t`Events` })
  if (hasAchievements || (prompting && shows('achievements')))
    tabs.push({ key: 'achievements', label: t`Achievements` })
  const requested = searchParams.get('tab')
  const tab: TabKey =
    requested && TAB_KEYS.has(requested) && tabs.some((x) => x.key === requested) ? (requested as TabKey) : 'overview'
  const setTab = (next: TabKey) => {
    const params = new URLSearchParams(searchParams)
    if (next === 'overview') params.delete('tab')
    else params.set('tab', next)
    setSearchParams(params, { replace: true, preventScrollReset: true })
  }

  // ------------------------------------------------------- owner controls
  const privacySwitch = (section: ProfileSectionKey, label: string) =>
    privacy ? (
      <SectionPrivacy
        label={label}
        isPrivate={privacy.isPrivate(section)}
        onChange={(next) => privacy.onChange(section, next)}
        disabled={privacy.disabled}
      />
    ) : null

  /** A card's audience switch and pencil, side by side in its heading. */
  const tools = (section: ProfileSectionKey | null, label: string, block?: ProfileBlock) => {
    const onEdit = block ? edit?.[block] : undefined
    const audience = section ? privacySwitch(section, label) : null
    if (!onEdit && !audience) return null
    return (
      <span className="pf-tools">
        {audience}
        {onEdit && <EditPencil label={label} onClick={onEdit} />}
      </span>
    )
  }

  const cardHead = (title: ReactNode, toolset: ReactNode) => (
    <div className="pf-cardhead">
      <p className="pf-eyebrow">{title}</p>
      {toolset}
    </div>
  )

  const photoTools =
    edit?.photo || edit?.look ? (
      <>
        {edit.photo && (
          <button type="button" className="pf-btn pf-btn--soft pf-btn--sm" onClick={edit.photo}>
            <Plus size={16} aria-hidden="true" />
            <Trans>Photo and backdrop</Trans>
          </button>
        )}
        {edit.look && (
          <button type="button" className="pf-btn pf-btn--soft pf-btn--sm" onClick={edit.look}>
            <Palette size={16} aria-hidden="true" />
            <Trans>Look</Trans>
          </button>
        )}
      </>
    ) : null

  const actions =
    heroActions || shareUrl ? (
      <>
        {heroActions}
        {shareUrl && <ShareProfileButton url={shareUrl} name={displayName} />}
      </>
    ) : null

  // --------------------------------------------------------------- overview
  let rise = 0
  const r = () => ({ className: 'pf-rise', style: { '--d': rise++ } as CSSProperties })
  const riseClass = (extra: string) => {
    const props = r()
    // `group`: an owner's pencil fades in on hover of the card it edits.
    return { className: cn(extra, 'group', props.className), style: props.style }
  }

  const aboutCard =
    shows('about') && (profile.bio || prompting) ? (
      <article id="about" data-spy="About" {...riseClass('pf-card pf-about')}>
        {cardHead(<Trans>About</Trans>, tools('about', t`your bio`, 'about'))}
        {profile.bio ? (
          <p className="pf-about-text">{profile.bio}</p>
        ) : (
          <p className="pf-empty">
            <Trans>Say what you do and what you are working on. It is the first thing members read here.</Trans>
          </p>
        )}
      </article>
    ) : null

  const openToCard =
    shows('open_to') && (openTo.length || notSeeking || prompting) ? (
      <article id="collaborate" {...riseClass('pf-card pf-card--dark pf-opento pf-lift')}>
        {cardHead(<Trans>Open to</Trans>, tools('open_to', t`what you are open to`, 'openTo'))}
        {openTo.length ? (
          <ol>
            {openTo.map((value, i) => (
              <li key={value}>
                <span className="pf-num">{String(i + 1).padStart(2, '0')}</span>
                {COLLABORATION_LABELS[value] || value}
              </li>
            ))}
          </ol>
        ) : notSeeking ? (
          <p className="pf-empty">
            <Trans>Not looking for collaborators right now.</Trans>
          </p>
        ) : (
          <p className="pf-empty">
            <Trans>What kinds of collaboration you would say yes to.</Trans>
          </p>
        )}
      </article>
    ) : null

  const orgCard =
    employer && shows('organisation') ? (
      <article id="organisation" data-spy="Organisation" {...riseClass('pf-card pf-focus pf-lift')}>
        {cardHead(<Trans>Organisation</Trans>, tools('organisation', t`your organisation`))}
        <h3>
          {employer.logo_url ? (
            <img src={employer.logo_url} alt="" className="pf-logo" loading="lazy" />
          ) : (
            <Building2 size={22} strokeWidth={1.7} aria-hidden="true" />
          )}
          <Link to={`/org/${employer.slug}`}>{employer.trading_name || employer.legal_name}</Link>
        </h3>
        {employer.industry && <p>{employer.industry}</p>}
        {employerPortfolio && employerPortfolio.length > 0 && (
          <p>
            <Trans>{employerPortfolio.length} pieces of published work</Trans>
          </p>
        )}
        <ArrowUpRight size={20} strokeWidth={1.7} className="pf-go pf-arrow" aria-hidden="true" />
      </article>
    ) : shows('details') && (profile.organization || prompting) ? (
      <article {...riseClass('pf-card pf-focus')}>
        {cardHead(<Trans>Organisation</Trans>, tools('details', t`your details`, 'details'))}
        {profile.organization ? (
          <>
            <h3>{profile.organization}</h3>
            {profile.industry && <p>{profile.industry}</p>}
          </>
        ) : (
          <p className="pf-empty">
            <Trans>Where you work or study.</Trans>
          </p>
        )}
      </article>
    ) : null

  const basedCard = profile.country ? (
    <article {...riseClass('pf-card pf-focus')}>
      {cardHead(<Trans>Based in</Trans>, tools(null, t`your details`, 'details'))}
      <h3>
        <CountryFlag country={profile.country} />
        {profile.country}
      </h3>
      <p>
        <Trans>Member since {joinedMonth}</Trans>
      </p>
    </article>
  ) : null

  const linksCard =
    shows('details') && (links.length || prompting) ? (
      <article {...riseClass('pf-card pf-focus')}>
        {cardHead(<Trans>Online</Trans>, tools('details', t`your links`, 'details'))}
        {links.length ? (
          <>
            <h3>
              <Trans>Find {firstName}</Trans>
            </h3>
            <div className="pf-links">
              {links.map((link) => (
                <a key={link.key} className="pf-chipl" href={link.url} target="_blank" rel="noopener noreferrer">
                  <Link2 size={14} aria-hidden="true" />
                  {link.label}
                </a>
              ))}
            </div>
          </>
        ) : (
          <p className="pf-empty">
            <Trans>Add your website, LinkedIn or X so members can find you elsewhere.</Trans>
          </p>
        )}
      </article>
    ) : null

  const chipsCard = (
    section: ProfileSectionKey,
    block: ProfileBlock,
    title: ReactNode,
    label: string,
    values: string[] | null | undefined,
    empty: ReactNode,
    spy?: string
  ) =>
    shows(section) && (values?.length || prompting) ? (
      <article id={spy?.toLowerCase()} data-spy={spy} {...riseClass('pf-card pf-focus')}>
        {cardHead(title, tools(section, label, block))}
        {values?.length ? (
          <div className="pf-chips">
            {values.map((value) => (
              <span key={value} className="pf-chipl">
                {value}
              </span>
            ))}
          </div>
        ) : (
          <p className="pf-empty">{empty}</p>
        )}
      </article>
    ) : null

  const experienceList =
    shows('cv') && cvHref ? (
      <section {...riseClass('pf-exp')}>
        <div className="pf-exphead">
          <h2>
            <Trans>Experience</Trans>
          </h2>
          <span className="pf-sub">
            <Trans>From {firstName}'s CV</Trans>
          </span>
          {privacySwitch('cv', t`your CV`)}
          <Link to={cvHref}>
            <Trans>View CV</Trans>
            <ArrowUpRight size={16} className="pf-arrow" aria-hidden="true" />
          </Link>
        </div>
        {experience?.map((row, i) => (
          <div key={`${row.org}-${i}`} className="pf-row">
            <span className="yrs">{row.period}</span>
            <span>
              <span className="role">{row.title}</span>
              {row.org && <> · {row.org}</>}
            </span>
            <span className="note">{row.location}</span>
          </div>
        ))}
      </section>
    ) : null

  const overview = (
    <>
      <div className="pf-ov">
        {aboutCard}
        <div className="pf-ov-scroll">
          {openToCard}
          {orgCard}
          {basedCard}
          {linksCard}
        </div>
        {chipsCard('skills', 'skills', <Trans>Skills</Trans>, t`your skills`, profile.skills, <Trans>Skills are how the directory finds you.</Trans>)}
        {chipsCard('interests', 'interests', <Trans>Interests</Trans>, t`your interests`, profile.interests, <Trans>Topics you care about, so the right things reach you.</Trans>, 'Interests')}
        {chipsCard('languages', 'languages', <Trans>Languages</Trans>, t`your languages`, profile.languages, <Trans>The languages you speak. These appear on your CV.</Trans>, 'Languages')}
      </div>
      {experienceList}
    </>
  )

  // --------------------------------------------------------------- projects
  const sectionHeader = (title: ReactNode, section: ProfileSectionKey, label: string, extra?: ReactNode) => (
    <div {...riseClass('pf-sechead')}>
      <h2>{title}</h2>
      <span className="pf-tools">
        {extra}
        {privacySwitch(section, label)}
      </span>
    </div>
  )

  rise = 0
  const projectsPanel = (
    <>
      {sectionHeader(<Trans>Projects</Trans>, 'projects', t`your projects`)}
      {projects?.length ? (
        <div id="projects" data-spy="Projects" className="pf-grid">
          {projects.map((project, i) => (
            <Link key={project.id} to={entityPath('project', project)} {...riseClass('pf-card pf-proj pf-lift')}>
              <div className="pf-cover">
                {project.image_url ? (
                  <img src={project.image_url} alt="" loading="lazy" decoding="async" />
                ) : (
                  <svg className="band" viewBox="0 0 300 150" preserveAspectRatio="none" aria-hidden="true">
                    <path d={`M-10 ${110 - (i % 3) * 14} H${110 + (i % 3) * 30} L${160 + (i % 3) * 30} ${50 + (i % 3) * 6} H310`} />
                  </svg>
                )}
              </div>
              <div className="pf-projbody">
                <span className="pf-tag">{resolveCopy(i18n, PHASE_LABELS[project.phase] || project.phase)}</span>
                <h3>{project.title}</h3>
                <div className="pf-projmeta">
                  <span>{project.summary ? project.summary.slice(0, 80) : ''}</span>
                  <ArrowUpRight size={18} strokeWidth={1.7} className="pf-arrow" aria-hidden="true" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div {...riseClass('pf-card')}>
          <p className="pf-empty">
            {edit ? <Trans>Your public projects show here.</Trans> : <Trans>{firstName} has no public projects yet.</Trans>}
          </p>
        </div>
      )}
    </>
  )

  // ----------------------------------------------------------------- events
  const now = Date.now()
  const upcoming = (events ?? [])
    .filter((e) => new Date(e.end_date || e.start_date).getTime() >= now)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
  const past = (events ?? [])
    .filter((e) => new Date(e.end_date || e.start_date).getTime() < now)
    .sort((a, b) => b.start_date.localeCompare(a.start_date))
  const where = (e: Event) => (e.is_virtual ? t`Online` : e.location || '')
  rise = 0
  const eventsPanel = (
    <>
      {sectionHeader(<Trans>Upcoming</Trans>, 'events', t`your events`)}
      <section id="events" data-spy="Events" {...riseClass('pf-card')}>
        {upcoming.length ? (
          upcoming.map((event) => {
            const d = new Date(event.start_date)
            return (
              <div key={event.id} className="pf-ev">
                <div className="pf-date">
                  <span className="m">{formatDate(d, 'MMM')}</span>
                  <span className="d">{formatDate(d, 'd')}</span>
                </div>
                <div>
                  <span className="pf-tag">
                    <Trans>Host</Trans>
                  </span>
                  <h3>{event.title}</h3>
                  <p className="meta">
                    {[where(event), formatDate(d, 'p'), resolveCopy(i18n, EVENT_TYPE_LABELS[event.event_type] || event.event_type)]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <div className="act">
                  <Link to={entityPath('event', event)} className="pf-btn pf-btn--soft pf-btn--sm">
                    <Trans>Details</Trans>
                    <ArrowUpRight size={16} className="pf-arrow" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            )
          })
        ) : (
          <p className="pf-empty">
            <Trans>No upcoming events.</Trans>
          </p>
        )}
      </section>
      {past.length > 0 && (
        <>
          <div {...riseClass('pf-sechead')}>
            <h2>
              <Trans>Past events</Trans>
            </h2>
          </div>
          <div className="pf-grid">
            {past.map((event) => {
              const d = new Date(event.start_date)
              return (
                <Link key={event.id} to={entityPath('event', event)} {...riseClass('pf-card pf-card--dark pf-past pf-lift')}>
                  <svg className="pf-rings" viewBox="0 0 200 200" aria-hidden="true">
                    <circle cx="200" cy="0" r="50" />
                    <circle cx="200" cy="0" r="90" />
                    <circle cx="200" cy="0" r="130" />
                    <circle cx="200" cy="0" r="170" />
                  </svg>
                  <p className="pf-eyebrow">
                    <Trans>{formatDate(d, 'yyyy')} · Hosted</Trans>
                  </p>
                  <h3>{event.title}</h3>
                  <p className="place">{[formatDate(d, 'MMM d'), where(event)].filter(Boolean).join(' · ')}</p>
                </Link>
              )
            })}
          </div>
        </>
      )}
    </>
  )

  // ----------------------------------------------------------- achievements
  const featured = shelfBadges.length
    ? (showcase[0] && shelfBadges.find((b) => b.badge_id === showcase[0].badge.id)) ||
      shelfBadges.slice().sort((a, b) => (TIER_RANK[b.badge?.tier ?? ''] ?? 0) - (TIER_RANK[a.badge?.tier ?? ''] ?? 0))[0]
    : null
  const rest = shelfBadges.filter((b) => b !== featured)
  const pct = standing?.nextRequired ? Math.min(100, (standing.earned / standing.nextRequired) * 100) : 100
  const tierLabel = (tier?: string | null) =>
    tier && TIER_LABEL[tier as keyof typeof TIER_LABEL] ? resolveCopy(i18n, TIER_LABEL[tier as keyof typeof TIER_LABEL]) : null

  rise = 0
  const achievementsPanel = (
    <>
      <div className="pf-ach-top">
        {featured?.badge && shows('achievements') && (
          <article {...riseClass('pf-card pf-card--dark pf-feat')}>
            <svg className="fband" viewBox="0 0 600 320" preserveAspectRatio="none" aria-hidden="true">
              <path d="M-20 250 H260 L360 120 H640" />
            </svg>
            <div className="top">
              <TrophyImage
                icon={featured.badge.icon}
                trophyType={featured.badge.trophy_type}
                tier={featured.badge.tier}
                imageUrl={featured.badge.image_url}
                rarity={featured.badge.rarity}
                assetMap={trophyAssets}
                name={featured.badge.name}
                size={88}
              />
              <p className="pf-eyebrow">
                {showcase.length ? <Trans>Pinned</Trans> : <Trans>Top achievement</Trans>}
              </p>
            </div>
            <div>
              <p className="yr">{formatDate(featured.awarded_at, 'yyyy')}</p>
              <h3>{featured.badge.name}</h3>
              <p className="fmeta">
                {[tierLabel(featured.badge.tier), featured.badge.description].filter(Boolean).join(' · ')}
              </p>
            </div>
          </article>
        )}
        {standing && (
          <article id="standing-card" {...riseClass('pf-card pf-stand')}>
            <div className="pf-cardhead">
              <p className="pf-eyebrow">
                <Trans>Level {standing.level}</Trans>
              </p>
              {privacySwitch('standing', t`your level and points`)}
            </div>
            <h3>{standing.name}</h3>
            <div className="pf-bar">
              <i style={{ '--w': `${pct}%` } as CSSProperties} />
            </div>
            <p className="note">
              {standing.nextRequired && standing.nextName ? (
                <Trans>
                  {standing.earned} of {standing.nextRequired} achievements toward {standing.nextName}.
                </Trans>
              ) : (
                <Trans>Highest rank reached.</Trans>
              )}{' '}
              {stats?.points != null && <Trans>{stats.points} points so far.</Trans>}{' '}
              {standing.streak ? <Trans>{standing.streak}-day streak.</Trans> : null}
            </p>
          </article>
        )}
      </div>

      {shows('achievements') && (
        <>
          {sectionHeader(<Trans>Earned</Trans>, 'achievements', t`your achievements`, achievementsActions)}
          {rest.length ? (
            <div id="achievements" data-spy="Achievements" className="pf-bgrid">
              {rest.map((ub) =>
                ub.badge ? (
                  <article key={ub.id} {...riseClass('pf-card pf-badge pf-lift')}>
                    <div className="top">
                      <TrophyImage
                        icon={ub.badge.icon}
                        trophyType={ub.badge.trophy_type}
                        tier={ub.badge.tier}
                        imageUrl={ub.badge.image_url}
                        rarity={ub.badge.rarity}
                        assetMap={trophyAssets}
                        name={ub.badge.name}
                        size={56}
                      />
                      {ub.badge.tier && (
                        <span className="pf-tier" style={{ color: TIER_COLOUR[ub.badge.tier] }}>
                          {tierLabel(ub.badge.tier)}
                        </span>
                      )}
                    </div>
                    <div className="txt">
                      <h3>{ub.badge.name}</h3>
                      <p>{ub.badge.description}</p>
                      <p className="yr">{formatDate(ub.awarded_at, 'yyyy')}</p>
                    </div>
                  </article>
                ) : null
              )}
            </div>
          ) : (
            !featured && (
              <div {...riseClass('pf-card')}>
                <p className="pf-empty">
                  <Trans>Achievements you earn on the platform show here.</Trans>
                </p>
              </div>
            )
          )}
          {lockedBadges && lockedBadges.length > 0 && (
            <>
              <div {...riseClass('pf-sechead')}>
                <h2>
                  <Trans>Locked</Trans>
                </h2>
                <span className="pf-eyebrow">
                  <Trans>Next up</Trans>
                </span>
              </div>
              <div className="pf-bgrid">
                {lockedBadges.map((badge) => (
                  <article key={badge.id} {...riseClass('pf-card pf-badge is-locked')}>
                    <div className="top">
                      <TrophyImage
                        icon={badge.icon}
                        trophyType={badge.trophy_type}
                        tier={badge.tier}
                        imageUrl={badge.image_url}
                        rarity={badge.rarity}
                        assetMap={trophyAssets}
                        name={badge.name}
                        size={56}
                        locked
                      />
                      {badge.tier && <span className="pf-tier">{tierLabel(badge.tier)}</span>}
                    </div>
                    <div className="txt">
                      <h3>{badge.name}</h3>
                      <p>{badge.description}</p>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </>
  )

  const panel =
    tab === 'projects' ? projectsPanel : tab === 'events' ? eventsPanel : tab === 'achievements' ? achievementsPanel : overview

  // ----------------------------------------------------------------- footer
  const industryWord = profile.industry?.toLocaleLowerCase(i18n.locale)
  const cta =
    !pane && ctaActions ? (
      <section className="pf-cta" aria-label={t`Get in touch`}>
        <div className="pf-cta-in">
          <h2>
            {industryWord ? (
              <Trans>
                Working on something in <em>{industryWord}</em>? Talk to {firstName}.
              </Trans>
            ) : (
              <Trans>Working on something? Talk to {firstName}.</Trans>
            )}
          </h2>
          <div className="acts">{ctaActions}</div>
          <div className="foot">
            {links.map((link) => (
              <a key={link.key} href={link.url} target="_blank" rel="noopener noreferrer">
                {link.label}
                <ArrowUpRight size={14} aria-hidden="true" />
              </a>
            ))}
            {reportHref && (
              <Link to={reportHref}>
                <Trans>Report profile</Trans>
              </Link>
            )}
            <span className="end">
              {profile.is_verified ? <Trans>OECS KTIP · Verified member</Trans> : <Trans>OECS KTIP</Trans>}
            </span>
          </div>
        </div>
      </section>
    ) : null

  const dock =
    !pane && dockActions ? (
      <div className="pf-dock" role="region" aria-label={t`Quick actions`} data-hidden={heroButtonsShown} inert={heroButtonsShown}>
        <div>
          <p className="k">{openTo.length ? <Trans>Open to</Trans> : standing ? <Trans>Level {standing.level}</Trans> : displayName}</p>
          <p className="v">
            {openTo.length
              ? openTo
                  .slice(0, 2)
                  .map((v) => COLLABORATION_LABELS[v] || v)
                  .join(' · ')
              : standing?.name ?? roleLabels[0] ?? ''}
          </p>
        </div>
        <div className="row">{dockActions}</div>
      </div>
    ) : null

  return (
    <div
      ref={rootRef}
      className="pf"
      data-layout={layout}
      data-photo={lookAttrs['data-photo']}
      data-tone={lookAttrs['data-tone']}
      style={lookAttrs.style as CSSProperties}
      // The tabs replace the scroll-spy rail; the markers stay for the tutorials.
      data-spy-off
    >
      <div className="pf-wrap">
        {!pane && (
          <Link to={back.href} className="pf-back">
            <ArrowLeft size={18} aria-hidden="true" />
            {back.label}
          </Link>
        )}

        <ProfileHero
          name={displayName}
          verified={profile.is_verified}
          roleLabels={roleLabels}
          tagline={tagline}
          bio={ledeFrom(profile.bio)}
          country={profile.country}
          orgName={orgName}
          openTo={openTo[0] ? (COLLABORATION_LABELS[openTo[0]] || openTo[0]).toLocaleLowerCase(i18n.locale) : null}
          joinedYear={joinedYear}
          joinedLabel={t`Joined ${joinedMonth}`}
          avatarUrl={profile.avatar_url}
          style={avatarStyle}
          banner={banner}
          align={align}
          stats={heroStats}
          standing={standing}
          onStanding={tabs.some((x) => x.key === 'achievements') ? () => setTab('achievements') : undefined}
          actions={actions}
          photoTools={photoTools}
          nameTools={edit?.identity ? <EditPencil label={t`name and roles`} onClick={edit.identity} /> : undefined}
          variant={pane ? 'pane' : 'page'}
          spy={heroSpy}
        />

        {shows('skills') || shows('interests') ? (
          <SkillsStrip items={[...(profile.skills ?? []), ...(profile.interests ?? [])]} />
        ) : null}

        {canView === false && (
          <section className="pf-card pf-lock" style={{ marginTop: 40 }}>
            <Lock size={22} aria-hidden="true" />
            <h2>
              <Trans>This profile is private</Trans>
            </h2>
            {privateMessage && <p>{privateMessage}</p>}
          </section>
        )}
        {canView !== false && hidden.size > 0 && partialMessage && (
          <p className="pf-notice" style={{ marginTop: 40 }}>
            <Lock size={16} aria-hidden="true" />
            {partialMessage}
          </p>
        )}

        <ProfileTabs
          tabs={tabs}
          active={tab}
          onChange={setTab}
          idBase={pane ? 'my-profile' : 'member'}
          status={
            profile.country ? (
              <>
                <CountryFlag country={profile.country} />
                {profile.country} · <Trans>Joined {joinedMonth}</Trans>
              </>
            ) : (
              <Trans>Joined {joinedMonth}</Trans>
            )
          }
        >
          {panel}
        </ProfileTabs>
      </div>
      {cta}
      {dock}
    </div>
  )
}
