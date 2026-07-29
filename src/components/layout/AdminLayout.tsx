import { Link, Outlet, useLocation } from 'react-router'
import {
  LayoutDashboard,
  FolderKanban,
  Calendar,
  Users,
  DollarSign,
  MessageSquare,
  BookOpen,
  Flag,
  ClipboardList,
  BarChart3,
  ClipboardCheck,
  BadgeCheck,
  MessageCircle,
  Puzzle,
  Building2,
  KeyRound,
  ShieldCheck,
  ShieldAlert,
  GraduationCap,
  Landmark,
} from 'lucide-react'
import { cn } from '../../lib/utils'

const adminNavItems = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/admin/projects', label: 'Projects', icon: FolderKanban },
  { href: '/admin/events', label: 'Events', icon: Calendar },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/roles', label: 'Roles & Permissions', icon: ShieldCheck },
  { href: '/admin/moderation', label: 'Moderation', icon: ShieldAlert },
  { href: '/admin/institutions', label: 'Institutions', icon: GraduationCap },
  { href: '/admin/chamber', label: 'Chamber Review', icon: Landmark },
  { href: '/admin/grants', label: 'Grants', icon: DollarSign },
  { href: '/admin/forums', label: 'Forums', icon: MessageSquare },
  { href: '/admin/resources', label: 'Resources', icon: BookOpen },
  { href: '/admin/grievances', label: 'Grievances', icon: Flag },
  { href: '/admin/feedback', label: 'Feedback', icon: MessageCircle },
  { href: '/admin/verification', label: 'Verification', icon: BadgeCheck },
  { href: '/admin/integrations', label: 'Integrations', icon: Puzzle },
  { href: '/admin/employers', label: 'Employers', icon: Building2 },
  { href: '/admin/partner-api', label: 'Partner API', icon: KeyRound },
  { href: '/admin/preregistrations', label: 'Pre-Registrations', icon: ClipboardList },
  { href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/admin/uat', label: 'UAT Feedback', icon: ClipboardCheck },
]

export function AdminLayout() {
  const location = useLocation()

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return location.pathname === href
    return location.pathname.startsWith(href)
  }

  return (
    <div className="max-w-[calc(50vw+40rem)] mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-8">
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar — desktop */}
        <div className="hidden lg:block lg:w-56 shrink-0">
          <div className="bg-ktip-cream border border-ktip-sand-200 rounded-2xl p-2 sticky top-28">
            <nav className="space-y-1">
              {adminNavItems.map((item) => (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors',
                    isActive(item.href, item.exact)
                      ? 'bg-ktip-ocean-50 text-ktip-ocean-700'
                      : 'text-ktip-sand-600 hover:bg-ktip-sand-50 hover:text-ktip-sand-900'
                  )}
                >
                  <item.icon size={20} />
                  <span className="font-medium text-sm">{item.label}</span>
                </Link>
              ))}
            </nav>
          </div>
        </div>

        {/* Mobile nav */}
        <div className="lg:hidden overflow-x-auto scrollbar-hide -mx-4 px-4">
          <nav className="flex gap-1 min-w-max bg-ktip-cream border border-ktip-sand-200 rounded-2xl p-2">
            {adminNavItems.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-colors',
                  isActive(item.href, item.exact)
                    ? 'bg-ktip-ocean-50 text-ktip-ocean-700'
                    : 'text-ktip-sand-600 hover:bg-ktip-sand-50 hover:text-ktip-sand-900'
                )}
              >
                <item.icon size={16} />
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div key={location.pathname} className="contents page-reveal">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  )
}
