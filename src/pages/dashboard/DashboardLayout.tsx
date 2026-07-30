import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { CheckCircle, Users } from 'lucide-react'
import { PageHero } from '../../components/layout/PageHero'
import { useAuth } from '../../contexts/AuthContext'
import { useConnectionCount } from '../../hooks/useConnections'
import { visibleDashboardTabs } from './dashboard-tabs'
import { ROLE_LABELS } from '../../lib/constants'
import { cn, getInitials, generateAvatarColor } from '../../lib/utils'

/**
 * The single personal page. Everything that used to live on /profile/me now
 * hangs off here as a nested route, with the rail below as the tab column.
 * Tabs are role-aware — see dashboard-tabs.ts.
 */
export default function DashboardLayout() {
  const auth = useAuth()
  const { pathname } = useLocation()
  // Own count is always visible to the owner, so this is never null here
  const { count: connectionCount } = useConnectionCount(auth.user?.id)

  const profile = auth.profile
  const displayName = profile?.display_name || 'Your dashboard'
  const tabs = visibleDashboardTabs(profile?.roles, profile?.active_role)

  return (
    <>
      <PageHero
        eyebrow={
          <span className="flex items-center gap-2.5 md:justify-end normal-case tracking-normal text-sm text-white/85">
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={displayName}
                className="w-9 h-9 rounded-full object-cover ring-2 ring-white/40 shrink-0"
              />
            ) : (
              <span
                className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white ring-2 ring-white/40 shrink-0 ${generateAvatarColor(displayName)}`}
              >
                {getInitials(displayName)}
              </span>
            )}
            <span className="font-semibold truncate">{displayName}</span>
            {profile?.is_verified && (
              <span className="text-white/90 shrink-0" title="Verified">
                <CheckCircle size={15} />
              </span>
            )}
          </span>
        }
        title="Dashboard"
        imageSeed="dashboard"
        breadcrumb={[{ label: 'Home', href: '/' }, { label: 'Dashboard' }]}
      >
        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          {profile?.roles?.map((role) => (
            <span
              key={role}
              className="px-2.5 py-1 rounded-md bg-white/15 border border-white/25 text-white text-sm font-medium backdrop-blur-sm"
            >
              {ROLE_LABELS[role] || role}
            </span>
          ))}
          <Link
            to="/dashboard/connections"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/10 border border-white/20 text-sm text-white/85 hover:text-white hover:bg-white/20 transition-colors"
          >
            <Users size={15} />
            <span className="font-semibold text-white">{connectionCount ?? 0}</span>
            {connectionCount === 1 ? 'connection' : 'connections'}
          </Link>
        </div>
      </PageHero>

      <div className="w-full max-w-[calc(50vw+48rem)] mx-auto px-4 pt-8 pb-12">
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          {/* Tab column */}
          <div className="w-full lg:w-64 shrink-0">
            <div className="bg-ktip-cream border border-gray-200 rounded-2xl p-2 lg:sticky lg:top-28">
              <nav className="flex flex-row lg:flex-col gap-1 overflow-x-auto" aria-label="Dashboard sections">
                {tabs.map((tab) => {
                  const to = tab.external ? tab.to : `/dashboard${tab.to ? `/${tab.to}` : ''}`
                  // NavLink's `end` only fixes the index tab; role links out of
                  // /dashboard are never "active" here.
                  const active = tab.external
                    ? false
                    : tab.to === ''
                      ? pathname === '/dashboard'
                      : pathname.startsWith(to)
                  return (
                    <NavLink
                      key={tab.to}
                      to={to}
                      className={cn(
                        'shrink-0 lg:shrink flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors',
                        active
                          ? 'bg-ktip-ocean-50 text-ktip-ocean-700'
                          : 'text-ktip-sand-600 hover:bg-ktip-sand-50 hover:text-ktip-sand-900'
                      )}
                      aria-current={active ? 'page' : undefined}
                    >
                      <tab.icon size={20} className="shrink-0" />
                      <div className="min-w-0">
                        <div className="font-medium text-sm whitespace-nowrap">{tab.label}</div>
                        <div className="text-xs opacity-70 hidden lg:block">{tab.description}</div>
                      </div>
                    </NavLink>
                  )
                })}
              </nav>
            </div>
          </div>

          <div className="flex-1 min-w-0 w-full">
            <Outlet />
          </div>
        </div>
      </div>
    </>
  )
}
