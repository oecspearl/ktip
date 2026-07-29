import { useEffect, useRef, useState, type ComponentType, type KeyboardEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
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
  HelpCircle,
  ClipboardList,
  LayoutDashboard,
  Inbox,
} from 'lucide-react'
import { Button } from '../ui/Button'
import { FlowingMenuItem } from '../ui/FlowingMenuItem'
import { NavbarSearchPanel } from './NavbarSearchPanel'
import { RoleSwitcher } from './RoleSwitcher'
import { ROLE_LABELS, ROLE_COLORS } from '../../lib/constants'
import { cn, formatRelativeTime } from '../../lib/utils'
import { useNotifications, useMarkNotificationRead, useMarkAllRead } from '../../hooks/useNotifications'
import { useGlobalSearch } from '../../hooks/useGlobalSearch'
import type { SearchRow } from '../../lib/site-search'

interface DropdownItem {
  name: string
  href: string
  icon: ComponentType<{ size?: number; className?: string }>
  description: string
}

interface NavDropdown {
  id: string
  name: string
  icon: ComponentType<{ size?: number; className?: string }>
  items: DropdownItem[]
}

// Keyboard hint shown beside the search box
const SHORTCUT_HINT =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '')
    ? '⌘K'
    : 'Ctrl K'

// Standalone links rendered before the dropdowns
const leadingLinks = [
  { name: 'Home', href: '/', icon: Home },
  { name: 'Projects', href: '/projects', icon: FolderKanban },
  { name: 'Events', href: '/events', icon: Calendar },
]

// Standalone links rendered after the dropdowns
const trailingLinks = [
  { name: 'Help', href: '/help', icon: HelpCircle },
]

// Dropdown groups
const navDropdowns: NavDropdown[] = [
  {
    id: 'funding',
    name: 'Funding',
    icon: DollarSign,
    items: [
      { name: 'Grants', href: '/grants', icon: DollarSign, description: 'Browse funding opportunities' },
      { name: 'My Applications', href: '/grants/my-applications', icon: ClipboardList, description: 'Track your grant applications' },
      { name: 'My Submissions', href: '/dashboard/submissions', icon: Inbox, description: 'Your copy of everything you submitted' },
      { name: 'Resources & Integrations', href: '/resources', icon: BookOpen, description: 'Guides, articles & partner tools' },
    ],
  },
  {
    id: 'community',
    name: 'Community',
    icon: Users,
    items: [
      { name: 'Directory', href: '/directory', icon: Users, description: 'Browse the member directory' },
      { name: 'Forums', href: '/forums', icon: MessageSquare, description: 'Join community discussions' },
      { name: 'Collaborate', href: '/collaborate', icon: Handshake, description: 'Work together in real-time' },
    ],
  },
]

