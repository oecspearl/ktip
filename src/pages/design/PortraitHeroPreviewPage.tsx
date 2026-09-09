import { useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router'
import { FileText, MessageSquare, UserPlus } from 'lucide-react'
import { PortraitHero, heroButton } from '../../components/profile/PortraitHero'
import { HeroStanding } from '../../components/profile/HeroStanding'
import { IdentityPlate, MetaDot } from '../../components/profile/IdentityPlate'
import { ProfileSection } from '../../components/profile/ProfileSection'
import { ProfileFacts } from '../../components/profile/ProfileFacts'
import { ProfileTags } from '../../components/profile/ProfileTags'
import { StandingMeter } from '../../components/profile/StandingMeter'
import { Button } from '../../components/ui/Button'
import { CountryFlag } from '../../components/ui/CountryFlag'
import { AVATAR_BACKDROPS, type AvatarStyle } from '../../lib/avatar-backdrop'
import { cn } from '../../lib/utils'
import type { SubjectSide } from '../../lib/portrait-mask'
import type { MemberRank, UserRole } from '../../types'

/**
 * Portrait hero harness — dev only, never routed in a production build.
 *
 * The member page sits behind sign-in and, for an admin, behind the MFA
 * step-up, so it cannot be screenshotted headlessly. This page renders the
 * same PortraitHero + rail arrangement with fixture data, so the scroll
 * flight and the three treatments can be looked at (and driven by a script)
 * without a session.
 *
 *   /design/portrait?mode=cutout&side=right&backdrop=banner-03&cutout=<url>
 *   /design/portrait?mode=photo&avatar=<url>
 *   /design/portrait?mode=animated&gradient=1
 *   &standing=0   — a member with no badges (no standing block anywhere)
 *   &self=1       — your own page: edit buttons instead of connect
 *
 * `cutout` is any URL of a subject on transparency; the Phase 0 harness in the
 * scratchpad serves its real mattes at http://localhost:5179/cutouts/<name>.png.
 */
export default function PortraitHeroPreviewPage() {
  const [params] = useSearchParams()
  const mode = params.get('mode') ?? 'cutout'
  const side = (params.get('side') ?? 'right') as SubjectSide
  const cutout = params.get('cutout') ?? 'http://localhost:5179/cutouts/p51.png'
  // `avatar_url` in production is the BAKED composite — the cut-out already
  // framed to the head on its backdrop, an opaque square. Defaulting this to
  // the transparent cut-out made the rail diamond show a face floating in a
  // corner of its own empty space, which is a harness artifact and reads as a
  // layout bug in the plate.
  const avatar = params.get('avatar') ?? 'http://localhost:5179/samples/p51.jpg'
  const backdrop = params.get('backdrop') ?? AVATAR_BACKDROPS[2].id
  const gradient = params.has('gradient')
  const name = params.get('name') ?? 'Andre Williams'
  const hasStanding = params.get('standing') !== '0'
  const self = params.get('self') === '1'

  const style = useMemo<AvatarStyle>(() => {
    if (mode === 'photo') return { kind: 'photo' }
    const base = { cutout, side, frame: { x: 0.18, y: 0.02, s: 0.64 }, animated: mode === 'animated' || undefined }
    return gradient
      ? { kind: 'gradient', colors: ['#2A5788', '#97D700', '#8FB4DC'], seed: 3, ...base }
      : { kind: 'backdrop', id: backdrop, ...base }
  }, [mode, cutout, side, backdrop, gradient])

  const railRef = useRef<HTMLDivElement>(null)
  const dockRef = useRef<HTMLDivElement>(null)
  const roles: UserRole[] = ['private_sector', 'entrepreneur'] as UserRole[]
  const rank: MemberRank = { level: 3, name: 'Collaborator', earned: 9, next_name: 'Innovator', next_required: 11 }

  const railMeta = (
    <>
      <span className="inline-flex basis-full items-center gap-2">
        <CountryFlag country="Montserrat" />
        Montserrat
      </span>
      <span className="basis-full">CaribbeanCloud Ltd. · Software</span>
      <span className="basis-full">Joined July 4th, 2026</span>
    </>
  )
  const heroMeta = (
    <>
      <span>Joined July 4th, 2026</span>
      <MetaDot />
      <span>Software Development · Healthcare Innovation · Water Management</span>
    </>
  )
  const lede = (
    <>
      <em className="not-italic font-semibold text-white">CaribbeanCloud Ltd.</em>
      <span className="text-white/60">, </span>Software<span className="text-white/60">. </span>
      Advocates for open data and digital government across the OECS.
    </>
  )
  const heroActions = self ? (
    <>
      <a href="#" className={cn(heroButton.base, heroButton.light)}>Edit profile</a>
      <a href="#" className={cn(heroButton.base, heroButton.ghost)}>Change photo</a>
    </>
  ) : (
    <>
      <a href="#" className={cn(heroButton.base, heroButton.light)}>
        <UserPlus size={17} aria-hidden="true" />
        Connect
      </a>
      <a href="#" className={cn(heroButton.base, heroButton.ghost)}>
        <MessageSquare size={17} aria-hidden="true" />
        Message
      </a>
      <a href="#" className={cn(heroButton.base, heroButton.ghost)}>
        <FileText size={17} aria-hidden="true" />
        CV
      </a>
    </>
  )
  const railActions = (
    <>
      <Button>Connect</Button>
      <Button variant="outline">Message</Button>
    </>
  )

  return (
    <>
      <PortraitHero
        name={name}
        verified
        roles={roles.slice(1)}
        eyebrow={
          <>
            <span className="inline-flex items-center gap-2.5">
              <CountryFlag country="Montserrat" className="h-4 w-[21px] rounded-[3px]" />
              Montserrat
            </span>
            <span aria-hidden className="text-white/40">·</span>
            <span>Private Sector</span>
          </>
        }
        lede={lede}
        meta={heroMeta}
        actions={heroActions}
        standing={
          hasStanding ? (
            <HeroStanding rank={rank} points={275} badgeCount={9} connectionCount={1} align={side === 'center' ? 'end' : 'start'} />
          ) : null
        }
        avatarUrl={avatar}
        style={style}
        banner={null}
        imageSeed="preview"
        back={{ label: 'Member Directory', href: '/directory' }}
        dockRef={dockRef}
        railRef={railRef}
      />
      <div className="mx-auto max-w-page-mid px-4 pb-gutter-lg">
        <div className="mt-8 grid items-start gap-gutter lg:grid-cols-[21.25rem_1fr]">
          <div ref={railRef} className="grid gap-card-gap lg:sticky lg:top-24">
            <IdentityPlate
              variant="rail"
              name={name}
              avatarUrl={avatar}
              avatarRef={dockRef}
              verified
              roles={roles}
              meta={railMeta}
              actions={railActions}
            />
            <ProfileSection tone="rail" title="About">
              <p className="text-caption leading-relaxed text-ktip-sand-700">
                CTO at CaribbeanCloud Ltd. Advocates for open data and digital government in the OECS.
              </p>
            </ProfileSection>
            <ProfileSection tone="rail" title="Details">
              <ProfileFacts
                columns={1}
                items={[
                  {
                    label: 'Location',
                    // The real page passes profiles.country, which is a country
                    // NAME and therefore has a flag. A city string here would
                    // make the harness lie about that.
                    value: (
                      <span className="inline-flex items-center gap-2">
                        <CountryFlag country="Montserrat" />
                        Montserrat
                      </span>
                    ),
                  },
                  { label: 'Organization', value: 'CaribbeanCloud Ltd.' },
                  { label: 'Joined', value: 'July 4th, 2026' },
                ]}
              />
            </ProfileSection>
            <ProfileSection tone="rail" title="Skills">
              <ProfileTags values={['Software Development', 'Healthcare Innovation', 'Water Management']} tone="ocean" />
            </ProfileSection>
          </div>
          <div className="grid gap-card-gap">
            {hasStanding && (
              <StandingMeter rank={rank} points={275} badgeCount={9} connectionCount={1} />
            )}
            {['Achievements', 'Experience', 'Projects', 'Events'].map((title) => (
              <ProfileSection key={title} title={title} count={title === 'Achievements' ? '9 earned' : undefined}>
                <div className="grid gap-3 sm:grid-cols-3">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-28 rounded-surface bg-ktip-sand-100 shadow-neu-sm-inset" />
                  ))}
                </div>
              </ProfileSection>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
