import { type ParentComponent, For } from 'solid-js'
import { A, useLocation } from '@solidjs/router'
import { MainLayout } from './MainLayout'
import {
  LayoutDashboard,
  Calendar,
  Users,
  DollarSign,
  MessageSquare,
  BookOpen,
  Flag,
  ClipboardList,
  BarChart3,
  ClipboardCheck,
} from 'lucide-solid'
import { cn } from '../../lib/utils'

const adminNavItems = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/admin/events', label: 'Events', icon: Calendar },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/grants', label: 'Grants', icon: DollarSign },
  { href: '/admin/forums', label: 'Forums', icon: MessageSquare },
  { href: '/admin/resources', label: 'Resources', icon: BookOpen },
  { href: '/admin/grievances', label: 'Grievances', icon: Flag },
  { href: '/admin/preregistrations', label: 'Pre-Registrations', icon: ClipboardList },
  { href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/admin/uat', label: 'UAT Feedback', icon: ClipboardCheck },
]

export const AdminLayout: ParentComponent = (props) => {
  const location = useLocation()

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return location.pathname === href
    return location.pathname.startsWith(href)
  }

  return (
    <MainLayout>
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div class="flex flex-col lg:flex-row gap-6">
          {/* Sidebar — desktop */}
          <div class="hidden lg:block lg:w-56 shrink-0">
            <div class="bg-gray-900 rounded-2xl p-2 sticky top-24">
              <nav class="space-y-1">
                <For each={adminNavItems}>
                  {(item) => (
                    <A
                      href={item.href}
                      class={cn(
                        'flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all',
                        isActive(item.href, item.exact)
                          ? 'bg-gray-800 text-white border-l-2 border-ktip-ocean-500'
                          : 'text-gray-400 hover:text-white hover:bg-gray-800'
                      )}
                    >
                      <item.icon size={20} />
                      <span class="font-medium text-sm">{item.label}</span>
                    </A>
                  )}
                </For>
              </nav>
            </div>
          </div>

          {/* Mobile nav */}
          <div class="lg:hidden overflow-x-auto scrollbar-hide -mx-4 px-4">
            <nav class="flex gap-1 min-w-max bg-gray-900 rounded-2xl p-2">
              <For each={adminNavItems}>
                {(item) => (
                  <A
                    href={item.href}
                    class={cn(
                      'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-colors',
                      isActive(item.href, item.exact)
                        ? 'bg-gray-800 text-white border-l-2 border-ktip-ocean-500'
                        : 'text-gray-400 hover:text-white hover:bg-gray-800'
                    )}
                  >
                    <item.icon size={16} />
                    {item.label}
                  </A>
                )}
              </For>
            </nav>
          </div>

          {/* Content */}
          <div class="flex-1 min-w-0">
            {props.children}
          </div>
        </div>
      </div>
    </MainLayout>
  )
}
