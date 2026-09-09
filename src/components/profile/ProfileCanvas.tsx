import type { ReactNode, RefObject } from 'react'
import { Link } from 'react-router'
import {
  Calendar,
  Building2,
  ExternalLink,
  FileText,
  FolderKanban,
  Handshake,
  Lock,
} from 'lucide-react'
import { Button } from '../ui/Button'
import { CountryFlag } from '../ui/CountryFlag'
import { COLLABORATION_LABELS, COLLAB_EXCLUSIVE_VALUE, PHASE_LABELS, ROLE_LABELS } from '../../lib/constants'
import { resolveCopy } from '../../i18n/copy'
import { formatDate } from '../../lib/utils'
import { entityPath } from '../../lib/slug'
import { Trans, useLingui } from '@lingui/react/macro'
import { parseBanner } from '../../lib/banner'
import { parseAvatarStyle } from '../../lib/avatar-backdrop'
import { PortraitHero, type HeroBack } from './PortraitHero'
import { HeroStanding } from './HeroStanding'
import { IdentityPlate, MetaDot } from './IdentityPlate'
import { ProfileSection } from './ProfileSection'
import { ProfileFacts } from './ProfileFacts'
import { ProfileTags } from './ProfileTags'
import { ProfileLinkRow } from './ProfileLinkRow'
import { StandingMeter } from './StandingMeter'
import { TrophyShelf } from './TrophyShelf'
import { EditPencil, EditableBlock } from './EditPencil'
import { cn } from '../../lib/utils'
import type {
  BadgeDefinition,
  EmployerPortfolioItem,
  Event,
  ProfileStats,
  ProfileView,
  Project,
  PublicEmployer,
  TrophyAssetMap,
  UserBadge,
} from '../../types'

/** How many skills the hero's meta line names before the rail takes over. */
const HERO_SKILLS = 3

/**
 * The first sentence of a bio, for the line under the name. Cut at a word
 * once it passes 140 characters; the rail's About card has the whole thing.
 */