export function Navbar() {
  const auth = useAuth()
  const toast = useToast()
  const location = useLocation()
  const navigate = useNavigate()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)

  // Global search panel state (see NavbarSearchPanel + useGlobalSearch)
  const [aiMode, setAiMode] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null)
  const [mobileSearchFocused, setMobileSearchFocused] = useState(false)

  // Navbar is always transparent over page content; it only gets a dark
  // backdrop while the mobile menu is open so menu links stay readable.

  // Auto-hide on scroll down, reappear on scroll up or top-edge hover
  const [navHidden, setNavHidden] = useState(false)
  const lastScrollY = useRef(0)

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY
      if (y < 80) {
        setNavHidden(false)
      } else if (y > lastScrollY.current + 4) {
        setNavHidden(true)
      } else if (y < lastScrollY.current - 4) {
        setNavHidden(false)
      }
      lastScrollY.current = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const anyMenuOpen = mobileMenuOpen || userMenuOpen || notifOpen || openDropdownId !== null
  const hidden = navHidden && !anyMenuOpen

  // Notifications
  const { notifications, unreadCount, refetch: refetchNotifications } = useNotifications(auth.user?.id)
  const { markRead } = useMarkNotificationRead()
  const { markAllRead } = useMarkAllRead()

  const userMenuRef = useRef<HTMLDivElement>(null)
  const notifRef = useRef<HTMLDivElement>(null)
  const dropdownRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const searchRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Site-wide search: pages, features and live content, optionally AI-ranked
  const search = useGlobalSearch(searchQuery, aiMode)
  // The trailing "see all results" row sits one past the last result
  const optionCount = search.rows.length + 1

  const closeSearch = () => {
    setSearchQuery('')
    setSearchOpen(false)
    setMobileSearchFocused(false)
    setMobileMenuOpen(false)
    setExpandedRowId(null)
    setActiveIndex(0)
  }

  const seeAllResults = () => {
    const term = searchQuery.trim()
    if (!term) return
    search.rememberQuery(term)
    navigate(`/projects?search=${encodeURIComponent(term)}`)
    closeSearch()
  }

  // Rows without an href (e.g. "Change your password" style walkthroughs) have
  // nowhere to go, so selecting them reveals their steps instead.
  const selectRow = (row: SearchRow) => {
    if (!row.href) {
      setExpandedRowId((prev) => (prev === row.id ? null : row.id))
      return
    }
    search.rememberQuery(searchQuery)
    navigate(row.href)
    closeSearch()
  }

  const handleSearch = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => (i + 1) % optionCount)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => (i - 1 + optionCount) % optionCount)
    } else if (e.key === 'ArrowRight') {
      const row = search.rows[activeIndex]
      if (row) {
        e.preventDefault()
        setExpandedRowId((prev) => (prev === row.id ? null : row.id))
      }
    } else if (e.key === 'Enter' && searchQuery.trim()) {
      e.preventDefault()
      const row = search.rows[activeIndex]
      if (row) selectRow(row)
      else seeAllResults()
    }
  }

  // A new query invalidates the highlight and any open explanation
  useEffect(() => {
    setActiveIndex(0)
    setExpandedRowId(null)
  }, [searchQuery])

  // Ctrl/Cmd+K opens the search box from anywhere (browser find stays intact)
  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen(true)
        searchInputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Collapsible desktop search: focus on expand, collapse on outside click / Escape
  useEffect(() => {
    if (!searchOpen) return
    searchInputRef.current?.focus()
    const onMouseDown = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false)
      }
    }
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSearchOpen(false)
        setExpandedRowId(null)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [searchOpen])

  useEffect(() => {
    if (!(userMenuOpen || mobileMenuOpen || openDropdownId || notifOpen)) return

    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setUserMenuOpen(false)
        setMobileMenuOpen(false)
        setOpenDropdownId(null)
        setNotifOpen(false)
      }
    }

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (userMenuRef.current && !userMenuRef.current.contains(target)) {
        setUserMenuOpen(false)
      }
      if (notifRef.current && !notifRef.current.contains(target)) {
        setNotifOpen(false)
      }
      const current = openDropdownId
      if (current && dropdownRefs.current[current] && !dropdownRefs.current[current]!.contains(target)) {
        setOpenDropdownId(null)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [userMenuOpen, mobileMenuOpen, openDropdownId, notifOpen])

  const isActive = (href: string) => {
    if (href === '/') return location.pathname === '/'
    return location.pathname.startsWith(href)
  }

  // Every nav link is white, which only works over the full-bleed dark hero the
  // public pages put behind this bar. Admin pages use `<PageHero inset>`, whose
  // hero starts BELOW the bar — leaving white text on the cream canvas. Those
  // routes get the same dark backdrop the open mobile menu already uses.
  const needsBackdrop = location.pathname.startsWith('/admin')

  const isDropdownActive = (dropdown: NavDropdown) =>
    dropdown.items.some((item) => isActive(item.href))

  const toggleDropdown = (id: string) => {
    setOpenDropdownId(openDropdownId === id ? null : id)
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
    <>
    {/* Hover zone to reveal the hidden navbar */}
    {hidden && (
      <div
        className="fixed top-0 inset-x-0 h-4 z-50"
        onMouseEnter={() => setNavHidden(false)}
      />
    )}
    <nav
      onMouseEnter={() => setNavHidden(false)}
      className={cn(
        'top-0 z-40 transition-all duration-300 fixed inset-x-0',
        hidden ? '-translate-y-full' : 'translate-y-0',
        mobileMenuOpen || needsBackdrop
          ? 'bg-ktip-ink/85 backdrop-blur-lg border-b border-ktip-line/60'
          : 'bg-transparent border-b border-transparent'
      )}
      style={{ paddingTop: '1rem', paddingBottom: '1rem' }}
    >
      <div className="w-full px-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center">
            <Link to="/" className="flex items-center gap-3 group">
              <img src="/KTIP%20LOGO.png" alt="KTIP Logo" className="w-10 h-10 lg:w-14 lg:h-14 object-contain" />
              <div className="hidden sm:block">
                <h1 className="text-2xl font-display font-bold whitespace-nowrap text-white">OECS KTIP</h1>
              </div>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center gap-1 ml-auto">
            {/* Standalone links */}
            {leadingLinks.map((item) => (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 font-medium transition-all duration-200 hover:scale-125',
                  isActive(item.href)
                    ? 'text-white underline decoration-ktip-nav-accent decoration-2 underline-offset-8'
                    : 'text-white/80 hover:text-ktip-nav-accent'
                )}
              >
                <span>{item.name}</span>
              </Link>
            ))}

            {/* Dropdown menus */}
            {navDropdowns.map((dropdown) => (
              <div
                key={dropdown.id}
                className="relative"
                ref={(el) => { dropdownRefs.current[dropdown.id] = el }}
              >
                <button
                  onClick={() => toggleDropdown(dropdown.id)}
                  aria-haspopup="true"
                  aria-expanded={openDropdownId === dropdown.id}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 font-medium transition-all duration-200 hover:scale-125',
                    isDropdownActive(dropdown) || openDropdownId === dropdown.id
                      ? 'text-white underline decoration-ktip-nav-accent decoration-2 underline-offset-8'
                      : 'text-white/80 hover:text-ktip-nav-accent'
                  )}
                >
                  <span>{dropdown.name}</span>
                  <ChevronDown
                    size={14}
                    className={cn(
                      'transition-transform duration-200',
                      openDropdownId === dropdown.id && 'rotate-180'
                    )}
                  />
                </button>

                {openDropdownId === dropdown.id && (
                  <div
                    role="menu"
                    className="absolute right-0 mt-2 w-64 bg-ktip-cream rounded-xl shadow-hard overflow-hidden animate-scale-in z-50"
                  >
                    {dropdown.items.map((item) => (
                      <FlowingMenuItem
                        key={item.name}
                        to={item.href}
                        label={item.name}
                        onClick={() => setOpenDropdownId(null)}
                        className={cn(
                          'flex items-start justify-end gap-3 px-4 py-3 transition-colors',
                          isActive(item.href)
                            ? 'bg-ktip-ocean-50 text-ktip-ocean-700'
                            : 'text-ktip-sand-700'
                        )}
                      >
                        <div className="text-right">
                          <p className="font-medium">{item.name}</p>
                          <p className="text-xs text-ktip-sand-500 mt-0.5">{item.description}</p>
                        </div>
                      </FlowingMenuItem>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Trailing standalone links */}
            {trailingLinks.map((item) => (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 font-medium transition-all duration-200 hover:scale-125',
                  isActive(item.href)
                    ? 'text-white underline decoration-ktip-nav-accent decoration-2 underline-offset-8'
                    : 'text-white/80 hover:text-ktip-nav-accent'
                )}
              >
                <span>{item.name}</span>
              </Link>
            ))}

            {/* Admin link (OECS only) */}
            {auth.profile?.roles?.includes('oecs') && (
              <Link
                to="/admin"
                className={cn(
                  'flex items-center gap-2 px-4 py-2 font-medium transition-all duration-200 hover:scale-125',
                  isActive('/admin')
                    ? 'text-white underline decoration-ktip-sun-400 decoration-2 underline-offset-8'
                    : 'text-white/80 hover:text-ktip-nav-accent'
                )}
              >
                <span>Admin</span>
              </Link>
            )}
          </div>

          {/* Search (Desktop) — collapsed to an icon, expands on click.
              The results panel is a sibling of the animating wrapper so the
              wrapper's overflow-hidden (needed for the width transition)
              cannot clip it. */}
          <div
            ref={searchRef}
            className="relative hidden md:flex items-center justify-end flex-1 max-w-md mx-4"
          >
            <div
              className={cn(
                'relative overflow-hidden transition-[width] duration-300 ease-out',
                searchOpen ? 'w-full' : 'w-10'
              )}
            >
              {searchOpen ? (
                <>
                  <Search
                    size={20}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-white/60"
                  />
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Search pages, features, people..."
                    aria-label="Search the whole platform"
                    aria-expanded={searchOpen}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.currentTarget.value)}
                    onKeyDown={handleSearch}
                    className="w-full pl-10 pr-16 py-2 rounded-lg focus:outline-none transition-colors border border-white/20 bg-white/10 text-white placeholder-white/60 focus:bg-white focus:text-brand-navy focus:placeholder-ktip-sand-400 focus:border-white"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold tracking-wide text-ktip-sand-400">
                    {SHORTCUT_HINT}
                  </span>
                </>
              ) : (
                <button
                  onClick={() => setSearchOpen(true)}
                  aria-label="Open search"
                  title={`Search (${SHORTCUT_HINT})`}
                  className="p-2 transition-all duration-200 text-white/80 hover:text-ktip-nav-accent hover:scale-125"
                >
                  <Search size={20} />
                </button>
              )}
            </div>

            {searchOpen && (
              <NavbarSearchPanel
                query={searchQuery}
                groups={search.groups}
                rows={search.rows}
                activeIndex={activeIndex}
                onHover={setActiveIndex}
                expandedId={expandedRowId}
                onToggleExpand={(id) => setExpandedRowId((prev) => (prev === id ? null : id))}
                onSelect={selectRow}
                onSeeAll={seeAllResults}
                aiMode={aiMode}
                onToggleAiMode={() => setAiMode((v) => !v)}
                aiAnswer={search.aiAnswer}
                aiSteps={search.aiSteps}
                aiLoading={search.aiLoading}
                aiError={search.aiError}
                contentLoading={search.contentLoading}
                suggestions={search.suggestions}
                recent={search.recent}
                onPickRecent={setSearchQuery}
                onClearRecent={search.clearRecent}
              />
            )}
          </div>

          {/* User Menu / Auth Buttons */}
          <div className="flex items-center gap-3">
            {/* Notification Bell */}
            {auth.user && (
              <div className="relative" ref={notifRef}>
                <button
                  onClick={() => setNotifOpen(!notifOpen)}
                  aria-label="Notifications"
                  className="relative p-2 transition-all duration-200 text-white/80 hover:text-ktip-nav-accent hover:scale-125"
                >
                  <Bell size={20} />
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>

                {notifOpen && (
                  <div className="absolute right-0 mt-2 w-80 bg-ktip-cream rounded-xl shadow-hard border border-ktip-sand-100 animate-scale-in z-50 max-h-96 flex flex-col">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-ktip-sand-100">
                      <h3 className="text-sm font-semibold text-ktip-sand-800">Notifications</h3>
                      {unreadCount > 0 && (
                        <button
                          onClick={async () => {
                            const uid = auth.user?.id
                            if (uid) {
                              await markAllRead(uid)
                              refetchNotifications()
                            }
                          }}
                          className="flex items-center gap-1 text-xs text-ktip-ocean-600 hover:text-ktip-ocean-700 font-medium"
                        >
                          <CheckCheck size={14} />
                          Mark all read
                        </button>
                      )}
                    </div>

                    {/* Notification List */}
                    <div className="overflow-y-auto flex-1">
                      {notifications.length > 0 ? (
                        notifications.map((notif) => (
                          <button
                            key={notif.id}
                            type="button"
                            onClick={async () => {
                              if (!notif.is_read) {
                                await markRead(notif.id)
                                refetchNotifications()
                              }
                              setNotifOpen(false)
                              if (notif.link) navigate(notif.link)
                            }}
                            className={cn(
                              'w-full text-left px-4 py-3 hover:bg-ktip-sand-50 transition-colors border-b border-ktip-sand-50 last:border-b-0',
                              !notif.is_read && 'bg-ktip-ocean-50/30'
                            )}
                          >
                            <div className="flex items-start gap-3">
                              <span
                                className={cn(
                                  'mt-1.5 w-2 h-2 rounded-full shrink-0',
                                  notif.is_read ? 'bg-transparent' : 'bg-ktip-ocean-500'
                                )}
                              />
                              <div className="min-w-0 flex-1">
                                <p
                                  className={cn(
                                    'text-sm truncate',
                                    notif.is_read ? 'text-ktip-sand-600' : 'text-ktip-sand-800 font-medium'
                                  )}
                                >
                                  {notif.title}
                                </p>
                                {notif.body && (
                                  <p className="text-xs text-ktip-sand-500 mt-0.5 line-clamp-2">{notif.body}</p>
                                )}
                                <p className="text-[10px] text-ktip-sand-400 mt-1">
                                  {formatRelativeTime(notif.created_at)}
                                </p>
                              </div>
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className="px-4 py-8 text-center">
                          <Bell size={24} className="mx-auto text-ktip-sand-300 mb-2" />
                          <p className="text-sm text-ktip-sand-500">No notifications yet</p>
                        </div>
                      )}
                    </div>

                    {/* The dropdown caps out at 20 items and has no accept /
                        decline actions — invitations get a real page. */}
                    <Link
                      to="/invitations"
                      onClick={() => setNotifOpen(false)}
                      className="block px-4 py-2.5 text-center text-sm font-medium text-ktip-ocean-600 hover:bg-ktip-sand-50 border-t border-ktip-sand-100 rounded-b-xl"
                    >
                      View all invitations
                    </Link>
                  </div>
                )}
              </div>
            )}

            {auth.user ? (
              /* User Avatar & Dropdown */
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  aria-label="User menu"
                  aria-expanded={userMenuOpen}
                  aria-haspopup="true"
                  className="group flex items-center gap-3 px-3 py-2 transition-all duration-200 hover:scale-110"
                >
                  <div className="hidden md:block text-right">
                    <p className="text-sm font-medium text-white transition-colors group-hover:text-ktip-nav-accent">
                      {auth.profile?.display_name || 'User'}
                    </p>
                    <div className="flex gap-1 justify-end mt-0.5">
                      {auth.profile?.roles?.[0] && (
                        <Badge
                          variant="primary"
                          size="sm"
                          className={ROLE_COLORS[auth.profile?.roles[0] || '']}
                        >
                          {ROLE_LABELS[auth.profile?.roles[0] || '']}
                        </Badge>
                      )}
                    </div>
                  </div>
                  {auth.profile?.avatar_url ? (
                    <img
                      src={auth.profile.avatar_url}
                      alt={auth.profile?.display_name || 'User'}
                      className="w-10 h-10 rounded-full object-cover shadow-soft"
                    />
                  ) : (
                    <div className="w-10 h-10 bg-gradient-to-br from-ktip-ocean-600 to-ktip-tropical-700 rounded-full flex items-center justify-center text-white font-medium shadow-soft">
                      {auth.profile?.display_name?.charAt(0).toUpperCase() || 'U'}
                    </div>
                  )}
                </button>

                {/* User Dropdown Menu */}
                {userMenuOpen && (
                  <div role="menu" className="absolute right-0 mt-2 w-56 bg-ktip-cream rounded-xl shadow-hard border border-ktip-sand-100 py-2 animate-scale-in">
                    <RoleSwitcher onSwitch={() => setUserMenuOpen(false)} />
                    <Link
                      to="/dashboard"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-2 text-ktip-sand-700 hover:bg-ktip-sand-50 transition-colors"
                    >
                      <LayoutDashboard size={18} />
                      <span>My Dashboard</span>
                    </Link>
                    <Link
                      to="/settings"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-2 text-ktip-sand-700 hover:bg-ktip-sand-50 transition-colors"
                    >
                      <Settings size={18} />
                      <span>Settings</span>
                    </Link>
                    <Link
                      to="/grievances/my-reports"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-2 text-ktip-sand-700 hover:bg-ktip-sand-50 transition-colors"
                    >
                      <Flag size={18} />
                      <span>My Reports</span>
                    </Link>
                    <Link
                      to="/help"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-2 text-ktip-sand-700 hover:bg-ktip-sand-50 transition-colors"
                    >
                      <HelpCircle size={18} />
                      <span>Help Center</span>
                    </Link>
                    <hr className="my-2 border-ktip-sand-100" />
                    <button
                      onClick={handleSignOut}
                      className="w-full flex items-center gap-3 px-4 py-2 text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <LogOut size={18} />
                      <span>Sign Out</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Desktop: both buttons */}
                <div className="hidden sm:flex items-center gap-2">
                  <Link to="/login">
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<LogIn size={16} />}
                      className="text-white hover:bg-white/10"
                    >
                      Log In
                    </Button>
                  </Link>
                  <Link to="/signup">
                    <Button size="sm">Sign Up</Button>
                  </Link>
                </div>
                {/* Mobile: compact login button */}
                <Link to="/login" className="sm:hidden">
                  <Button variant="outline" size="sm" icon={<LogIn size={16} />}>
                    Log In
                  </Button>
                </Link>
              </>
            )}

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileMenuOpen}
              className="lg:hidden p-2 rounded-lg text-white hover:bg-white/10"
            >
              {!mobileMenuOpen ? <Menu size={24} /> : <X size={24} />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="lg:hidden py-4 border-t border-white/10 animate-slide-up">
            {/* Mobile Search */}
            <div className="mb-4 px-2">
              <div className="relative">
                <Search
                  size={20}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-white/60"
                />
                <input
                  type="text"
                  placeholder="Search pages, features, people..."
                  aria-label="Search the whole platform"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.currentTarget.value)}
                  onKeyDown={handleSearch}
                  onFocus={() => setMobileSearchFocused(true)}
                  className="w-full pl-10 pr-4 py-2 border border-white/20 bg-white/10 text-white placeholder-white/60 rounded-lg focus:bg-white focus:text-brand-navy focus:placeholder-ktip-sand-400 focus:border-white focus:outline-none"
                />
              </div>
              {(mobileSearchFocused || searchQuery.trim()) && (
                <NavbarSearchPanel
                  variant="mobile"
                  query={searchQuery}
                  groups={search.groups}
                  rows={search.rows}
                  activeIndex={activeIndex}
                  onHover={setActiveIndex}
                  expandedId={expandedRowId}
                  onToggleExpand={(id) => setExpandedRowId((prev) => (prev === id ? null : id))}
                  onSelect={selectRow}
                  onSeeAll={seeAllResults}
                  aiMode={aiMode}
                  onToggleAiMode={() => setAiMode((v) => !v)}
                  aiAnswer={search.aiAnswer}
                  aiSteps={search.aiSteps}
                  aiLoading={search.aiLoading}
                  aiError={search.aiError}
                  contentLoading={search.contentLoading}
                  suggestions={search.suggestions}
                  recent={search.recent}
                  onPickRecent={setSearchQuery}
                  onClearRecent={search.clearRecent}
                />
              )}
            </div>

            {/* Quick Actions (moved from DiscoverPage action band) */}
            <div className="space-y-1 px-2 mb-3">
              <Link
                to="/projects/new"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-between px-4 py-3 rounded-lg bg-ktip-tropical-50 text-ktip-tropical-700 hover:bg-ktip-tropical-100 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Zap size={18} />
                  <span className="font-semibold text-sm">Become a Contributor</span>
                </div>
                <ChevronRight size={16} />
              </Link>
              <Link
                to="/grants"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-between px-4 py-3 rounded-lg bg-ktip-ocean-50 text-ktip-ocean-700 hover:bg-ktip-ocean-100 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <DollarSign size={18} />
                  <span className="font-semibold text-sm">Browse Grants</span>
                </div>
                <ChevronRight size={16} />
              </Link>
              <Link
                to="/projects"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-between px-4 py-3 rounded-lg bg-ktip-sun-50 text-ktip-sun-800 hover:bg-ktip-sun-100 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <FolderKanban size={18} />
                  <span className="font-semibold text-sm">Explore Projects</span>
                </div>
                <ChevronRight size={16} />
              </Link>
            </div>

            <hr className="my-2 mx-2 border-white/10" />

            {/* Mobile Nav Links */}
            <div className="space-y-1 px-2">
              {/* Standalone links */}
              {leadingLinks.map((item) => (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-all',
                    isActive(item.href)
                      ? 'bg-white/15 text-white'
                      : 'text-white/80 hover:bg-white/10'
                  )}
                >
                  <item.icon size={20} />
                  <span>{item.name}</span>
                </Link>
              ))}

              {/* Grouped sections */}
              {navDropdowns.map((dropdown) => (
                <div key={dropdown.id}>
                  <div className="pt-3 pb-1 px-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-white/40">
                      {dropdown.name}
                    </p>
                  </div>
                  {dropdown.items.map((item) => (
                    <Link
                      key={item.name}
                      to={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        'flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-all',
                        isActive(item.href)
                          ? 'bg-white/15 text-white'
                          : 'text-white/80 hover:bg-white/10'
                      )}
                    >
                      <item.icon size={20} />
                      <span>{item.name}</span>
                    </Link>
                  ))}
                </div>
              ))}

              {/* Trailing standalone links */}
              {trailingLinks.map((item) => (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-all',
                    isActive(item.href)
                      ? 'bg-white/15 text-white'
                      : 'text-white/80 hover:bg-white/10'
                  )}
                >
                  <item.icon size={20} />
                  <span>{item.name}</span>
                </Link>
              ))}

              {/* Admin link (OECS only) */}
              {auth.profile?.roles?.includes('oecs') && (
                <>
                  <hr className="my-2 border-white/10" />
                  <p className="px-4 py-1 text-xs font-semibold uppercase tracking-wider text-white/40">
                    Admin
                  </p>
                  <Link
                    to="/admin"
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      'flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-all',
                      isActive('/admin')
                        ? 'bg-ktip-sun-50 text-ktip-sun-800'
                        : 'text-white/80 hover:bg-white/10'
                    )}
                  >
                    <ShieldCheck size={18} />
                    <span>Admin</span>
                  </Link>
                </>
              )}

              {/* Mobile Auth Links */}
              <hr className="my-2 border-white/10" />
              {auth.user ? (
                <>
                  <Link
                    to="/dashboard"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg font-medium text-white/80 hover:bg-white/10"
                  >
                    <LayoutDashboard size={20} />
                    <span>My Dashboard</span>
                  </Link>
                  <Link
                    to="/settings"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg font-medium text-white/80 hover:bg-white/10"
                  >
                    <Settings size={20} />
                    <span>Settings</span>
                  </Link>
                  <Link
                    to="/grievances/my-reports"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg font-medium text-white/80 hover:bg-white/10"
                  >
                    <Flag size={20} />
                    <span>My Reports</span>
                  </Link>
                  <button
                    onClick={() => { setMobileMenuOpen(false); handleSignOut() }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium text-red-400 hover:bg-red-500/10"
                  >
                    <LogOut size={20} />
                    <span>Sign Out</span>
                  </button>
                </>
              ) : (
                <>
                  <Link
                    to="/login"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg font-medium text-white/80 hover:bg-white/10"
                  >
                    <LogIn size={20} />
                    <span>Log In</span>
                  </Link>
                  <Link
                    to="/signup"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg font-medium text-white hover:bg-white/10"
                  >
                    <User size={20} />
                    <span>Sign Up</span>
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
    </>
  )
}
