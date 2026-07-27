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
  HelpCircle,
  ClipboardList,
} from 'lucide-react'
import { Button } from '../ui/Button'
import { ROLE_LABELS, ROLE_COLORS } from '../../lib/constants'
import { cn, formatRelativeTime } from '../../lib/utils'
import { useNotifications, useMarkNotificationRead, useMarkAllRead } from '../../hooks/useNotifications'

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

// Top-level standalone links
const topLinks = [
  { name: 'Discover', href: '/', icon: Home },
  { name: 'Projects', href: '/projects', icon: FolderKanban },
  { name: 'Events', href: '/events', icon: Calendar },
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

export function Navbar() {
  const auth = useAuth()
  const toast = useToast()
  const location = useLocation()
  const navigate = useNavigate()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [notifOpen, setNotifOpen] = useState(false)

  // Notifications
  const { notifications, unreadCount, refetch: refetchNotifications } = useNotifications(auth.user?.id)
  const { markRead } = useMarkNotificationRead()
  const { markAllRead } = useMarkAllRead()

  const userMenuRef = useRef<HTMLDivElement>(null)
  const notifRef = useRef<HTMLDivElement>(null)
  const dropdownRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const handleSearch = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      navigate(`/projects?search=${encodeURIComponent(searchQuery.trim())}`)
      setSearchQuery('')
      setMobileMenuOpen(false)
    }
  }

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
    <nav
      className="bg-white/80 backdrop-blur-lg shadow-nav border-b border-ktip-sand-100/80 sticky top-0 z-40"
      style={{ paddingTop: '1rem', paddingBottom: '1rem' }}
    >
      <div className="w-full px-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center">
            <Link to="/" className="flex items-center gap-3 group">
              <img src="/pwa-512x512.png" alt="KTIP Logo" className="w-10 h-10 lg:w-14 lg:h-14 object-cover rounded-full shadow-soft group-hover:shadow-medium transition-shadow" />
              <div className="hidden sm:block">
                <h1 className="text-2xl font-display font-bold text-ktip-ocean-600">KTIP</h1>
                <p className="text-xs font-medium text-ktip-sand-500 tracking-wide">OECS INNOVATE & CONNECT</p>
              </div>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center gap-1">
            {/* Standalone links */}
            {topLinks.map((item) => (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all',
                  isActive(item.href)
                    ? 'bg-ktip-ocean-50 text-ktip-ocean-700'
                    : 'text-ktip-sand-600 hover:bg-ktip-sand-50 hover:text-ktip-sand-900'
                )}
              >
                <item.icon size={18} />
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
                    'flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all',
                    isDropdownActive(dropdown) || openDropdownId === dropdown.id
                      ? 'bg-ktip-ocean-50 text-ktip-ocean-700'
                      : 'text-ktip-sand-600 hover:bg-ktip-sand-50 hover:text-ktip-sand-900'
                  )}
                >
                  <dropdown.icon size={18} />
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
                    className="absolute left-0 mt-2 w-64 bg-white rounded-xl shadow-hard border border-ktip-sand-100 py-2 animate-scale-in z-50"
                  >
                    {dropdown.items.map((item) => (
                      <Link
                        key={item.name}
                        to={item.href}
                        onClick={() => setOpenDropdownId(null)}
                        className={cn(
                          'flex items-start gap-3 px-4 py-3 transition-colors',
                          isActive(item.href)
                            ? 'bg-ktip-ocean-50 text-ktip-ocean-700'
                            : 'text-ktip-sand-700 hover:bg-ktip-sand-50'
                        )}
                      >
                        <item.icon size={18} className="mt-0.5 shrink-0" />
                        <div>
                          <p className="font-medium">{item.name}</p>
                          <p className="text-xs text-ktip-sand-500 mt-0.5">{item.description}</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Admin link (OECS only) */}
            {auth.profile?.roles?.includes('oecs') && (
              <Link
                to="/admin"
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all',
                  isActive('/admin')
                    ? 'bg-pink-50 text-pink-700'
                    : 'text-ktip-sand-600 hover:bg-ktip-sand-50 hover:text-ktip-sand-900'
                )}
              >
                <ShieldCheck size={18} />
                <span>Admin</span>
              </Link>
            )}
          </div>

          {/* Search Bar (Desktop) */}
          <div className="hidden md:flex items-center flex-1 max-w-md mx-4">
            <div className="relative w-full">
              <Search
                size={20}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-ktip-sand-400"
              />
              <input
                type="text"
                placeholder="Search projects, events..."
                aria-label="Search projects and events"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.currentTarget.value)}
                onKeyDown={handleSearch}
                className="w-full pl-10 pr-4 py-2 border border-ktip-sand-200 bg-ktip-sand-50/50 focus:bg-white rounded-lg focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors"
              />
            </div>
          </div>

          {/* User Menu / Auth Buttons */}
          <div className="flex items-center gap-3">
            {/* Notification Bell */}
            {auth.user && (
              <div className="relative" ref={notifRef}>
                <button
                  onClick={() => setNotifOpen(!notifOpen)}
                  aria-label="Notifications"
                  className="relative p-2 rounded-lg hover:bg-ktip-sand-50 transition-colors text-ktip-sand-600"
                >
                  <Bell size={20} />
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>

                {notifOpen && (
                  <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-hard border border-ktip-sand-100 animate-scale-in z-50 max-h-96 flex flex-col">
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
                  className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-ktip-sand-50 transition-colors"
                >
                  <div className="hidden md:block text-right">
                    <p className="text-sm font-medium text-ktip-sand-900">
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
                    <div className="w-10 h-10 bg-gradient-to-br from-ktip-ocean-400 to-ktip-tropical-400 rounded-full flex items-center justify-center text-white font-medium shadow-soft">
                      {auth.profile?.display_name?.charAt(0).toUpperCase() || 'U'}
                    </div>
                  )}
                </button>

                {/* User Dropdown Menu */}
                {userMenuOpen && (
                  <div role="menu" className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-hard border border-ktip-sand-100 py-2 animate-scale-in">
                    <Link
                      to="/profile/me"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-2 text-ktip-sand-700 hover:bg-ktip-sand-50 transition-colors"
                    >
                      <User size={18} />
                      <span>My Profile</span>
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
                    <Button variant="ghost" size="sm" icon={<LogIn size={16} />}>
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
              className="lg:hidden p-2 rounded-lg hover:bg-ktip-sand-50"
            >
              {!mobileMenuOpen ? <Menu size={24} /> : <X size={24} />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="lg:hidden py-4 border-t border-ktip-sand-100 animate-slide-up">
            {/* Mobile Search */}
            <div className="mb-4 px-2">
              <div className="relative">
                <Search
                  size={20}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-ktip-sand-400"
                />
                <input
                  type="text"
                  placeholder="Search..."
                  aria-label="Search projects and events"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.currentTarget.value)}
                  onKeyDown={handleSearch}
                  className="w-full pl-10 pr-4 py-2 border border-ktip-sand-200 bg-ktip-sand-50/50 focus:bg-white rounded-lg focus:border-ktip-ocean-500 focus:outline-none"
                />
              </div>
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
                className="flex items-center justify-between px-4 py-3 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <FolderKanban size={18} />
                  <span className="font-semibold text-sm">Explore Projects</span>
                </div>
                <ChevronRight size={16} />
              </Link>
            </div>

            <hr className="my-2 mx-2 border-ktip-sand-100" />

            {/* Mobile Nav Links */}
            <div className="space-y-1 px-2">
              {/* Standalone links */}
              {topLinks.map((item) => (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-all',
                    isActive(item.href)
                      ? 'bg-ktip-ocean-50 text-ktip-ocean-700'
                      : 'text-ktip-sand-600 hover:bg-ktip-sand-50'
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
                    <p className="text-xs font-semibold uppercase tracking-wider text-ktip-sand-400">
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
                          ? 'bg-ktip-ocean-50 text-ktip-ocean-700'
                          : 'text-ktip-sand-600 hover:bg-ktip-sand-50'
                      )}
                    >
                      <item.icon size={20} />
                      <span>{item.name}</span>
                    </Link>
                  ))}
                </div>
              ))}

              {/* Admin link (OECS only) */}
              {auth.profile?.roles?.includes('oecs') && (
                <>
                  <hr className="my-2 border-ktip-sand-100" />
                  <p className="px-4 py-1 text-xs font-semibold uppercase tracking-wider text-ktip-sand-400">
                    Admin
                  </p>
                  <Link
                    to="/admin"
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      'flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-all',
                      isActive('/admin')
                        ? 'bg-pink-50 text-pink-700'
                        : 'text-ktip-sand-600 hover:bg-ktip-sand-50 hover:text-ktip-sand-900'
                    )}
                  >
                    <ShieldCheck size={18} />
                    <span>Admin</span>
                  </Link>
                </>
              )}

              {/* Mobile Auth Links */}
              <hr className="my-2 border-ktip-sand-100" />
              {auth.user ? (
                <>
                  <Link
                    to="/settings"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg font-medium text-ktip-sand-600 hover:bg-ktip-sand-50"
                  >
                    <Settings size={20} />
                    <span>Settings</span>
                  </Link>
                  <Link
                    to="/grievances/my-reports"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg font-medium text-ktip-sand-600 hover:bg-ktip-sand-50"
                  >
                    <Flag size={20} />
                    <span>My Reports</span>
                  </Link>
                  <button
                    onClick={() => { setMobileMenuOpen(false); handleSignOut() }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium text-red-600 hover:bg-red-50"
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
                    className="flex items-center gap-3 px-4 py-3 rounded-lg font-medium text-ktip-sand-600 hover:bg-ktip-sand-50"
                  >
                    <LogIn size={20} />
                    <span>Log In</span>
                  </Link>
                  <Link
                    to="/signup"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg font-medium text-ktip-ocean-600 hover:bg-ktip-ocean-50"
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
  )
}