export function ledeFrom(bio: string | null | undefined): string | null {
  const text = bio?.replace(/\s+/g, ' ').trim()
  if (!text) return null
  const first = text.split(/(?<=[.!?])\s/)[0]
  if (first.length <= 140) return first
  const cut = first.slice(0, 140)
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 80))}…`
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

/** Block → open its editor. A block absent from the map renders with no pencil. */
export type ProfileEditMap = Partial<Record<ProfileBlock, () => void>>

/** What an empty block says when the person reading it is the one who can fill it. */
function EmptyPrompt({ children }: { children: ReactNode }) {
  return <p className="text-caption italic text-ktip-sand-500">{children}</p>
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
  /** Unearned badges the shelf teases under the earned ones. */
  lockedBadges?: BadgeDefinition[]
  trophyAssets: TrophyAssetMap
  stats?: ProfileStats | null
  connectionCount?: number | null
  employer?: PublicEmployer | null
  employerPortfolio?: EmployerPortfolioItem[]
  /** Where "View CV" goes. Omit and the button is not rendered. */
  cvHref?: string | null

  // ------------------------------------------------------------------ chrome
  heroActions?: ReactNode
  railActions?: ReactNode
  /** Trailing control on the Achievements heading — "Manage", on your own page. */
  achievementsActions?: ReactNode
  /** Copy for the "this profile is private" panel. */
  privateMessage?: string
  back: HeroBack

  // ----------------------------------------------------------------- editing
  /**
   * Omit it entirely and this renders exactly what the member page has always
   * rendered — every affordance is gated on a handler being present, in one
   * place, so there is no second code path to keep honest.
   */
  edit?: ProfileEditMap
  /**
   * `omit`   — a block with nothing in it is not rendered. What a visitor gets.
   * `prompt` — it renders an invitation instead, so a member with no skills yet
   *            has something to click. Defaults to `prompt` when `edit` is
   *            present: without it the feature is unusable for exactly the new
   *            members it most needs to serve.
   */
  emptyBlocks?: 'omit' | 'prompt'

  // ------------------------------------------------------------------ layout
  /**
   * `page` — a full-bleed opener under the navbar; the rail splits at `lg`.
   * `pane` — a band inside a dashboard column: no nav-height padding, no
   *          portrait flight, and the split waits for `xl` because the pane is
   *          only about 712px wide at `lg`.
   */
  layout?: 'page' | 'pane'
  /** Passed through to PortraitHero. `null` on a surface that already has a hero. */
  heroSpy?: string | null
  dockRef?: RefObject<HTMLDivElement | null>
  railRef?: RefObject<HTMLDivElement | null>
}

/**
 * A member, rendered.
 *
 * Extracted from PublicProfilePage so the member's own editor can show the
 * same thing rather than a second interpretation of it. The chrome was never
 * the part worth sharing — the derived copy is: which sentence of the bio
 * becomes the lede, that the lead role goes in the eyebrow and the chips
 * therefore start from the second, that the meta line is joined plus three
 * skills, and the nine rules about which sections a member has earned the
 * right to have on the page at all. A preview that re-derives those is a
 * preview that quietly stops being true.
 *
 * Data fetching stays with the caller. This takes one `ProfileView` — the
 * shape the privacy gate is written in — plus the earned content, and decides
 * only how it reads.
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
  heroActions,
  railActions,
  achievementsActions,
  privateMessage,
  back,
  edit,
  emptyBlocks,
  layout = 'page',
  heroSpy,
  dockRef,
  railRef,
}: ProfileCanvasProps) {
  const { t, i18n } = useLingui()
  const pane = layout === 'pane'
  const prompting = (emptyBlocks ?? (edit ? 'prompt' : 'omit')) === 'prompt'

  /**
   * A section's pencil, in the `actions` slot its heading already has — no
   * overlay, no absolute positioning, and the control lands in the tab order
   * directly after the title it belongs to. Spread onto ProfileSection.
   */
  const editable = (block: ProfileBlock, label: string) => {
    const onEdit = edit?.[block]
    if (!onEdit) return {}
    return { actions: <EditPencil label={label} onClick={onEdit} />, className: 'group' }
  }

  const displayName = profile.display_name || t`Member`
  const joinedDate = formatDate(profile.created_at)
  const showcase = stats?.showcase || []

  const pageBanner = parseBanner(profile.banner)
  const avatarStyle = parseAvatarStyle(profile.avatar_style)

  // Pinned trophies lead the shelf; the rest follow in the order they were
  // earned. A member who has chosen a showcase has said which ones matter.
  const pinnedIds = new Set(showcase.map((pin) => pin.badge.id))
  const shelfBadges = badges
    ? [
        ...badges.filter((b) => pinnedIds.has(b.badge_id)),
        ...badges.filter((b) => !pinnedIds.has(b.badge_id)),
      ]
    : []

  // The rail plate's lines: the full record — country, employer, joined —
  // one per line. The plate's words column is about 170px wide beside the
  // diamond, and a dotted run wraps there with the dots orphaned at line
  // starts.
  const railMeta = (
    <>
      {profile.country && (
        <span className="inline-flex basis-full items-center gap-2">
          <CountryFlag country={profile.country} />
          {profile.country}
        </span>
      )}
      {(profile.organization || profile.industry) && (
        <span className="basis-full">
          {[profile.organization, profile.industry].filter(Boolean).join(' · ')}
        </span>
      )}
      <span className="basis-full">
        <Trans>Joined {joinedDate}</Trans>
      </span>
    </>
  )
  // The band says each thing once: the country is in the eyebrow, the
  // employer in the lede, so the meta line is joined + what they work in.
  const heroSkills = profile.skills?.slice(0, HERO_SKILLS) ?? []
  const heroMeta = (
    <>
      <span>
        <Trans>Joined {joinedDate}</Trans>
      </span>
      {heroSkills.length > 0 && (
        <>
          <MetaDot />
          <span>{heroSkills.join(' · ')}</span>
        </>
      )}
    </>
  )
  // The line above the name. NOT the word "Member": everyone here is one, so
  // it is a label that costs a line and distinguishes nobody. What does
  // distinguish someone is where they are and what they are here as, so this
  // is their country and their leading role — and the role chips below then
  // start from the second one rather than repeating it.
  const leadRole = profile.roles?.[0]
  const leadRoleLabel = leadRole ? resolveCopy(i18n, ROLE_LABELS[leadRole] || leadRole) : null
  // A size up in the band: the eyebrow is set in caps with wide tracking, and
  // a 16px flag beside 15px capitals reads as a smudge.
  const countryWithFlag = profile.country ? (
    <span className="inline-flex items-center gap-2.5">
      <CountryFlag country={profile.country} className="h-4 w-[21px] rounded-[3px]" />
      {profile.country}
    </span>
  ) : null
  const heroEyebrow =
    countryWithFlag && leadRoleLabel ? (
      <>
        {countryWithFlag}
        <span aria-hidden className="text-white/40">·</span>
        <span>{leadRoleLabel}</span>
      </>
    ) : (
      countryWithFlag || leadRoleLabel || null
    )
  const bioLede = ledeFrom(profile.bio)
  const heroLede =
    profile.organization || profile.industry || bioLede ? (
      <>
        {profile.organization && (
          <em className="not-italic font-semibold text-white">{profile.organization}</em>
        )}
        {profile.organization && profile.industry && <span className="text-white/60">, </span>}
        {profile.industry && <span>{profile.industry}</span>}
        {(profile.organization || profile.industry) && bioLede && <span className="text-white/60">. </span>}
        {bioLede}
      </>
    ) : null

  const heroStanding =
    canView !== false && stats && stats.badge_count > 0 ? (
      <HeroStanding
        rank={stats.rank}
        points={stats.points}
        badgeCount={stats.badge_count}
        connectionCount={connectionCount}
        align={avatarStyle.kind !== 'photo' && avatarStyle.side === 'center' ? 'end' : 'start'}
      />
    ) : null

  return (
    <>
      <PortraitHero
        name={displayName}
        verified={profile.is_verified}
        // The lead role is already in the eyebrow; the chips carry the rest.
        roles={profile.roles?.slice(1)}
        eyebrow={heroEyebrow}
        lede={heroLede}
        meta={heroMeta}
        actions={heroActions}
        // Not in a pane. On the member page the portrait's flight fades these
        // words out as the rail's plate and meter wake up, so the two never
        // read at once — but a pane has no flight, so the band and the column
        // below it would both stand there showing the same level, the same
        // points and the same three figures.
        standing={pane ? undefined : heroStanding}
        avatarUrl={profile.avatar_url}
        style={avatarStyle}
        banner={pageBanner}
        imageSeed={profile.id}
        back={back}
        dockRef={dockRef}
        railRef={railRef}
        spy={heroSpy}
        flight={!pane}
        compact={pane}
        overlay={
          // One pencil for the whole band, because the band is one picture: the
          // portrait is composited against the backdrop and the banner sits
          // behind both, so choosing them apart is how you end up with a face
          // that disappears into its own cover. Two pencils in one corner also
          // asked the reader to tell a 16px pencil from a 16px pencil.
          edit?.photo && (
            <div className="absolute right-4 top-4">
              <EditPencil label={t`photo and banner`} onClick={edit.photo} tone="onDark" />
            </div>
          )
        }
      />

      <div className={cn(pane ? 'w-full' : 'mx-auto max-w-page-mid px-4 pb-gutter-lg')}>
        <div
          className={cn(
            'mt-8 grid items-start gap-gutter',
            // The pane is roughly 712px wide at lg once the dashboard rail and
            // the gutters are taken out, which is not enough for a 340px rail
            // plus content. It waits for xl.
            pane ? 'xl:grid-cols-[21.25rem_1fr]' : 'lg:grid-cols-[21.25rem_1fr]'
          )}
        >
          {/* ---------- The static "who" ----------
              Sticks while the column beside it scrolls, so the person stays on
              screen next to whatever you are reading about them. The identity
              plate leads it; the hero's portrait lands in its diamond. */}
          <div
            ref={railRef}
            className={cn('grid gap-card-gap', pane ? 'xl:sticky xl:top-24' : 'lg:sticky lg:top-24')}
          >
            {/* An overlay rather than the plate's own `actions` slot: the rail
                variant styles that slot full-width for the Connect and Message
                buttons, and a pencil stretched across the card is not a pencil. */}
            <EditableBlock label={t`name and roles`} onEdit={edit?.identity}>
              <IdentityPlate
                id="profile"
                spy="Profile"
                variant="rail"
                name={displayName}
                avatarUrl={profile.avatar_url}
                avatarRef={dockRef}
                verified={profile.is_verified}
                roles={profile.roles}
                meta={railMeta}
                actions={railActions}
              />
            </EditableBlock>

            {/* ---------- Private ----------
                Everything below this point is driven by queries that were never
                issued when can_view is false, so they collapse on their own. */}
            {canView !== false && (<>
            {/* The member-page tutorial anchors a step on `[data-spy="About"]`,
                so this marker travels with the bio rather than being dropped
                when there is none — the section itself still only renders when
                there is something to read. */}
            {(profile.bio || prompting) && (
              <ProfileSection
                id="about"
                spy="About"
                tone="rail"
                title={t`About`}
                {...editable('about', t`your bio`)}
              >
                {profile.bio ? (
                  <p className="whitespace-pre-wrap text-caption leading-relaxed text-ktip-sand-700">
                    {profile.bio}
                  </p>
                ) : (
                  <EmptyPrompt>
                    <Trans>Say what you do and what you are working on.</Trans>
                  </EmptyPrompt>
                )}
              </ProfileSection>
            )}

            <ProfileSection tone="rail" title={t`Details`} {...editable('details', t`your details`)}>
              <ProfileFacts
                columns={1}
                items={[
                  !!profile.country && {
                    label: t`Location`,
                    value: (
                      <span className="inline-flex items-center gap-2">
                        <CountryFlag country={profile.country} />
                        {profile.country}
                      </span>
                    ),
                  },
                  // Only when there is no verified employer below. Otherwise the
                  // rail says "Organisation" twice a few hundred pixels apart —
                  // once as free text the member typed, once as the registered
                  // entity with its logo and its work — and the second one is
                  // strictly the better answer to the same question.
                  !employer && !!profile.organization && {
                    label: t`Organisation`,
                    value: profile.organization,
                  },
                  !!profile.industry && { label: t`Industry`, value: profile.industry },
                  // Fetched by get_profile_view() since 083 and rendered by
                  // nothing until now. A field a member can edit and never see
                  // is a field they cannot tell is wrong.
                  !!profile.website && {
                    label: t`Website`,
                    value: (
                      <a
                        href={profile.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-ktip-ocean-600 hover:underline"
                      >
                        {profile.website.replace(/^https?:\/\//, '')}
                        <ExternalLink size={12} aria-hidden="true" />
                      </a>
                    ),
                  },
                  { label: t`Joined`, value: joinedDate },
                ]}
              />
            </ProfileSection>

            {profile.skills?.length || prompting ? (
              <ProfileSection tone="rail" title={t`Skills`} {...editable('skills', t`your skills`)}>
                {profile.skills?.length ? (
                  <ProfileTags values={profile.skills} tone="ocean" />
                ) : (
                  <EmptyPrompt>
                    <Trans>Skills are how the directory finds you.</Trans>
                  </EmptyPrompt>
                )}
              </ProfileSection>
            ) : null}

            {profile.interests?.length || prompting ? (
              <ProfileSection
                tone="rail"
                title={t`Interests`}
                {...editable('interests', t`your interests`)}
              >
                {profile.interests?.length ? (
                  <ProfileTags values={profile.interests} tone="tropical" />
                ) : (
                  <EmptyPrompt>
                    <Trans>Topics you care about, so the right things reach you.</Trans>
                  </EmptyPrompt>
                )}
              </ProfileSection>
            ) : null}

            {/* Also fetched and never drawn until now. They are on the CV, so a
                member who set them had no way to check what they said. */}
            {profile.languages?.length || prompting ? (
              <ProfileSection
                id="languages"
                spy="Languages"
                tone="rail"
                title={t`Languages`}
                {...editable('languages', t`your languages`)}
              >
                {profile.languages?.length ? (
                  <ProfileTags values={profile.languages} tone="muted" />
                ) : (
                  <EmptyPrompt>
                    <Trans>The languages you speak. These appear on your CV.</Trans>
                  </EmptyPrompt>
                )}
              </ProfileSection>
            ) : null}

            {profile.open_to?.length || prompting ? (
              <ProfileSection
                id="collaborate"
                tone="rail"
                title={t`Open to`}
                {...editable('openTo', t`what you are open to`)}
              >
                {profile.open_to?.length ? (
                  <ProfileTags
                    values={profile.open_to}
                    tone="sun"
                    toneFor={(value) => (value === COLLAB_EXCLUSIVE_VALUE ? 'muted' : 'sun')}
                    labelFor={(value) => COLLABORATION_LABELS[value] || value}
                    icon={<Handshake size={12} aria-hidden="true" />}
                  />
                ) : (
                  <EmptyPrompt>
                    <Trans>What kinds of collaboration you would say yes to.</Trans>
                  </EmptyPrompt>
                )}
              </ProfileSection>
            ) : null}

            {/* ---------- Organisation ----------
                profiles.organization has always been free text that links
                nowhere. This is the registered entity behind it, with the work
                it publishes — the business equivalent of the CV an individual
                member gets. */}
            {employer && (
              <ProfileSection
                id="organisation"
                spy="Organisation"
                tone="rail"
                title={t`Organisation`}
              >
                <div className="flex items-start gap-3">
                  {employer.logo_url ? (
                    <img
                      src={employer.logo_url}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded-control object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-ktip-ocean-100">
                      <Building2 size={20} className="text-ktip-ocean-600" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/org/${employer.slug}`}
                      className="flex items-center gap-1.5 font-display text-body font-bold text-ktip-sand-900 hover:text-ktip-ocean-600"
                    >
                      {employer.trading_name || employer.legal_name}
                      <ExternalLink size={13} aria-hidden="true" />
                    </Link>
                    {employer.industry && (
                      <p className="text-micro text-ktip-sand-500">{employer.industry}</p>
                    )}
                    {employer.description && (
                      <p className="mt-1.5 line-clamp-3 text-micro leading-relaxed text-ktip-sand-700">
                        {employer.description}
                      </p>
                    )}
                  </div>
                </div>

                {employerPortfolio && employerPortfolio.length > 0 && (
                  <div className="mt-4 border-t border-ktip-sand-200 pt-3">
                    <p className="mb-1.5 text-micro font-semibold uppercase tracking-[0.12em] text-ktip-sand-500">
                      <Trans>Portfolio</Trans>
                    </p>
                    <ul className="space-y-1">
                      {employerPortfolio.slice(0, 4).map((item) => (
                        <li key={item.id} className="text-micro text-ktip-sand-700">
                          <span className="font-semibold">{item.title}</span>
                          {item.summary && (
                            <span className="text-ktip-sand-500"> — {item.summary}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                    {employerPortfolio.length > 4 && (
                      <Link
                        to={`/org/${employer.slug}`}
                        className="mt-2 inline-block text-micro font-semibold text-ktip-ocean-600 hover:underline"
                      >
                        <Trans>All {employerPortfolio.length} pieces of work</Trans>
                      </Link>
                    )}
                  </div>
                )}
              </ProfileSection>
            )}

            {/* Only rendered when the CV is actually published — see publicResume. */}
            {cvHref && (
              <Link to={cvHref}>
                <Button variant="outline" fullWidth icon={<FileText size={16} />}>
                  <Trans>View CV</Trans>
                </Button>
              </Link>
            )}
            </>)}
          </div>

          {/* ---------- The earned "what" ---------- */}
          <div className="grid gap-card-gap">
            {/* This panel exists so a private page says why rather than looking
                broken. No Connect button here: the plate beside it has one. */}
            {canView === false && (
              <section className="neu-surface rounded-surface bg-ktip-cream p-card-pad-lg text-center shadow-neu">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-ktip-sand-100 shadow-neu-sm-inset">
                  <Lock size={22} className="text-ktip-sand-500" aria-hidden="true" />
                </div>
                <h2 className="mt-4 font-display text-title-sm font-bold text-ktip-sand-900">
                  <Trans>This profile is private</Trans>
                </h2>
                <p className="mx-auto mt-2 max-w-md text-caption text-ktip-sand-600">
                  {privateMessage}
                </p>
                {/* No Connect button here. The plate directly above already carries
                    one, and two of the same control a few hundred pixels apart reads
                    as a rendering bug rather than as emphasis. */}
              </section>
            )}

            {canView !== false && stats && stats.badge_count > 0 && (
              <div id="standing" data-spy="Standing" data-spy-skip className="scroll-mt-24">
                <StandingMeter
                  rank={stats.rank}
                  points={stats.points}
                  badgeCount={stats.badge_count}
                  connectionCount={connectionCount}
                  streakDays={stats.streak_days}
                />
              </div>
            )}

            {shelfBadges.length > 0 && (
              <ProfileSection
                id="achievements"
                spy="Achievements"
                title={t`Achievements`}
                count={stats?.badge_count ?? shelfBadges.length}
                actions={achievementsActions}
              >
                <TrophyShelf
                  badges={shelfBadges}
                  assetMap={trophyAssets}
                  locked={lockedBadges}
                  moreHref="/achievements"
                />
              </ProfileSection>
            )}

            {projects?.length ? (
              <ProfileSection
                id="projects"
                spy="Projects"
                title={t`Projects`}
                count={projects.length}
              >
                <div className="grid">
                  {projects.map((project) => (
                    <ProfileLinkRow
                      key={project.id}
                      to={entityPath('project', project)}
                      label={project.title}
                      image={project.image_url}
                      icon={<FolderKanban size={16} aria-hidden="true" />}
                      meta={resolveCopy(i18n, PHASE_LABELS[project.phase])}
                    />
                  ))}
                </div>
              </ProfileSection>
            ) : null}

            {events?.length ? (
              <ProfileSection id="events" spy="Events" title={t`Events`} count={events.length}>
                <div className="grid">
                  {events.map((event) => (
                    <ProfileLinkRow
                      key={event.id}
                      to={entityPath('event', event)}
                      label={event.title}
                      image={event.image_url}
                      icon={<Calendar size={16} aria-hidden="true" />}
                      meta={event.start_date ? formatDate(event.start_date) : undefined}
                    />
                  ))}
                </div>
              </ProfileSection>
            ) : null}
          </div>
        </div>
      </div>
    </>
  )
}
