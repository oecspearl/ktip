import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { CheckCircle, Plus, Users } from 'lucide-react'
import { PageHero } from '../../components/layout/PageHero'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { useAuth } from '../../contexts/AuthContext'
import { useConnectionCount } from '../../hooks/useConnections'
import { visibleDashboardTabs } from './dashboard-tabs'
import { ROLE_LABELS, ROLE_COLORS } from '../../lib/constants'
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
  const tabs = visibleDashboardTabs(profile?.roles)

  return (
    <>
      <PageHero
        eyebrow="Your Hub"
        title="Dashboard"
        subtitle="Everything on your plate — your profile, work, network and deadlines"
        imageSeed="dashboard"
        breadcrumb={[{ label: 'Home', href: '/' }, { label: 'Dashboard' }]}
        actions={
          <Link to="/events/new">
            <Button
              icon={<Plus size={16} />}
              size="sm"
              className="bg-ktip-ocean-600 text-white hover:bg-ktip-ocean-700 text-sm"
            >
              Create Event
            </Button>
          </Link>
        }
      />

      <div className="w-full max-w-[calc(50vw+48rem)] mx-auto px-4 pt-8 pb-12">
        {/* Identity strip — the part of the old profile hero worth keeping */}
        <div className="flex items-center gap-4 bg-ktip-cream border border-gray-200 rounded-2xl p-5 mb-6">
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={displayName}
              className="w-14 h-14 rounded-full object-cover shrink-0"
            />
          ) : (
            <div
              className={`w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold text-white shrink-0 ${generateAvatarColor(displayName)}`}
            >
              {getInitials(displayName)}
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-display font-bold text-ktip-sand-900 truncate">
                {displayName}
              </h1>
              {profile?.is_verified && (
                <span className="text-ktip-ocean-500 shrink-0" title="Verified">
                  <CheckCircle size={16} />
                </span>
              )}
            </div>
            {profile?.roles?.length ? (
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {profile.roles.map((role) => (
                  <Badge key={role} className={ROLE_COLORS[role]}>
                    {ROLE_LABELS[role] || role}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>

          <Link
            to="/dashboard/connections"
            className="hidden sm:flex items-center gap-1.5 text-sm text-ktip-sand-600 hover:text-ktip-ocean-600 shrink-0"
          >
            <Users size={16} />
            <span className="font-semibold text-ktip-sand-900">{connectionCount ?? 0}</span>
            {connectionCount === 1 ? 'connection' : 'connections'}
          </Link>
        </div>

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
