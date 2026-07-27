import { createSignal, createEffect, onCleanup, Show, For } from 'solid-js'
import { A, useLocation, useNavigate } from '@solidjs/router'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { Badge } from '../ui/Badge'
import {
  Menu,
  X,
  Home,
  FolderKanban,
  Calendar,
  DollarSign,
  MessageSquare,
  Users,
  Handshake,
  FileText,
  BookOpen,
  User,
  Settings,
  LogOut,
  Search,
  LogIn,
  ChevronDown,
  ShieldCheck,
  Bell,
  CheckCheck,
  Flag,
  Zap,
  ChevronRight,
} from 'lucide-solid'
import { Button } from '../ui/Button'
import { ROLE_LABELS, ROLE_COLORS } from '../../lib/constants'
import { cn, formatRelativeTime } from '../../lib/utils'
import { useNotifications, useMarkNotificationRead, useMarkAllRead } from '../../hooks/useNotifications'

interface DropdownItem {
  name: string
  href: string
  icon: any
  description: string
}

interface NavDropdown {
  id: string
  name: string
  icon: any
  items: DropdownItem[]
}

export function Navbar() {
  const auth = useAuth()
  const toast = useToast()
  const location = useLocation()
  const navigate = useNavigate()
  const [mobileMenuOpen, setMobileMenuOpen] = createSignal(false)
  const [userMenuOpen, setUserMenuOpen] = createSignal(false)
  const [openDropdownId, setOpenDropdownId] = createSignal<string | null>(null)
  const [searchQuery, setSearchQuery] = createSignal('')
  const [notifOpen, setNotifOpen] = createSignal(false)

  // Notifications
  const { notifications, unreadCount, refetch: refetchNotifications } = useNotifications(
    () => auth.user()?.id
  )
  const { markRead } = useMarkNotificationRead()
  const { markAllRead } = useMarkAllRead()

  let userMenuRef: HTMLDivElement | undefined
  let notifRef: HTMLDivElement | undefined
  const dropdownRefs: Record<string, HTMLDivElement | undefined> = {}

  const handleSearch = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && searchQuery().trim()) {
      navigate(`/projects?search=${encodeURIComponent(searchQuery().trim())}`)
      setSearchQuery('')
      setMobileMenuOpen(false)
    }
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      setUserMenuOpen(false)
      setMobileMenuOpen(false)
      setOpenDropdownId(null)
      setNotifOpen(false)
    }
  }

  const handleClickOutside = (e: MouseEvent) => {
    const target = e.target as Node
    if (userMenuRef && !userMenuRef.contains(target)) {
      setUserMenuOpen(false)
    }
    if (notifRef && !notifRef.contains(target)) {
      setNotifOpen(false)
    }
    const current = openDropdownId()
    if (current && dropdownRefs[current] && !dropdownRefs[current]!.contains(target)) {
      setOpenDropdownId(null)
    }
  }

  createEffect(() => {
    if (userMenuOpen() || mobileMenuOpen() || openDropdownId() || notifOpen()) {
      document.addEventListener('keydown', handleKeyDown)
      document.addEventListener('mousedown', handleClickOutside)
    }
    onCleanup(() => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleClickOutside)
    })
  })

  // Top-level standalone links
  const topLinks = [
    { name: 'Discover', href: '/', icon: Home },
    { name: 'Projects', href: '/projects', icon: FolderKanban },
    { name: 'Events', href: '/events', icon: Calendar },
  ]

  // Dropdown groups
  const navDropdowns: NavDropdown[] = [
    {
      id: 'funding',
      name: 'Funding',
      icon: DollarSign,
      items: [
        { name: 'Grants', href: '/grants', icon: DollarSign, description: 'Browse funding opportunities' },
        { name: 'Resources', href: '/resources', icon: BookOpen, description: 'Articles, guides & case studies' },
        { name: 'Proposals', href: '/proposals', icon: FileText, description: 'Create & manage proposals' },
      ],
    },
    {
      id: 'community',
      name: 'Community',
      icon: Users,
      items: [
        { name: 'Directory', href: '/directory', icon: Users, description: 'Browse the member directory' },
        { name: 'Forums', href: '/forums', icon: MessageSquare, description: 'Join community discussions' },
        { name: 'Messages', href: '/messages', icon: MessageSquare, description: 'Direct conversations' },
        { name: 'Collaborate', href: '/collaborate', icon: Handshake, description: 'Work together in real-time' },
      ],
    },
  ]

  const isActive = (href: string) => {
    if (href === '/') return location.pathname === '/'
    return location.pathname.startsWith(href)
  }

  const isDropdownActive = (dropdown: NavDropdown) =>
    dropdown.items.some((item) => isActive(item.href))

  const toggleDropdown = (id: string) => {
    setOpenDropdownId(openDropdownId() === id ? null : id)
  }

  const handleSignOut = async () => {
    try {
      await auth.signOut()
      toast.success('Signed out successfully')
    } catch (error) {
      toast.error('Failed to sign out')
    }
  }

  return (
    <nav class="bg-white/80 backdrop-blur-lg shadow-nav border-b border-ktip-sand-100/80 sticky top-0 z-40" style={{ "padding-top": "1rem", "padding-bottom": "1rem" }}>
      <div class="w-full px-4">
        <div class="flex items-center justify-between">
          {/* Logo */}
          <div class="flex items-center">
            <A href="/" class="flex items-center gap-3 group">
              <img src="/pwa-512x512.png" alt="KTIP Logo" class="w-10 h-10 lg:w-14 lg:h-14 object-cover rounded-full shadow-soft group-hover:shadow-medium transition-shadow" />
              <div class="hidden sm:block">
                <h1 class="text-2xl font-display font-bold text-ktip-ocean-600">KTIP</h1>
                <p class="text-xs font-medium text-ktip-sand-500 tracking-wide">OECS INNOVATE & CONNECT</p>
              </div>
            </A>
          </div>

          {/* Desktop Navigation */}
          <div class="hidden lg:flex items-center gap-1">
            {/* Standalone links */}
            <For each={topLinks}>
              {(item) => (
                <A
                  href={item.href}
                  class={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all',
                    isActive(item.href)
                      ? 'bg-ktip-ocean-50 text-ktip-ocean-700'
                      : 'text-ktip-sand-600 hover:bg-ktip-sand-50 hover:text-ktip-sand-900'
                  )}
                >
                  <item.icon size={18} />
                  <span>{item.name}</span>
                </A>
              )}
            </For>

            {/* Dropdown menus */}
            <For each={navDropdowns}>
              {(dropdown) => (
                <div
                  class="relative"
                  ref={(el) => { dropdownRefs[dropdown.id] = el }}
                >
                  <button
                    onClick={() => toggleDropdown(dropdown.id)}
                    aria-haspopup="true"
                    aria-expanded={openDropdownId() === dropdown.id}
                    class={cn(
                      'flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all',
                      isDropdownActive(dropdown) || openDropdownId() === dropdown.id
                        ? 'bg-ktip-ocean-50 text-ktip-ocean-700'
                        : 'text-ktip-sand-600 hover:bg-ktip-sand-50 hover:text-ktip-sand-900'
                    )}
                  >
                    <dropdown.icon size={18} />
                    <span>{dropdown.name}</span>
                    <ChevronDown
                      size={14}
                      class={cn(
                        'transition-transform duration-200',
                        openDropdownId() === dropdown.id && 'rotate-180'
                      )}
                    />
                  </button>

                  <Show when={openDropdownId() === dropdown.id}>
                    <div
                      role="menu"
                      class="absolute left-0 mt-2 w-64 bg-white rounded-xl shadow-hard border border-ktip-sand-100 py-2 animate-scale-in z-50"
                    >
                      <For each={dropdown.items}>
                        {(item) => (
                          <A
                            href={item.href}
                            onClick={() => setOpenDropdownId(null)}
                            class={cn(
                              'flex items-start gap-3 px-4 py-3 transition-colors',
                              isActive(item.href)
                                ? 'bg-ktip-ocean-50 text-ktip-ocean-700'
                                : 'text-ktip-sand-700 hover:bg-ktip-sand-50'
                            )}
                          >
                            <item.icon size={18} class="mt-0.5 shrink-0" />
                            <div>
                              <p class="font-medium">{item.name}</p>
                              <p class="text-xs text-ktip-sand-500 mt-0.5">{item.description}</p>
                            </div>
                          </A>
                        )}
                      </For>
                    </div>
                  </Show>
                </div>
              )}
            </For>

            {/* Admin link (OECS only) */}
            <Show when={auth.profile()?.roles?.includes('oecs')}>
              <A
                href="/admin"
                class={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all',
                  isActive('/admin')
                    ? 'bg-pink-50 text-pink-700'
                    : 'text-ktip-sand-600 hover:bg-ktip-sand-50 hover:text-ktip-sand-900'
                )}
              >
                <ShieldCheck size={18} />
                <span>Admin</span>
              </A>
            </Show>
          </div>

          {/* Search Bar (Desktop) */}
          <div class="hidden md:flex items-center flex-1 max-w-md mx-4">
            <div class="relative w-full">
              <Search
                size={20}
                class="absolute left-3 top-1/2 -translate-y-1/2 text-ktip-sand-400"
              />
              <input
                type="text"
                placeholder="Search projects, events..."
                aria-label="Search projects and events"
                value={searchQuery()}
                onInput={(e) => setSearchQuery(e.currentTarget.value)}
                onKeyDown={handleSearch}
                class="w-full pl-10 pr-4 py-2 border border-ktip-sand-200 bg-ktip-sand-50/50 focus:bg-white rounded-lg focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors"
              />
            </div>
          </div>

          {/* User Menu / Auth Buttons */}
          <div class="flex items-center gap-3">
            {/* Notification Bell */}
            <Show when={auth.user()}>
              <div class="relative" ref={notifRef}>
                <button
                  onClick={() => setNotifOpen(!notifOpen())}
                  aria-label="Notifications"
                  class="relative p-2 rounded-lg hover:bg-ktip-sand-50 transition-colors text-ktip-sand-600"
                >
                  <Bell size={20} />
                  <Show when={unreadCount() > 0}>
                    <span class="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1">
                      {unreadCount() > 9 ? '9+' : unreadCount()}
                    </span>
                  </Show>
                </button>

                <Show when={notifOpen()}>
                  <div class="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-hard border border-ktip-sand-100 animate-scale-in z-50 max-h-96 flex flex-col">
                    {/* Header */}
                    <div class="flex items-center justify-between px-4 py-3 border-b border-ktip-sand-100">
                      <h3 class="text-sm font-semibold text-ktip-sand-800">Notifications</h3>
                      <Show when={unreadCount() > 0}>
                        <button
                          onClick={async () => {
                            const uid = auth.user()?.id
                            if (uid) {
                              await markAllRead(uid)
                              refetchNotifications()
                            }
                          }}
                          class="flex items-center gap-1 text-xs text-ktip-ocean-600 hover:text-ktip-ocean-700 font-medium"
                        >
                          <CheckCheck size={14} />
                          Mark all read
                        </button>
                      </Show>
                    </div>

                    {/* Notification List */}
                    <div class="overflow-y-auto flex-1">
                      <Show
                        when={notifications().length > 0}
                        fallback={
                          <div class="px-4 py-8 text-center">
                            <Bell size={24} class="mx-auto text-ktip-sand-300 mb-2" />
                            <p class="text-sm text-ktip-sand-500">No notifications yet</p>
                          </div>
                        }
                      >
                        <For each={notifications()}>
                          {(notif) => (
                            <button
                              type="button"
                              onClick={async () => {
                                if (!notif.is_read) {
                                  await markRead(notif.id)
                                  refetchNotifications()
                                }
                                setNotifOpen(false)
                                if (notif.link) navigate(notif.link)
                              }}
                              class={cn(
                                'w-full text-left px-4 py-3 hover:bg-ktip-sand-50 transition-colors border-b border-ktip-sand-50 last:border-b-0',
                                !notif.is_read && 'bg-ktip-ocean-50/30'
                              )}
                            >
                              <div class="flex items-start gap-3">
                                <Show when={!notif.is_read}>
                                  <span class="mt-1.5 w-2 h-2 rounded-full bg-ktip-ocean-500 shrink-0" />
                                </Show>
                                <Show when={notif.is_read}>
                                  <span class="mt-1.5 w-2 h-2 rounded-full bg-transparent shrink-0" />
                                </Show>
                                <div class="min-w-0 flex-1">
                                  <p class={cn(
                                    'text-sm truncate',
                                    notif.is_read ? 'text-ktip-sand-600' : 'text-ktip-sand-800 font-medium'
                                  )}>
                                    {notif.title}
                                  </p>
                                  <Show when={notif.body}>
                                    <p class="text-xs text-ktip-sand-500 mt-0.5 line-clamp-2">{notif.body}</p>
                                  </Show>
                                  <p class="text-[10px] text-ktip-sand-400 mt-1">
                                    {formatRelativeTime(notif.created_at)}
                                  </p>
                                </div>
                              </div>
                            </button>
                          )}
                        </For>
                      </Show>
                    </div>
                  </div>
                </Show>
              </div>
            </Show>

            <Show
              when={auth.user()}
              fallback={
                <>
                  {/* Desktop: both buttons */}
                  <div class="hidden sm:flex items-center gap-2">
                    <A href="/login">
                      <Button variant="ghost" size="sm" icon={<LogIn size={16} />}>
                        Log In
                      </Button>
                    </A>
                    <A href="/signup">
                      <Button size="sm">Sign Up</Button>
                    </A>
                  </div>
                  {/* Mobile: compact login button */}
                  <A href="/login" class="sm:hidden">
                    <Button variant="outline" size="sm" icon={<LogIn size={16} />}>
                      Log In
                    </Button>
                  </A>
                </>
              }
            >
              {/* User Avatar & Dropdown */}
              <div class="relative" ref={userMenuRef}>
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen())}
                  aria-label="User menu"
                  aria-expanded={userMenuOpen()}
                  aria-haspopup="true"
                  class="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-ktip-sand-50 transition-colors"
                >
                  <div class="hidden md:block text-right">
                    <p class="text-sm font-medium text-ktip-sand-900">
                      {auth.profile()?.display_name || 'User'}
                    </p>
                    <div class="flex gap-1 justify-end mt-0.5">
                      <Show when={auth.profile()?.roles?.[0]}>
                        <Badge
                          variant="primary"
                          size="sm"
                          class={ROLE_COLORS[auth.profile()?.roles[0] || '']}
                        >
                          {ROLE_LABELS[auth.profile()?.roles[0] || '']}
                        </Badge>
                      </Show>
                    </div>
                  </div>
                  <Show
                    when={auth.profile()?.avatar_url}
                    fallback={
                      <div class="w-10 h-10 bg-gradient-to-br from-ktip-ocean-400 to-ktip-tropical-400 rounded-full flex items-center justify-center text-white font-medium shadow-soft">
                        {auth.profile()?.display_name?.charAt(0).toUpperCase() || 'U'}
                      </div>
                    }
                  >
                    <img
                      src={auth.profile()!.avatar_url!}
                      alt={auth.profile()?.display_name || 'User'}
                      class="w-10 h-10 rounded-full object-cover shadow-soft"
                    />
                  </Show>
                </button>

                {/* User Dropdown Menu */}
                <Show when={userMenuOpen()}>
                  <div role="menu" class="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-hard border border-ktip-sand-100 py-2 animate-scale-in">
                    <A
                      href="/profile/me"
                      onClick={() => setUserMenuOpen(false)}
                      class="flex items-center gap-3 px-4 py-2 text-ktip-sand-700 hover:bg-ktip-sand-50 transition-colors"
                    >
                      <User size={18} />
                      <span>My Profile</span>
                    </A>
                    <A
                      href="/settings"
                      onClick={() => setUserMenuOpen(false)}
                      class="flex items-center gap-3 px-4 py-2 text-ktip-sand-700 hover:bg-ktip-sand-50 transition-colors"
                    >
                      <Settings size={18} />
                      <span>Settings</span>
                    </A>
                    <A
                      href="/grievances/my-reports"
                      onClick={() => setUserMenuOpen(false)}
                      class="flex items-center gap-3 px-4 py-2 text-ktip-sand-700 hover:bg-ktip-sand-50 transition-colors"
                    >
                      <Flag size={18} />
                      <span>My Reports</span>
                    </A>
                    <hr class="my-2 border-ktip-sand-100" />
                    <button
                      onClick={handleSignOut}
                      class="w-full flex items-center gap-3 px-4 py-2 text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <LogOut size={18} />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </Show>
              </div>
            </Show>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen())}
              aria-label={mobileMenuOpen() ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileMenuOpen()}
              class="lg:hidden p-2 rounded-lg hover:bg-ktip-sand-50"
            >
              <Show when={!mobileMenuOpen()} fallback={<X size={24} />}>
                <Menu size={24} />
              </Show>
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        <Show when={mobileMenuOpen()}>
          <div class="lg:hidden py-4 border-t border-ktip-sand-100 animate-slide-up">
            {/* Mobile Search */}
            <div class="mb-4 px-2">
              <div class="relative">
                <Search
                  size={20}
                  class="absolute left-3 top-1/2 -translate-y-1/2 text-ktip-sand-400"
                />
                <input
                  type="text"
                  placeholder="Search..."
                  aria-label="Search projects and events"
                  value={searchQuery()}
                  onInput={(e) => setSearchQuery(e.currentTarget.value)}
                  onKeyDown={handleSearch}
                  class="w-full pl-10 pr-4 py-2 border border-ktip-sand-200 bg-ktip-sand-50/50 focus:bg-white rounded-lg focus:border-ktip-ocean-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Quick Actions (moved from DiscoverPage action band) */}
            <div class="space-y-1 px-2 mb-3">
              <A
                href="/projects/new"
                onClick={() => setMobileMenuOpen(false)}
                class="flex items-center justify-between px-4 py-3 rounded-lg bg-ktip-tropical-50 text-ktip-tropical-700 hover:bg-ktip-tropical-100 transition-colors"
              >
                <div class="flex items-center gap-3">
                  <Zap size={18} />
                  <span class="font-semibold text-sm">Become a Contributor</span>
                </div>
                <ChevronRight size={16} />
              </A>
              <A
                href="/grants"
                onClick={() => setMobileMenuOpen(false)}
                class="flex items-center justify-between px-4 py-3 rounded-lg bg-ktip-ocean-50 text-ktip-ocean-700 hover:bg-ktip-ocean-100 transition-colors"
              >
                <div class="flex items-center gap-3">
                  <DollarSign size={18} />
                  <span class="font-semibold text-sm">Browse Grants</span>
                </div>
                <ChevronRight size={16} />
              </A>
              <A
                href="/projects"
                onClick={() => setMobileMenuOpen(false)}
                class="flex items-center justify-between px-4 py-3 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
              >
                <div class="flex items-center gap-3">
                  <FolderKanban size={18} />
                  <span class="font-semibold text-sm">Explore Projects</span>
                </div>
                <ChevronRight size={16} />
              </A>
            </div>

            <hr class="my-2 mx-2 border-ktip-sand-100" />

            {/* Mobile Nav Links */}
            <div class="space-y-1 px-2">
              {/* Standalone links */}
              <For each={topLinks}>
                {(item) => (
                  <A
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    class={cn(
                      'flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-all',
                      isActive(item.href)
                        ? 'bg-ktip-ocean-50 text-ktip-ocean-700'
                        : 'text-ktip-sand-600 hover:bg-ktip-sand-50'
                    )}
                  >
                    <item.icon size={20} />
                    <span>{item.name}</span>
                  </A>
                )}
              </For>

              {/* Grouped sections */}
              <For each={navDropdowns}>
                {(dropdown) => (
                  <>
                    <div class="pt-3 pb-1 px-4">
                      <p class="text-xs font-semibold uppercase tracking-wider text-ktip-sand-400">
                        {dropdown.name}
                      </p>
                    </div>
                    <For each={dropdown.items}>
                      {(item) => (
                        <A
                          href={item.href}
                          onClick={() => setMobileMenuOpen(false)}
                          class={cn(
                            'flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-all',
                            isActive(item.href)
                              ? 'bg-ktip-ocean-50 text-ktip-ocean-700'
                              : 'text-ktip-sand-600 hover:bg-ktip-sand-50'
                          )}
                        >
                          <item.icon size={20} />
                          <span>{item.name}</span>
                        </A>
                      )}
                    </For>
                  </>
                )}
              </For>

              {/* Admin link (OECS only) */}
              <Show when={auth.profile()?.roles?.includes('oecs')}>
                <hr class="my-2 border-ktip-sand-100" />
                <p class="px-4 py-1 text-xs font-semibold uppercase tracking-wider text-ktip-sand-400">
                  Admin
                </p>
                <A
                  href="/admin"
                  onClick={() => setMobileMenuOpen(false)}
                  class={cn(
                    'flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-all',
                    isActive('/admin')
                      ? 'bg-pink-50 text-pink-700'
                      : 'text-ktip-sand-600 hover:bg-ktip-sand-50 hover:text-ktip-sand-900'
                  )}
                >
                  <ShieldCheck size={18} />
                  <span>Admin</span>
                </A>
              </Show>

              {/* Mobile Auth Links */}
              <hr class="my-2 border-ktip-sand-100" />
              <Show
                when={auth.user()}
                fallback={
                  <>
                    <A
                      href="/login"
                      onClick={() => setMobileMenuOpen(false)}
                      class="flex items-center gap-3 px-4 py-3 rounded-lg font-medium text-ktip-sand-600 hover:bg-ktip-sand-50"
                    >
                      <LogIn size={20} />
                      <span>Log In</span>
                    </A>
                    <A
                      href="/signup"
                      onClick={() => setMobileMenuOpen(false)}
                      class="flex items-center gap-3 px-4 py-3 rounded-lg font-medium text-ktip-ocean-600 hover:bg-ktip-ocean-50"
                    >
                      <User size={20} />
                      <span>Sign Up</span>
                    </A>
                  </>
                }
              >
                <A
                  href="/settings"
                  onClick={() => setMobileMenuOpen(false)}
                  class="flex items-center gap-3 px-4 py-3 rounded-lg font-medium text-ktip-sand-600 hover:bg-ktip-sand-50"
                >
                  <Settings size={20} />
                  <span>Settings</span>
                </A>
                <A
                  href="/grievances/my-reports"
                  onClick={() => setMobileMenuOpen(false)}
                  class="flex items-center gap-3 px-4 py-3 rounded-lg font-medium text-ktip-sand-600 hover:bg-ktip-sand-50"
                >
                  <Flag size={20} />
                  <span>My Reports</span>
                </A>
                <button
                  onClick={() => { setMobileMenuOpen(false); handleSignOut() }}
                  class="w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium text-red-600 hover:bg-red-50"
                >
                  <LogOut size={20} />
                  <span>Sign Out</span>
                </button>
              </Show>
            </div>
          </div>
        </Show>
      </div>
    </nav>
  )
}
