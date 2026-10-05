import { useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { Mail, UserPlus } from 'lucide-react'
import { ProfileCanvas } from '../../components/profile/ProfileCanvas'
import { AVATAR_BACKDROPS, type AvatarStyle } from '../../lib/avatar-backdrop'
import type { BannerSpec } from '../../lib/banner'
import type { ProfileLook } from '../../lib/profile-look'
import type { SubjectSide } from '../../lib/portrait-mask'
import type { Event, ProfileStats, ProfileView, Project, UserBadge, UserRole } from '../../types'

/**
 * Member page harness — dev only, never routed in a production build.
 *
 * The member page sits behind sign-in and, for an admin, behind the MFA
 * step-up, so it cannot be screenshotted headlessly. This renders the same
 * ProfileCanvas with fixture data, so every look and layout can be checked
 * (and driven by a script) without a session.
 *
 *   /design/portrait?mode=cutout&cutout=<url>&side=right&backdrop=banner-03
 *   /design/portrait?mode=photo&avatar=<url>
 *   /design/portrait?mode=none                 — no photo at all
 *   &align=auto|left|center|right   &photo=color|bw   &tone=mono|colour
 *   &accent=%23B08D57               &bg=none|backdrop|gradient|<image url>
 *   &standing=0   — a member with no badges
 *   &self=1       — your own page: edit buttons instead of connect
 *   &private=1    — a visitor who is not connected to a private member
 *   &tab=overview|projects|events|achievements
 *
 * `cutout` is any URL of a subject on transparency; the Phase 0 harness in the
 * scratchpad serves its real mattes at http://localhost:5179/cutouts/<name>.png.
 */
export default function PortraitHeroPreviewPage() {
  const [params] = useSearchParams()
  const mode = params.get('mode') ?? 'cutout'
  const side = (params.get('side') ?? 'right') as SubjectSide
  const cutout = params.get('cutout') ?? 'http://localhost:5179/cutouts/p51.png'
  const avatar = params.get('avatar') ?? 'http://localhost:5179/samples/p51.jpg'
  const backdrop = params.get('backdrop') ?? AVATAR_BACKDROPS[2].id
  const bg = params.get('bg') ?? 'none'
  const name = params.get('name') ?? 'Andre Williams'
  const hasStanding = params.get('standing') !== '0'
  const self = params.get('self') === '1'
  const isPrivate = params.get('private') === '1'
  // The owner's editor: the dashboard pane with every pencil and switch drawn.
  const pane = params.get('pane') === '1'
  const noop = () => {}

  const style = useMemo<AvatarStyle>(() => {
    if (mode !== 'cutout') return { kind: 'photo' }
    const base = { cutout, side, frame: { x: 0.18, y: 0.02, s: 0.64 } }
    return bg === 'gradient'
      ? { kind: 'gradient', colors: ['#2A5788', '#97D700', '#8FB4DC'], seed: 3, ...base }
      : { kind: 'backdrop', id: backdrop, ...base }
  }, [mode, cutout, side, backdrop, bg])

  const banner: BannerSpec | null =
    bg === 'backdrop'
      ? { kind: 'preset', id: backdrop }
      : bg === 'gradient'
        ? { kind: 'gradient', colors: ['#2A5788', '#97D700', '#8FB4DC'], seed: 3 }
        : bg.startsWith('http')
          ? { kind: 'image', url: bg }
          : null

  const look: Partial<ProfileLook> = {
    photo: params.get('photo') === 'bw' ? 'bw' : 'color',
    tone: params.get('tone') === 'colour' ? 'colour' : 'mono',
    accent: params.get('accent') ?? '#B08D57',
    align: (params.get('align') ?? 'auto') as ProfileLook['align'],
  }

  const now = Date.now()
  const day = 86_400_000
  const view: ProfileView = {
    id: 'preview',
    display_name: name,
    avatar_url: mode === 'none' ? null : avatar,
    banner,
    avatar_style: mode === 'none' ? { kind: 'photo' } : style,
    roles: ['private_sector', 'entrepreneur'] as UserRole[],
    country: 'Montserrat',
    is_verified: true,
    created_at: '2026-07-04T12:00:00Z',
    profile_visibility: isPrivate ? 'private' : 'public',
    can_view: !isPrivate,
    bio: isPrivate
      ? null
      : 'CTO at CaribbeanCloud Ltd. Advocates for open data and digital government across the OECS, and mentors first-time founders building for small island markets.',
    skills: isPrivate ? null : ['Software Development', 'Healthcare Innovation', 'Water Management', 'Open data'],
    interests: isPrivate ? null : ['Digital government', 'Climate tech'],
    open_to: isPrivate ? null : ['funding', 'technical_support', 'consultancy'],
    organization: isPrivate ? null : 'CaribbeanCloud Ltd.',
    industry: isPrivate ? null : 'Software',
    phone: null,
    website: isPrivate ? null : 'https://caribbeancloud.example',
    languages: isPrivate ? null : ['English', 'Spanish'],
    is_minor: false,
    hidden_sections: isPrivate
      ? ['about', 'details', 'skills', 'interests', 'languages', 'open_to', 'organisation', 'cv', 'standing', 'achievements', 'projects', 'events']
      : [],
    tagline: isPrivate ? null : 'Cloud and open data for small island governments.',
    social_links: isPrivate ? null : { linkedin: 'https://www.linkedin.com/in/example', x: 'https://x.com/example' },
    profile_look: look,
  }

  const badge = (id: string, nameText: string, tier: 'bronze' | 'silver' | 'gold' | null, description: string): UserBadge => ({
    id,
    user_id: 'preview',
    badge_id: id,
    awarded_at: '2026-08-20T12:00:00Z',
    badge: { id, slug: id, name: nameText, description, icon: 'trophy', color: 'gold', created_at: '', tier },
  })
  const badges: UserBadge[] = [
    badge('b1', 'Funded', 'gold', 'Had a grant application approved'),
    badge('b2', 'Host', null, 'Organized an event'),
    badge('b3', 'First Ask', 'bronze', 'Submitted your first grant application'),
    badge('b4', 'Networker', 'bronze', 'Made your first connection'),
    badge('b5', 'On a Roll', 'silver', 'Active 7 days in a row'),
  ]
  const stats: ProfileStats | null = hasStanding
    ? {
        user_id: 'preview',
        points: 275,
        badge_count: badges.length,
        rank: { level: 3, name: 'Collaborator', earned: 9, next_name: 'Innovator', next_required: 11 },
        streak_days: self ? 4 : null,
        showcase: [],
      }
    : null
  const event = (id: string, title: string, offsetDays: number, virtual: boolean): Event =>
    ({
      id,
      slug: id,
      title,
      start_date: new Date(now + offsetDays * day).toISOString(),
      end_date: null,
      is_virtual: virtual,
      location: virtual ? null : 'Plymouth',
      event_type: 'workshop',
    }) as unknown as Event
  const events: Event[] = [
    event('e1', 'Open data clinic for ministries', 12, true),
    event('e2', 'Founders breakfast', 30, false),
    event('e3', 'OECS Climathon: Virtual Build Weekend', -40, true),
  ]
  const projects: Project[] = [
    { id: 'p1', slug: 'p1', title: 'Island Data Commons', phase: 'prototype', summary: 'Shared open datasets for the region.', image_url: null },
    { id: 'p2', slug: 'p2', title: 'Clinic Queue', phase: 'launch', summary: 'Wait-time texts for public clinics.', image_url: null },
  ] as unknown as Project[]

  const heroActions = self ? (
    <>
      <a href="#" className="pf-btn pf-btn--primary">Edit profile</a>
      <a href="#" className="pf-btn pf-btn--soft">Change photo</a>
    </>
  ) : (
    <>
      <a href="#" className="pf-btn pf-btn--primary">
        <UserPlus size={17} aria-hidden="true" />
        Connect
      </a>
      <a href="#" className="pf-btn pf-btn--soft">
        <Mail size={17} aria-hidden="true" />
        Message
      </a>
    </>
  )

  return (
    <ProfileCanvas
      view={view}
      canView={!isPrivate}
      projects={isPrivate ? undefined : projects}
      events={isPrivate ? undefined : events}
      badges={isPrivate || !hasStanding ? undefined : badges}
      trophyAssets={{}}
      stats={isPrivate ? null : stats}
      connectionCount={isPrivate ? null : 12}
      cvHref={isPrivate ? null : '#'}
      experience={[
        { period: '2023 – Now', title: 'CTO', org: 'CaribbeanCloud Ltd.', location: 'Montserrat' },
        { period: '2019 – 2023', title: 'Lead engineer', org: 'Government IT Unit', location: 'Antigua' },
      ]}
      heroActions={heroActions}
      ctaActions={self ? undefined : heroActions}
      dockActions={self ? undefined : <a href="#" className="pf-btn pf-btn--light pf-btn--sm">Connect</a>}
      reportHref={self ? null : '#'}
      shareUrl="/design/portrait"
      privateMessage="Only Andre's connections can see their full profile or send them a message. Send a connection request to ask."
      back={{ label: 'Member Directory', href: '/directory' }}
      layout={pane ? 'pane' : 'page'}
      heroSpy={pane ? null : undefined}
      edit={
        pane
          ? {
              photo: noop,
              look: noop,
              identity: noop,
              about: noop,
              details: noop,
              skills: noop,
              interests: noop,
              languages: noop,
              openTo: noop,
            }
          : undefined
      }
      privacy={pane ? { isPrivate: (section) => section === 'events', onChange: noop } : undefined}
    />
  )
}
