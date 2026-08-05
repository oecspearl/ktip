import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { CheckCircle, Users } from 'lucide-react'
import { PageHero } from '../../components/layout/PageHero'
import { useAuth } from '../../contexts/AuthContext'
import { useConnectionCount } from '../../hooks/useConnections'
import { useTutorialAutoStart } from '../../hooks/useTutorialAutoStart'
import { TUTORIAL_IDS } from '../../data/tutorials'
import { visibleDashboardTabs } from './dashboard-tabs'
import { DASH_BAR_H, DashboardTopBar } from './DashboardTopBar'
import { ROLE_LABELS } from '../../lib/constants'
import { cn } from '../../lib/utils'
import { DiamondAvatar } from '../../components/ui/DiamondAvatar'
import { Plural, useLingui } from '@lingui/react/macro'
import { resolveCopy } from '../../i18n/copy'
import { bannerImage, bannerPosition, isGradientBanner, parseBanner } from '../../lib/banner'
import { BannerAurora } from '../../components/profile/BannerAurora'

/**
 * The single personal page. Everything that used to live on /profile/me now
 * hangs off here as a nested route, with the rail below as the tab column.
 * Tabs are role-aware — see dashboard-tabs.ts.
 */
export default function DashboardLayout() {
    const { t, i18n } = useLingui()
  const auth = useAuth()
  const { pathname } = useLocation()
  // Own count is always visible to the owner, so this is never null here
  const { count: connectionCount } = useConnectionCount(auth.user?.id)

  const profile = auth.profile
  const dashBanner = parseBanner(profile?.banner)
  const displayName = profile?.display_name || t`Your dashboard`
  const tabs = visibleDashboardTabs(profile?.roles, profile?.active_role)

  // The rail is role-aware, so the tour has to wait for the profile — otherwise
  // it spotlights a shorter rail than the member actually has.
  useTutorialAutoStart(TUTORIAL_IDS.DASHBOARD, !!profile)

  // Hand the hero off to the collapsed bar the moment the hero's bottom edge
  // reaches the top of the viewport, so the two never both occupy that row.
  // Measured rather than observed: an IntersectionObserver with a negative top
  // rootMargin stops intersecting while the sentinel is still *below* the
  // viewport top, so there is no way to tell "scrolled past" from "not yet
  // reached" out of one entry.
  const heroEndRef = useRef<HTMLDivElement>(null)
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => {
    let frame = 0
    const measure = () => {
      frame = 0
      const el = heroEndRef.current
      if (!el) return
      // 2px of slack so a fractional device-pixel rect cannot flap the state.
      setCollapsed(el.getBoundingClientRect().top <= 2)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }
    measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  // Tab changes keep the page scroll (MainLayout only resets it across
  // shells). If the hero has been scrolled past, snap the new tab to the top
  // of the content row — a shorter tab would otherwise strand the viewport
  // below its content. Layout effect for the same commit-ordering reason
  // documented in MainLayout; the resulting scroll event re-runs measure(),
  // keeping `collapsed` truthful.
  useLayoutEffect(() => {
    const el = heroEndRef.current
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView()
  }, [pathname])

  return (
    <>
      <PageHero
        eyebrow={
          <span className="flex items-center gap-2.5 md:justify-end normal-case tracking-normal text-sm text-white/85">
            <DiamondAvatar
              src={profile?.avatar_url}
              name={displayName}
              size={36}
              frameClassName="ring-2 ring-white/40"
            />
            <span className="font-semibold truncate">{displayName}</span>
            {profile?.is_verified && (
              <span className="text-white/90 shrink-0" title={t`Verified`}>
                <CheckCircle size={15} />
              </span>
            )}
          </span>
        }
        title={t`Dashboard`}
        imageSeed="dashboard"
        // The member's own banner personalises the band; the seeded community
        // photo stays for everyone who has not set one.
        image={bannerImage(dashBanner)}
        neutralWash={!!bannerImage(dashBanner)}
        imagePosition={bannerPosition(dashBanner, 'dashboard')}
        background={isGradientBanner(dashBanner) ? <BannerAurora spec={dashBanner} /> : undefined}
        breadcrumb={[{ label: t`Home`, href: '/' }, { label: t`Dashboard` }]}
      >
        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          {profile?.roles?.map((role) => (
            <span
              key={role}
              className="px-2.5 py-1 rounded-md bg-white/15 border border-white/25 text-white text-sm font-medium backdrop-blur-sm"
            >
              {resolveCopy(i18n, ROLE_LABELS[role] || role)}
            </span>
          ))}
          <Link
            to="/dashboard/connections"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/10 border border-white/20 text-sm text-white/85 hover:text-white hover:bg-white/20 transition-colors"
          >
            <Users size={15} />
            <span className="font-semibold text-white">{connectionCount ?? 0}</span>
            <Plural value={connectionCount ?? 0} one="connection" other="connections" />
          </Link>
        </div>
      </PageHero>
      <div
        ref={heroEndRef}
        aria-hidden="true"
        className="h-px"
        // Tab-change landing spot: scrollIntoView() has to clear the sticky
        // navbar plus the collapsed band that replaces the hero.
        style={{ scrollMarginTop: `calc(var(--nav-offset) + ${DASH_BAR_H})` }}
      />

      <DashboardTopBar
        displayName={displayName}
        avatarUrl={profile?.avatar_url}
        isVerified={profile?.is_verified}
        roles={profile?.roles}
        connectionCount={connectionCount ?? 0}
        shown={collapsed}
      />

      <div
        className="w-full max-w-page mx-auto px-4 pt-8 pb-12"
        // The rail sticks under whatever is above it: navbar alone at the top of
        // the page, navbar + collapsed band once the hero is gone.
        style={{ '--dash-bar-h': collapsed ? DASH_BAR_H : '0px' } as CSSProperties}
      >
        {/* No `items-start` — the rail column has to stretch the full row height
            or the sticky card below has no travel and scrolls away with the page. */}
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Tab column */}
          <div className="w-full lg:w-64 shrink-0">
            <div className="bg-ktip-cream border border-ktip-sand-200 rounded-2xl p-2 transition-[top] duration-300 lg:sticky lg:top-[calc(var(--nav-offset)+var(--dash-bar-h,0px)+1rem)] lg:max-h-[calc(100svh-var(--nav-offset)-var(--dash-bar-h,0px)-2.5rem)] lg:overflow-y-auto">
              <nav
                data-tutorial="dashboard-tabs"
                // The rail scrolls sideways on phones, and an overflow box
                // clips the soft-UI shadow into a straight line at its edge.
                // Padding gives the shadow room inside the scroll box; from lg
                // the rail is a column and needs no clipping at all.
                className="flex flex-row lg:flex-col gap-1 overflow-x-auto lg:overflow-visible p-1.5 -m-1.5"
                aria-label={t`Dashboard sections`}
              >
                {tabs.map((tab) => {
                  const to = tab.external ? tab.to : `/dashboard${tab.to ? `/${tab.to}` : ''}`
                  // NavLink's `end` only fixes the index tab; role links out of
                  // /dashboard are never "active" here. The leaderboard pane
                  // has no tab of its own — it is reached from Achievements,
                  // so that tab stays lit while the board is open.
                  const active = tab.external
                    ? false
                    : tab.to === ''
                      ? pathname === '/dashboard'
                      : pathname.startsWith(to) ||
                        (tab.to === 'achievements' && pathname.startsWith('/dashboard/leaderboard'))
                  return (
                    <NavLink
                      key={tab.to}
                      to={to}
                      className={cn(
                        // Soft-UI selection: the current tab is a well pressed
                        // into the rail (inset pair) rather than a tinted
                        // block, and an idle tab lifts a pixel on hover. Same
                        // language as Button and Switch.
                        'shrink-0 lg:shrink flex items-center gap-3 px-4 py-3 rounded-neu-sm text-left transition-all',
                        active
                          ? 'shadow-neu-sm-inset text-ktip-ocean-700'
                          : 'text-ktip-sand-600 hover:-translate-y-px hover:shadow-neu-sm hover:text-ktip-sand-900'
                      )}
                      aria-current={active ? 'page' : undefined}
                    >
                      <tab.icon size={20} className="shrink-0" />
                      <div className="min-w-0">
                        <div className="font-medium text-sm whitespace-nowrap">{i18n._(tab.label)}</div>
                        <div className="text-xs opacity-70 hidden lg:block">{i18n._(tab.description)}</div>
                      </div>
                    </NavLink>
                  )
                })}
              </nav>
            </div>
          </div>

          {/* Outer div stays mounted across tab changes so the tour anchor
              never unmounts mid-spotlight; overflow-x-clip hides the pane's
              translateX(100%) start frame without creating a scroll container
              (clip, not hidden: the sticky rail is unaffected). The keyed
              inner div is a real box (not `contents`) so it can animate, and
              carries page-reveal so h2s replay only inside the pane. */}
          <div data-tutorial="dashboard-panel" className="flex-1 min-w-0 w-full overflow-x-clip">
            <div key={pathname} className="page-reveal pane-shuffle">
              <Outlet />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
