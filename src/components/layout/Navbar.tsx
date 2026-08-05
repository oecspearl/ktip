import { useEffect, useLayoutEffect, useRef, useState, type ComponentType, type KeyboardEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { LanguageSwitcher } from '../ui/LanguageSwitcher'
import { Trans, useLingui } from '@lingui/react/macro'
import { msg } from '@lingui/core/macro'
import { resolveCopy } from '../../i18n/copy'
import type { MessageDescriptor } from '@lingui/core'
import {
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
  HelpCircle,
  ClipboardList,
  LayoutDashboard,
  Inbox,
  Trophy,
  CalendarDays,
  CalendarPlus,
  FileText,
  Building2,
} from 'lucide-react'
import { Button } from '../ui/Button'
import { FlowingMenuItem } from '../ui/FlowingMenuItem'
import { DropdownPanel } from '../ui/DropdownPanel'
import { NavbarSearchPanel, SEARCH_PANEL_WIDTH } from './NavbarSearchPanel'
import { StaggeredMobileMenu, StaggeredMenuIcon } from './StaggeredMobileMenu'
import { RoleSwitcher } from './RoleSwitcher'
import { ROLE_LABELS } from '../../lib/constants'
import { isOrganizationAccount } from '../../lib/permissions'
import { cn, formatRelativeTime } from '../../lib/utils'
import { useNotifications, useMarkNotificationRead, useMarkAllRead } from '../../hooks/useNotifications'
import { useGlobalSearch } from '../../hooks/useGlobalSearch'
import type { SearchRow } from '../../lib/site-search'
import type { PermissionKey } from '../../types'
import { DiamondAvatar } from '../ui/DiamondAvatar'

interface DropdownItem {
  name: MessageDescriptor
  href: string
  icon: ComponentType<{ size?: number; className?: string }>
  description: MessageDescriptor
  /**
   * Hide this item unless the viewer can act on it. Absent means "always
   * shown". Signed-out visitors are handled by the caller, not here: a CTA
   * that routes to login is doing its job.
   */
  requires?: PermissionKey
}

interface NavDropdown {
  id: string
  name: MessageDescriptor
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
  { name: msg`Home`, href: '/', icon: Home },
  { name: msg`Projects`, href: '/projects', icon: FolderKanban },
]

/**
 * Standalone links rendered after the dropdowns. `span` and `iconOnly` are for
 * the mobile bento only — the desktop bar renders every one of these the same
 * way, but the mosaic needs a small tile in it or it is just rectangles.
 */
const trailingLinks = [
  { name: msg`Resources & Integrations`, href: '/resources', icon: BookOpen, span: 'col-span-2' },
  { name: msg`Help`, href: '/help', icon: HelpCircle, span: 'col-span-1', iconOnly: true },
]

/**
 * One nav item, shared by the standalone links, the dropdown triggers and the
 * admin link — they were four copies of the same string and had to be tuned
 * together anyway.
 *
 * The bar goes horizontal at lg (1024), where seven items plus the search and
 * the auth buttons have to fit in 1024px. At px-4 they did not, and without
 * whitespace-nowrap the longest label ("Resources & Integrations") broke onto
 * a second line and pushed the bar out of alignment. Padding therefore opens
 * up in steps rather than starting wide: tight at 1024, comfortable by 1536.
 */
const NAV_ITEM_CLASS =
  'flex items-center gap-2 whitespace-nowrap px-2 xl:px-3 2xl:px-4 py-2 text-label 2xl:text-body font-medium transition-all duration-200 hover:scale-110'

/**
 * The mobile drawer is a bento mosaic, not a list: four columns, tiles that
 * take two or four of them and come in three heights. Size is what separates a
 * category from a destination there, which is why the tiles carry almost no
 * icons — a 16px glyph in front of every row was doing no sorting at all and
 * made twenty rows look like one machine-made column.
 *
 * The column span cannot live here: each child of StaggeredMobileMenu is
 * wrapped in its own stagger element, so spans travel on a `data-span` prop
 * that the wrapper picks up. See that component.
 */
const BENTO_TILE_CLASS =
  'relative flex flex-col justify-end overflow-hidden rounded-2xl border p-3 transition-colors'
const BENTO_TILE_ACTIVE = 'border-ktip-nav-accent/40 bg-ktip-nav-accent/15 text-white'
/**
 * The glyph as a watermark rather than a bullet — bled off the bottom-right
 * corner, in the tile's own text colour, faint enough to read as texture.
 * Home and Projects had it; every tile carrying an icon now does, so the
 * mosaic stops mixing two ideas of what an icon is for.
 */
const BENTO_WATERMARK =
  'pointer-events-none absolute -bottom-1 -right-1 h-[68%] max-h-16 min-h-5 w-auto'
const BENTO_TILE_IDLE = 'border-white/10 bg-white/[0.04] text-white/85 hover:bg-white/[0.08]'

/**
 * The two auth tiles keep the soft-UI pair they had as buttons in the bar — a
 * white face and a navy one. Border-transparent is not cosmetic: neumorphism
 * states depth with the shadow pair, and an outline drawn over it reads as a
 * ring round the control. The drawer panel carries `neu-on-dark`, so the
 * highlight/shadow resolve for a dark backdrop (see index.css).
 *
 * Both skins are the ones Button.tsx already ships — `secondary` and the
 * `.btn-brand` pair — so the two controls flip with the theme exactly as their
 * counterparts in the bar do. Hard-coding white and navy here read fine by day
 * and left a glaring white slab on the black night-mode panel.
 */
const BENTO_TILE_LIGHT =
  'border-transparent bg-[var(--neu-surface)] text-ktip-sand-700 shadow-neu-sm hover:text-ktip-sand-900 hover:-translate-y-px active:translate-y-px active:shadow-neu-sm-inset'
const BENTO_TILE_BRAND =
  'border-transparent bg-brand-navy text-white shadow-neu-sm hover:bg-brand-green hover:text-brand-navy hover:-translate-y-px active:translate-y-px active:shadow-neu-sm-inset dark:bg-brand-green dark:text-brand-navy dark:hover:bg-brand-navy dark:hover:text-brand-green'

/**
 * Row span for an expanded category, keyed on its entry count (a header row
 * plus one per entry). Fixed at three, a five-entry group outgrew the rows it
 * had claimed while the tiles beside it ran out — the gap the mosaic could not
 * close. Written out because a computed `sm:row-span-${n}` generates nothing.
 */
const EXPANDED_ROWS: Record<number, string> = {
  3: 'sm:row-span-3',
  4: 'sm:row-span-4',
  5: 'sm:row-span-5',
}

/**
 * The width at which the drawer's mosaic pins an expanded category to its right
 * columns — Tailwind's `sm`, which on a phone means it is being held sideways.
 * Read in JS as well as CSS because the render ORDER of the categories changes
 * there, and order is not something a media query can express.
 */
const BENTO_PINNED_QUERY = '(min-width: 40rem)'

// Dropdown groups
const navDropdowns: NavDropdown[] = [
  {
    // Events moved out of leadingLinks when the virtual hackathon landed. A
    // dropdown trigger is a <button>, not a <Link>, so /events has to be the
    // first item or the listing becomes unreachable from the bar.
    id: 'events',
    name: msg`Events`,
    icon: Calendar,
    items: [
      { name: msg`All Events`, href: '/events', icon: Calendar, description: msg`Hackathons, workshops, meetups and conferences` },
      { name: msg`Virtual Hackathon`, href: '/hackathons', icon: Trophy, description: msg`Enter the live venue, find a team and build` },
      { name: msg`Event Calendar`, href: '/events?view=calendar', icon: CalendarDays, description: msg`Month-by-month view of what is scheduled` },
      { name: msg`Create an Event`, href: '/events/new', icon: CalendarPlus, description: msg`Publish an event and open registrations`, requires: 'event:create' },
      { name: msg`My Events`, href: '/dashboard/events', icon: LayoutDashboard, description: msg`Events you organise or registered for` },
    ],
  },
  {
    id: 'funding',
    name: msg`Funding`,
    icon: DollarSign,
    items: [
      { name: msg`Grants`, href: '/grants', icon: DollarSign, description: msg`Browse funding opportunities` },
      // A funding agency posts calls, it does not answer them — and a student
      // has to be sponsored rather than apply. Neither has an application to
      // track, so neither gets the entry.
      { name: msg`My Applications`, href: '/grants/my-applications', icon: ClipboardList, description: msg`Track your grant applications`, requires: 'grant:apply' },
      { name: msg`My Submissions`, href: '/dashboard/submissions', icon: Inbox, description: msg`Your copy of everything you submitted` },
    ],
  },
  {
    id: 'community',
    name: msg`Community`,
    icon: Users,
    items: [
      { name: msg`Directory`, href: '/directory', icon: Users, description: msg`Browse the member directory` },
      { name: msg`Forums`, href: '/forums', icon: MessageSquare, description: msg`Join community discussions` },
      { name: msg`Collaborate`, href: '/collaborate', icon: Handshake, description: msg`Work together in real-time` },
    ],
  },
]

export function Navbar() {
  const { i18n, t } = useLingui()
  const auth = useAuth()
  const toast = useToast()
  const location = useLocation()
  const navigate = useNavigate()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  // Which drawer accordion is open — one at a time, so the list stays short
  // enough that the account rows below it are reachable without a long scroll.
  const [mobileSection, setMobileSection] = useState<string | null>(null)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  // Signed-out, below sm only. See the trigger for why it exists at all.
  const [authMenuOpen, setAuthMenuOpen] = useState(false)
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)

  // Global search panel state (see NavbarSearchPanel + useGlobalSearch)
  const [aiMode, setAiMode] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null)
  const [mobileSearchFocused, setMobileSearchFocused] = useState(false)

  // Navbar is transparent over a page's hero; it takes a dark backdrop
  // wherever its white links would otherwise sit on the cream canvas — the
  // open mobile menu, admin, the venue pages, and past the first screen.
  // See `needsBackdrop` below.

  // Auto-hide on scroll down, reappear on scroll up or top-edge hover
  const [navHidden, setNavHidden] = useState(false)
  // Past the first screen the bar is over page content, not over a hero, so
  // white-on-nothing links stop being readable. Scrolling back up re-shows the
  // bar there, which is exactly when it needs a backdrop.
  const [scrolledPastHero, setScrolledPastHero] = useState(false)
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
      setScrolledPastHero(y > 120)
      lastScrollY.current = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  /**
   * Every navigation lands at the top (MainLayout scrolls there), so the bar is
   * over a hero again — but this component never remounts, and both flags above
   * are written *only* by the scroll listener. The scroll event that would
   * clear them arrives a frame late.
   *
   * Normally that costs one frame and nobody sees it. Under the route card
   * shuffle (routeTransitions.ts) the browser snapshots the incoming page in
   * exactly that frame, so the stale `bg-ktip-ink/85` + `border-ktip-line/60`
   * — a pure-black hairline — gets baked across the new page's hero and held
   * there for the whole 500ms animation, then vanishes when the live DOM is
   * revealed. That was the black line flickering across the header.
   *
   * useLayoutEffect, not useEffect: this has to be in the commit react-router
   * runs inside flushSync, ahead of the snapshot.
   */
  useLayoutEffect(() => {
    setNavHidden(false)
    setScrolledPastHero(false)
    lastScrollY.current = 0
  }, [location.pathname])

  /**
   * The roles this bar renders for.
   *
   * Switching context is meant to change what the account is doing, not just
   * which line is ticked in the menu — the dashboard rail has narrowed this way
   * since the switcher landed. Anything not actually held is ignored, so a stale
   * active_role cannot invent a context.
   */
  const heldRoles = auth.roles
  const effectiveRoles =
    auth.activeRole && heldRoles.includes(auth.activeRole) ? [auth.activeRole] : heldRoles

  // Organisation-tier accounts see a business profile where a person sees a CV.
  // A founder who is also a mentor keeps the CV — until they explicitly act as
  // the organisation, at which point the business profile is what they want.
  const isOrgAccount = isOrganizationAccount(effectiveRoles)

  // Mirrors AdminRoute exactly. Kept as one value so the desktop bar and the
  // mobile menu can never drift apart.
  const canSeeAdmin = auth.can('org:manage') || auth.can('moderation:view')

  /**
   * Dropdown entries this viewer can act on.
   *
   * Signed-out visitors keep every CTA — those route to login, which is the
   * point. An entry is hidden only for a signed-in member whose role cannot
   * use it, where the link would dead-end at a denial. Same rule the
   * "Become a Contributor" button already used for project:create.
   */
  const visibleItems = (dropdown: NavDropdown) =>
    dropdown.items.filter((item) => !item.requires || !auth.user || auth.can(item.requires))

  // A group whose every entry was filtered out is a trigger that opens an empty
  // panel, so it does not get rendered at all.
  const visibleDropdowns = navDropdowns
    .map((dropdown) => ({ ...dropdown, items: visibleItems(dropdown) }))
    .filter((dropdown) => dropdown.items.length > 0)

  const anyMenuOpen =
    mobileMenuOpen || userMenuOpen || notifOpen || authMenuOpen || openDropdownId !== null
  const hidden = navHidden && !anyMenuOpen

  /**
   * Publish where the bar's bottom edge actually is.
   *
   * A surface that sticks *to the navbar* — the venue's own top bar is the one
   * that does — cannot read `--nav-h`, because that is the bar's height whether
   * or not the bar is on screen. When it slides away, anything holding that
   * offset is left floating in the middle of the page.
   */
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--nav-offset', hidden ? '0px' : 'var(--nav-h)')
    return () => {
      root.style.removeProperty('--nav-offset')
    }
  }, [hidden])

  // Notifications
  const { notifications, unreadCount, refetch: refetchNotifications } = useNotifications(auth.user?.id)
  const { markRead } = useMarkNotificationRead()
  const { markAllRead } = useMarkAllRead()

  const userMenuRef = useRef<HTMLDivElement>(null)
  const authMenuRef = useRef<HTMLDivElement>(null)
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
    if (!(userMenuOpen || mobileMenuOpen || openDropdownId || notifOpen || authMenuOpen)) return

    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setUserMenuOpen(false)
        setMobileMenuOpen(false)
        setOpenDropdownId(null)
        setNotifOpen(false)
        setAuthMenuOpen(false)
      }
    }

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (userMenuRef.current && !userMenuRef.current.contains(target)) {
        setUserMenuOpen(false)
      }
      if (authMenuRef.current && !authMenuRef.current.contains(target)) {
        setAuthMenuOpen(false)
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
  }, [userMenuOpen, mobileMenuOpen, openDropdownId, notifOpen, authMenuOpen])

  const isActive = (href: string) => {
    if (href === '/') return location.pathname === '/'
    return location.pathname.startsWith(href)
  }

  // Every nav link is white, which only works over the full-bleed dark hero the
  // public pages put behind this bar. Admin pages use `<PageHero inset>`, whose
  // hero starts BELOW the bar — leaving white text on the cream canvas. Same for
  // the venue pages, which render straight onto the canvas with no hero at all.
  // And once any page is scrolled past its hero the bar is over body content.
  // All of those get the same dark backdrop the open mobile menu already uses.
  const noHeroBehindBar =
    location.pathname.startsWith('/admin') ||
    location.pathname.startsWith('/cv') ||
    /^\/user\/[^/]+\/cv$/.test(location.pathname) ||
    location.pathname.startsWith('/events/virtual-hackathon/') ||
    /^\/events\/[^/]+\/venue/.test(location.pathname)
  const needsBackdrop = noHeroBehindBar || scrolledPastHero

  const isDropdownActive = (dropdown: NavDropdown) =>
    dropdown.items.some((item) => isActive(item.href))

  const toggleDropdown = (id: string) => {
    setOpenDropdownId(openDropdownId === id ? null : id)
  }

  // Signed-out visitors keep the contributor tile — it routes to login, which
  // is the point. Hidden only for members whose role cannot create a project.
  const canCreateProject = !auth.user || auth.can('project:create')

  /**
   * A category is open, so the rest of the mosaic gives up its space for it.
   * Every tall tile drops to one row and every half-tile to a quarter, which
   * frees the two right-hand columns for the expanded card and leaves the
   * shrunken ones packing themselves around it (the grid flows dense).
   *
   * Only from sm up. On a portrait phone the columns are ~90px, which is not a
   * label — there the expanded card takes the full width instead and nothing
   * else has to move.
   */
  const bentoCompact = mobileSection !== null

  /**
   * Is the drawer wide enough to pin an expanded category to the right columns
   * (Tailwind `sm` — a phone held sideways)? Tracked in state because the
   * category render ORDER depends on it, and order is a DOM concern that no
   * media query can reach.
   */
  const [bentoPinned, setBentoPinned] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(BENTO_PINNED_QUERY).matches
  )
  useEffect(() => {
    const query = window.matchMedia(BENTO_PINNED_QUERY)
    const sync = () => setBentoPinned(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  /**
   * Pinned layout renders the open category FIRST.
   *
   * The card places itself at column 3, but only in the first row where columns
   * 3 and 4 are both still free — so with Community open, Events and Funding had
   * already taken that row and the card started one row lower than it does for
   * the other two. Same markup, different-looking expansion. Hoisting the open
   * one to the front of the list gives every category the same top edge, and the
   * collapsed squares backfill the columns beside it.
   *
   * Portrait keeps source order: there the card is full width and hoisting it
   * would just shuffle the list under the reader.
   */
  const orderedDropdowns =
    bentoPinned && mobileSection
      ? [...visibleDropdowns].sort(
          (a, b) => Number(b.id === mobileSection) - Number(a.id === mobileSection)
        )
      : visibleDropdowns

  /**
   * Compact spans, and the rule behind them: exactly two tiles stay two columns
   * wide, everything else becomes a square.
   *
   * A dense grid backfills a hole only with something that FITS it, so a
   * one-column hole and a two-column tile is a pair that can never resolve —
   * that is what dropped Sign Up onto a row of its own and left the empty block
   * beside the expanded card. Squares fit anywhere, so the only wide tiles left
   * are Home and the contributor CTA, both of which land in the first row where
   * there is still a full row to take.
   */
  const TALL_TILE_SPAN = bentoCompact
    ? 'col-span-2 row-span-2 sm:row-span-1'
    : 'col-span-2 row-span-2'
  const HALF_TILE_SPAN = bentoCompact
    ? 'col-span-2 row-span-2 sm:col-span-1 sm:row-span-1'
    : 'col-span-2 row-span-2'
  const WIDE_TILE_SPAN = bentoCompact ? 'col-span-4 sm:col-span-2' : 'col-span-4'
  const SQUARE_TILE_SPAN = bentoCompact ? 'col-span-2 sm:col-span-1' : 'col-span-2'
  // A square has room for one thing; two columns has room for a label and a
  // glyph. Same tile, told which it is.
  // A square is ~86px wide on a phone: tile labels come down a step and
  // truncate there, or 'Community' paints over its own edge.
  const BENTO_LABEL_CLASS = bentoCompact
    ? 'min-w-0 truncate text-xs font-semibold'
    : 'text-base font-semibold'
  const BENTO_ACCOUNT_TILE = bentoCompact
    ? 'h-full min-h-13 items-center justify-center text-center'
    : 'h-full min-h-13 flex-row items-center justify-between gap-2'

  /**
   * Opening the drawer expands whichever section holds the current route, so
   * it opens showing where you already are rather than fully collapsed. Keyed
   * on the open flag alone: reopening on the same page should re-expand that
   * section even if it was collapsed by hand last time.
   */
  useEffect(() => {
    if (!mobileMenuOpen) return
    const current = navDropdowns.find((dropdown) =>
      dropdown.items.some((item) => isActive(item.href))
    )
    setMobileSection(current?.id ?? null)
    // isActive reads location.pathname, which cannot change while the drawer
    // is opening — a navigation closes it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mobileMenuOpen])

  const handleSignOut = async () => {
    try {
      await auth.signOut()
      toast.success(t`Signed out successfully`)
    } catch (error) {
      toast.error(t`Failed to sign out`)
    }
  }

  return (
    <>
    {/* Hover zone to reveal the hidden navbar */}
    {hidden && (
      <div
        className="fixed top-0 inset-x-0 h-4 z-nav"
        onMouseEnter={() => setNavHidden(false)}
      />
    )}
    <nav
      onMouseEnter={() => setNavHidden(false)}
      /* data-app-navbar: pinned outside the route card shuffle via a
         view-transition-name in index.css, alongside the FAB and panels. An
         earlier attempt at this was reverted for artifacts, but both came
         from mechanics that no longer exist: the old card then receded with
         a scale() (sliding its navbar-hole out from under the static bar —
         the card now holds still) and the incoming card carried a drop
         shadow that swept through the translucent bar (removed since). The
         remaining trade-off is that during the slide the glass bar sits over
         the transition backdrop rather than live hero pixels. */
      data-app-navbar
      className={cn(
        // The bar row is exactly --nav-h (set on the row below, so the mobile
        // menu can still expand past it). Height used to be whatever the logo
        // plus inline padding happened to add up to, which meant every page
        // guessed its own clearance — see the token's note in index.css.
        // neu-on-dark: the bar is navy glass over hero photography, so every
        // control in it needs the dark-backdrop soft-UI pair — the light one
        // paints a white ring instead of a highlight. See index.css.
        'neu-on-dark top-0 z-nav transition-all duration-300 fixed inset-x-0',
        hidden ? '-translate-y-full' : 'translate-y-0',
        mobileMenuOpen || needsBackdrop
          ? 'bg-ktip-ink/85 backdrop-blur-lg border-b border-ktip-line/60'
          : 'bg-transparent border-b border-transparent'
      )}
    >
      <div className="w-full px-4">
        <div className="flex items-center h-[var(--nav-h)]">
          {/* Logo */}
          <div className="flex items-center shrink-0">
            <Link to="/" className="flex items-center gap-3 group">
              <img src="/ktip-logo-128.webp" alt="KTiP" width={56} height={56} decoding="async" className="w-10 h-10 lg:w-14 lg:h-14 object-contain" />
              {/* The wordmark yields to the links in the one band where both
                  do not fit. Below lg the horizontal nav is not rendered at
                  all (the mobile menu is), so the wordmark has the bar to
                  itself; from lg to xl the seven links, the search and the
                  auth buttons need every pixel; at xl it comes back. */}
              {/* The wordmark yields to the links in the one band where both
                  do not fit. Below lg the horizontal nav is not rendered at
                  all (the mobile menu is), so the wordmark has the bar to
                  itself; from lg to xl the seven links, the search and the
                  auth buttons need every pixel; at xl it comes back.
                  It used to be hidden below sm as well, which left a phone
                  showing a bare logo where a tablet showed the brand. */}
              <div className="block lg:hidden xl:block">
                <h1 className="text-title-sm sm:text-title font-display font-bold whitespace-nowrap text-white">
                  {/* "OECS" drops on the narrowest phones. The bar has to fit a
                      logo, the wordmark, the language globe, the Log In / Sign
                      Up button and the menu icon; at 320–360px the full
                      wordmark is what pushes the button past the right edge.
                      The initialism alone still identifies the product, and it
                      is the half people say out loud. 400px rather than a
                      standard breakpoint because that is where it actually
                      stops fitting — `sm` is 640 and would strip the name off
                      tablets that have room for it. */}
                  <span className="hidden min-[400px]:inline">{'OECS '}</span>KTIP
                </h1>
              </div>
            </Link>
          </div>

          {/* Desktop Navigation — sits directly against the wordmark. It used
              to carry ml-auto, which pushed the whole set to the right and
              left a wide empty run after the logo; the free space now
              collects on the search side instead. */}
          {/* Links yield to the open search box.
              A 544px input plus seven links does not fit in a 1280px bar, and
              the alternative — letting the input take what is left — is what
              made it narrower than its own results panel. The links are not
              lost while it is open: Escape, an outside click or a result all
              close the search and bring them straight back, and the same links
              are in the mobile drawer regardless.

              Collapsed to zero width rather than faded in place: the space has
              to be GIVEN UP, not just vacated visually. Seven links plus a
              544px input plus the auth buttons is wider than a 1280px bar, so
              links that keep their box would push the search off the end —
              which is the same squeeze that made it narrow in the first place.

              Animated to 0 rather than `display:none` because the search box is
              growing across this exact space at the same time; cutting one
              instantly while the other travels for 300ms reads as a jump. The
              duration is deliberately shorter than the box's, so the room is
              free before the box arrives to use it.

              aria-hidden + inert so nothing clipped stays reachable by tab or
              screen reader. Nothing is lost either way — Escape, an outside
              click or picking a result all bring the links straight back. */}
          <div
            aria-hidden={searchOpen}
            inert={searchOpen ? true : undefined}
            className={cn(
              'hidden lg:flex items-center gap-1 overflow-hidden transition-all duration-200',
              searchOpen
                ? 'ml-0 max-w-0 opacity-0 pointer-events-none'
                : 'ml-4 xl:ml-8 max-w-full opacity-100'
            )}
          >
            {/* Standalone links */}
            {leadingLinks.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  NAV_ITEM_CLASS,
                  isActive(item.href)
                    ? 'text-white underline decoration-ktip-nav-accent decoration-2 underline-offset-8'
                    : 'text-white/80 hover:text-ktip-nav-accent'
                )}
              >
                <span>{i18n._(item.name)}</span>
              </Link>
            ))}

            {/* Dropdown menus */}
            {visibleDropdowns.map((dropdown) => (
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
                    NAV_ITEM_CLASS,
                    isDropdownActive(dropdown) || openDropdownId === dropdown.id
                      ? 'text-white underline decoration-ktip-nav-accent decoration-2 underline-offset-8'
                      : 'text-white/80 hover:text-ktip-nav-accent'
                  )}
                >
                  <span>{i18n._(dropdown.name)}</span>
                  <ChevronDown
                    size={14}
                    className={cn(
                      'transition-transform duration-200',
                      openDropdownId === dropdown.id && 'rotate-180'
                    )}
                  />
                </button>

                <DropdownPanel
                  open={openDropdownId === dropdown.id}
                  role="menu"
                  className="absolute right-0 mt-2 w-64 origin-top-right bg-ktip-cream rounded-xl shadow-hard overflow-hidden z-dropdown"
                >
                  {dropdown.items.map((item) => (
                    <FlowingMenuItem
                      key={item.href}
                      to={item.href}
                      label={i18n._(item.name)}
                      onClick={() => setOpenDropdownId(null)}
                      className={cn(
                        'flex items-start justify-end gap-3 px-4 py-3 transition-colors',
                        isActive(item.href)
                          ? 'bg-ktip-ocean-50 text-ktip-ocean-700'
                          : 'text-ktip-sand-700'
                      )}
                    >
                      <div className="text-right">
                        <p className="font-medium">{i18n._(item.name)}</p>
                        <p className="text-xs text-ktip-sand-500 mt-0.5">{i18n._(item.description)}</p>
                      </div>
                    </FlowingMenuItem>
                  ))}
                </DropdownPanel>
              </div>
            ))}

            {/* Trailing standalone links */}
            {trailingLinks.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  NAV_ITEM_CLASS,
                  isActive(item.href)
                    ? 'text-white underline decoration-ktip-nav-accent decoration-2 underline-offset-8'
                    : 'text-white/80 hover:text-ktip-nav-accent'
                )}
              >
                <span>{i18n._(item.name)}</span>
              </Link>
            ))}

            {/* Admin link. Capability, not slug — this has to agree with
                AdminRoute, which admits org:manage OR moderation:view. Testing
                the legacy 'oecs' slug hid the link from every admin created
                after 063, including safety admins, while leaving them able to
                reach /admin by typing it. */}
            {canSeeAdmin && (
              <Link
                to="/admin"
                className={cn(
                  NAV_ITEM_CLASS,
                  isActive('/admin')
                    ? 'text-white underline decoration-ktip-sun-400 decoration-2 underline-offset-8'
                    : 'text-white/80 hover:text-ktip-nav-accent'
                )}
              >
                <span><Trans>Admin</Trans></span>
              </Link>
            )}
          </div>

          {/* Search (Desktop) — collapsed to an icon, expands on click.
              The results panel is a sibling of the animating wrapper so the
              wrapper's overflow-hidden (needed for the width transition)
              cannot clip it. */}
          <div
            ref={searchRef}
            className={cn(
              // ml-auto is what holds the links against the logo: it absorbs
              // every spare pixel here, so the search and the auth buttons sit
              // at the right edge and the nav does not drift toward centre.
              'relative hidden md:flex items-center justify-end ml-auto mr-2 xl:mr-4',
              // Collapsed it is a 40px icon, but it was still claiming flex-1
              // up to max-w-md — nearly 450px of the bar reserved for nothing,
              // which is what squeezed the links at 1024 and 1280. It only
              // takes the space once it is actually open.
              //
              // Open, it is exactly the results panel's width rather than
              // `flex-1 max-w-md`: at 448px against the panel's 544px the panel
              // overhung the box that opened it on the left, so the input read
              // as a separate control sitting on top of a wider surface. Same
              // constant on both, so they cannot drift. Room for it comes from
              // the links, which step aside below.
              searchOpen ? cn('shrink-0', SEARCH_PANEL_WIDTH) : 'shrink-0'
            )}
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
                    placeholder={t`Search pages, features, people...`}
                    aria-label={t`Search the whole platform`}
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
                  aria-label={t`Open search`}
                  title={t`Search (${SHORTCUT_HINT})`}
                  className="p-2 transition-all duration-200 text-white/80 hover:text-ktip-nav-accent hover:scale-125"
                >
                  <Search size={20} />
                </button>
              )}
            </div>

            <NavbarSearchPanel
              open={searchOpen}
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
          </div>

          {/* User Menu / Auth Buttons.
              The spare width is absorbed by the search container from md up,
              but that container is display:none below md — so on a phone the
              buttons ended up against the wordmark with the gap after them.
              Below md this block takes the auto margin instead. */}
          <div className="flex items-center gap-3 shrink-0 ml-auto md:ml-0">
            {/* Language. Beside the bell rather than inside the account menu,
                because a visitor who is not signed in has no account menu — and
                a francophone arriving on a public page is exactly who needs to
                find this. Icon-only here; the footer copy carries the code. */}
            <LanguageSwitcher direction="down" compact />

            {/* Notification Bell */}
            {auth.user && (
              <div className="relative" ref={notifRef}>
                <button
                  onClick={() => setNotifOpen(!notifOpen)}
                  aria-label={t`Notifications`}
                  className="relative p-2 transition-all duration-200 text-white/80 hover:text-ktip-nav-accent hover:scale-125"
                >
                  <Bell size={20} />
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>

                <DropdownPanel
                  open={notifOpen}
                  className="absolute right-0 mt-2 w-80 origin-top-right bg-ktip-cream rounded-xl shadow-hard border border-ktip-sand-100 z-dropdown max-h-96 flex flex-col"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-ktip-sand-100">
                      <h3 className="text-sm font-semibold text-ktip-sand-800"><Trans>Notifications</Trans></h3>
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
                          <Trans>Mark all read</Trans>
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
                          <p className="text-sm text-ktip-sand-500"><Trans>No notifications yet</Trans></p>
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
                      <Trans>View all invitations</Trans>
                    </Link>
                </DropdownPanel>
              </div>
            )}

            {auth.user ? (
              /* User Avatar & Dropdown */
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  aria-label={t`User menu`}
                  aria-expanded={userMenuOpen}
                  aria-haspopup="true"
                  className="group flex items-center gap-3 px-3 py-2 transition-all duration-200 hover:scale-110"
                >
                  <div className="hidden md:block text-right">
                    <p className="text-sm font-medium text-white transition-colors group-hover:text-ktip-nav-accent">
                      {auth.profile?.display_name || t`User`}
                    </p>
                    {/* The context being acted in, not whichever role happens to
                        sit first in the array — on a multi-role account those
                        are different answers, and the first one is arbitrary. */}
                    {effectiveRoles[0] && (
                      /* max-w + truncate: French and Spanish role names run
                         ~2× the English width ("Inversionista/Agencia de
                         financiamiento"), and without a cap the whole block
                         widens and shoves the avatar off the viewport edge.
                         The full label is in the title and in the menu. */
                      <p
                        className="max-w-[11rem] truncate text-[10px] font-semibold uppercase tracking-[0.25em] text-white/60 mt-0.5"
                        title={resolveCopy(i18n, ROLE_LABELS[effectiveRoles[0]])}
                      >
                        {resolveCopy(i18n, ROLE_LABELS[effectiveRoles[0]])}
                      </p>
                    )}
                  </div>
                  <DiamondAvatar
                    src={auth.profile?.avatar_url}
                    name={auth.profile?.display_name || 'User'}
                    size={40}
                    colorClass="bg-gradient-to-br from-ktip-ocean-600 to-ktip-tropical-700"
                    frameClassName="shadow-soft"
                  />
                </button>

                {/* User Dropdown Menu */}
                <DropdownPanel
                  open={userMenuOpen}
                  role="menu"
                  className="absolute right-0 mt-2 w-56 origin-top-right bg-ktip-cream rounded-xl shadow-hard border border-ktip-sand-100 py-2"
                >
                    <RoleSwitcher onSwitch={() => setUserMenuOpen(false)} />
                    <Link
                      to="/dashboard"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-2 text-ktip-sand-700 hover:bg-ktip-sand-50 transition-colors"
                    >
                      <LayoutDashboard size={18} />
                      <span><Trans>My Dashboard</Trans></span>
                    </Link>
                    {/* /cv had no entry point anywhere in the app — the only way
                        in was the Virtual Campus handoff redirect. It is a
                        person's résumé, so an organisation account gets its
                        business profile here instead. */}
                    {isOrgAccount ? (
                      <Link
                        to="/dashboard/business"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-2 text-ktip-sand-700 hover:bg-ktip-sand-50 transition-colors"
                      >
                        <Building2 size={18} />
                        <span><Trans>Business profile</Trans></span>
                      </Link>
                    ) : (
                      <Link
                        to="/dashboard/profile"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-2 text-ktip-sand-700 hover:bg-ktip-sand-50 transition-colors"
                      >
                        <FileText size={18} />
                        <span><Trans>My CV</Trans></span>
                      </Link>
                    )}
                    <Link
                      to="/settings"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-2 text-ktip-sand-700 hover:bg-ktip-sand-50 transition-colors"
                    >
                      <Settings size={18} />
                      <span><Trans>Settings</Trans></span>
                    </Link>
                    <Link
                      to="/grievances/my-reports"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-2 text-ktip-sand-700 hover:bg-ktip-sand-50 transition-colors"
                    >
                      <Flag size={18} />
                      <span><Trans>My Reports</Trans></span>
                    </Link>
                    <Link
                      to="/help"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-2 text-ktip-sand-700 hover:bg-ktip-sand-50 transition-colors"
                    >
                      <HelpCircle size={18} />
                      <span><Trans>Help Center</Trans></span>
                    </Link>
                    <hr className="my-2 border-ktip-sand-100" />
                    <button
                      onClick={handleSignOut}
                      className="w-full flex items-center gap-3 px-4 py-2 text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <LogOut size={18} />
                      <span><Trans>Sign Out</Trans></span>
                    </button>
                </DropdownPanel>
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
                      <Trans>Log In</Trans>
                    </Button>
                  </Link>
                  <Link to="/signup">
                    <Button size="sm"><Trans>Sign Up</Trans></Button>
                  </Link>
                </div>
                {/* Below sm only one control fits beside the wordmark. It used
                    to be Sign Up alone, which reads as "there is no way in from
                    here" to anyone who already has an account — Log In was real
                    but buried behind the hamburger, and a returning member has
                    no reason to look for it inside a navigation menu. One
                    trigger naming both, opening a panel that offers each, keeps
                    the width and stops hiding half the door.

                    Same disclosure machinery as the user menu above: the panel
                    animates both ways via DropdownPanel, and the shared
                    Escape/outside-click effect closes it. */}
                <div className="relative sm:hidden" ref={authMenuRef}>
                  <Button
                    size="sm"
                    onClick={() => setAuthMenuOpen((open) => !open)}
                    aria-expanded={authMenuOpen}
                    aria-haspopup="menu"
                  >
                    <Trans>Log In / Sign Up</Trans>
                  </Button>

                  <DropdownPanel
                    open={authMenuOpen}
                    role="menu"
                    className="absolute right-0 mt-2 w-44 origin-top-right bg-ktip-cream rounded-xl shadow-hard border border-ktip-sand-100 p-2 flex flex-col gap-2"
                  >
                    {/* Full-width so each is a comfortable target on a phone,
                        and ordered the way the trigger reads. */}
                    <Link to="/login" onClick={() => setAuthMenuOpen(false)} role="menuitem">
                      <Button variant="secondary" size="sm" fullWidth icon={<LogIn size={16} />}>
                        <Trans>Log In</Trans>
                      </Button>
                    </Link>
                    <Link to="/signup" onClick={() => setAuthMenuOpen(false)} role="menuitem">
                      <Button size="sm" fullWidth icon={<User size={16} />}>
                        <Trans>Sign Up</Trans>
                      </Button>
                    </Link>
                  </DropdownPanel>
                </div>
              </>
            )}

            {/* Mobile Menu Button. The drawer paints over this corner once it
                is open and carries the matching close control in the same
                spot — see StaggeredMobileMenu. */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? t`Close menu` : t`Open menu`}
              aria-expanded={mobileMenuOpen}
              className="lg:hidden p-2 rounded-lg text-white hover:bg-white/10"
            >
              <StaggeredMenuIcon open={mobileMenuOpen} />
            </button>
          </div>
        </div>

      </div>
    </nav>

    {/* Mobile Navigation.
        This used to be a block expanded inline under the bar: it inherited the
        bar's translucency (hero photography read straight through the rows),
        and being inside a position:fixed bar it had no height of its own to
        scroll against. It is an off-canvas drawer now — opaque, scroll-locked,
        and staggered in. Each direct child below is one stagger unit. */}
    <StaggeredMobileMenu
      open={mobileMenuOpen}
      onClose={() => setMobileMenuOpen(false)}
      label={t`Menu`}
      closeLabel={t`Close menu`}
      /* Dense flow so a 1×1 square backfills the hole a 2-wide tile leaves,
         which is what makes the lower half read as a mosaic rather than a
         column with gaps. Rows are a floor, not a fixed height — a tile that
         needs more (an expanded category) grows its row. */
      bodyClassName="grid grid-cols-4 content-start gap-2 px-3 auto-rows-[minmax(3.25rem,auto)] [grid-auto-flow:row_dense] landscape-short:grid-cols-6 landscape-short:auto-rows-[minmax(2.75rem,auto)]"
      layoutKey={mobileSection}
      expanded={mobileSection !== null}
      brand={
        <Link
          to="/"
          onClick={() => setMobileMenuOpen(false)}
          className="flex items-center gap-2"
        >
          <img
            src="/ktip-logo-128.webp"
            alt=""
            width={40}
            height={40}
            decoding="async"
            className="h-9 w-9 object-contain"
          />
          <span className="font-display text-title-sm font-bold text-white">OECS KTIP</span>
        </Link>
      }
    >
    {/* Search — the one full-bleed row; everything under it is bento. */}
    <div data-span="col-span-4 landscape-short:col-span-6" className="pb-1">
      <div className="relative">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
        <input
          type="text"
          placeholder={t`Search`}
          aria-label={t`Search the whole platform`}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.currentTarget.value)}
          onKeyDown={handleSearch}
          onFocus={() => setMobileSearchFocused(true)}
          className="w-full rounded-2xl border border-white/10 bg-white/[0.05] py-3 pl-11 pr-4 text-sm text-white placeholder-white/40 transition-colors focus:border-ktip-nav-accent/50 focus:bg-white/[0.09] focus:outline-none"
        />
      </div>
      <NavbarSearchPanel
        open={Boolean(mobileSearchFocused || searchQuery.trim())}
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
    </div>

    {/* The two destinations that are not a category — half-tiles, so the eye
        gets a size difference to read before it gets to any label. */}
    {leadingLinks.map((item, index) => (
      <Link
        key={item.href}
        to={item.href}
        data-span={index === 0 ? TALL_TILE_SPAN : HALF_TILE_SPAN}
        onClick={() => setMobileMenuOpen(false)}
        className={cn(BENTO_TILE_CLASS, 'h-full', isActive(item.href) ? BENTO_TILE_ACTIVE : BENTO_TILE_IDLE)}
      >
        {/* The glyph is a watermark, not a bullet. Every row carrying its own
            small icon was what made this read as a generated list. */}
        <item.icon size={44} className={cn(BENTO_WATERMARK, 'opacity-[0.09]')} />
        <span className={BENTO_LABEL_CLASS}>{i18n._(item.name)}</span>
      </Link>
    ))}

    {/* Category cards. Collapsed they are half-tiles in the mosaic; expanded
        one takes the full row and its entries drop out underneath on an indent
        rail, so a child never sits at the same level as its parent — which is
        what the flat run of rows could not say. One open at a time. */}
    {orderedDropdowns.map((dropdown) => {
      const expanded = mobileSection === dropdown.id
      const groupActive = isDropdownActive(dropdown)
      // A header row plus one per entry, inside the range Tailwind ships
      const rowSpan = EXPANDED_ROWS[Math.min(Math.max(dropdown.items.length + 1, 3), 5)]
      return (
        <div
          key={dropdown.id}
          data-span={
            expanded
              ? cn(
                  'col-span-4 sm:col-start-3 sm:col-span-2 landscape-short:col-start-5 landscape-short:col-span-2',
                  rowSpan
                )
              : HALF_TILE_SPAN
          }
          className={cn(
            'h-full min-w-0 overflow-hidden rounded-2xl border transition-colors',
            expanded || groupActive
              ? 'border-ktip-nav-accent/30 bg-ktip-nav-accent/[0.07]'
              : 'border-white/10 bg-white/[0.04]'
          )}
        >
          <button
            type="button"
            onClick={() => setMobileSection(expanded ? null : dropdown.id)}
            aria-expanded={expanded}
            className={cn(
              'relative flex w-full items-center gap-2 px-4 text-left',
              expanded
                ? 'h-14'
                : bentoCompact
                  ? 'h-full items-center pb-0'
                  : 'h-full items-end pb-3 landscape-short:items-center landscape-short:pb-0'
            )}
          >
            {!expanded && (
              <dropdown.icon size={44} className={cn(BENTO_WATERMARK, 'opacity-[0.12]')} />
            )}
            <span className={cn('flex-1 text-white', expanded ? 'text-base font-semibold' : BENTO_LABEL_CLASS)}>
              {i18n._(dropdown.name)}
            </span>
            <ChevronDown
              size={16}
              className={cn(
                'shrink-0 text-white/45 transition-transform duration-300',
                expanded && 'rotate-180'
              )}
            />
          </button>

          {/* grid-rows 0fr → 1fr collapses to the content's own height without
              anyone having to measure it, and animates where max-height would
              either clip or lag. */}
          <div
            className={cn(
              'grid transition-[grid-template-rows] duration-300 ease-out',
              expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
            )}
          >
            <div className="min-h-0 overflow-hidden">
              {/* The entries are their own small bento inside the parent card:
                  the drawer goes full-screen while a category is open, and a
                  single column of five links across that width is mostly empty
                  space. The rail on the left is what keeps them reading as
                  children of the card rather than as tiles of the mosaic. */}
              <div className="ml-6 grid grid-cols-2 gap-1.5 border-l border-white/15 pb-3 pl-3 pr-3 sm:grid-cols-1 landscape-short:grid-cols-1">
                {dropdown.items.map((item) => (
                  <Link
                    key={item.href}
                    to={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      'flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-sm transition-colors',
                      isActive(item.href)
                        ? 'bg-white/10 font-medium text-white'
                        : 'bg-white/[0.03] text-white/65 hover:bg-white/[0.08] hover:text-white'
                    )}
                  >
                    <span className="truncate">{i18n._(item.name)}</span>
                    {isActive(item.href) && (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ktip-nav-accent" aria-hidden="true" />
                    )}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      )
    })}

    {/* The contributor CTA gets the one full-width tile and the only saturated
        surface in the drawer. Signed-out visitors keep it — it routes them to
        login, which is the point. Hidden only for members whose role cannot
        create a project, where it would dead-end at a denial. */}
    {canCreateProject && (
      <Link
        to="/projects/new"
        data-span={WIDE_TILE_SPAN}
        onClick={() => setMobileMenuOpen(false)}
        className={cn(
          BENTO_TILE_CLASS,
          'h-full min-h-14 landscape-short:h-12 flex-row items-center justify-between gap-2 border-ktip-tropical-500/30 bg-gradient-to-br from-ktip-tropical-500/25 to-ktip-tropical-500/[0.06] text-white'
        )}
      >
        <span className={cn('truncate', BENTO_LABEL_CLASS)}><Trans>Become a Contributor</Trans></span>
        <Zap size={44} className={cn(BENTO_WATERMARK, 'text-ktip-tropical-500 opacity-[0.35]')} />
      </Link>
    )}

    {/* Trailing links and the grants listing, at the mosaic's two smallest
        sizes. The 1×1 squares are what stop the lower half from being a stack
        of identical rectangles — they carry the glyph alone, with the label on
        the accessible name rather than in the tile. */}
    {trailingLinks.map((item) => (
      <Link
        key={item.href}
        to={item.href}
        data-span={item.span === 'col-span-1' ? item.span : SQUARE_TILE_SPAN}
        title={item.iconOnly || bentoCompact ? i18n._(item.name) : undefined}
        aria-label={item.iconOnly || bentoCompact ? i18n._(item.name) : undefined}
        onClick={() => setMobileMenuOpen(false)}
        className={cn(
          BENTO_TILE_CLASS,
          'h-full min-h-13',
          // "Resources & Integrations" has nowhere to go in one column, so the
          // compact tile is the glyph and the name lives on the accessible name
          item.iconOnly || bentoCompact
            ? 'items-center justify-center'
            : 'flex-row items-center justify-between gap-2',
          isActive(item.href) ? BENTO_TILE_ACTIVE : BENTO_TILE_IDLE
        )}
      >
        {item.iconOnly || bentoCompact ? (
          <item.icon size={20} className="text-white/60" />
        ) : (
          <>
            <span className="truncate text-sm font-medium">{i18n._(item.name)}</span>
            <item.icon size={16} className="shrink-0 text-white/35" />
          </>
        )}
      </Link>
    ))}
    <Link
      to="/grants"
      data-span="col-span-1"
      title={t`Grants`}
      aria-label={t`Grants`}
      onClick={() => setMobileMenuOpen(false)}
      className={cn(BENTO_TILE_CLASS, 'h-full items-center justify-center', BENTO_TILE_IDLE)}
    >
      <DollarSign size={20} className="text-white/60" />
    </Link>

    {/* Admin link — same capability test as the desktop bar above */}
    {canSeeAdmin && (
      <Link
        to="/admin"
        data-span={bentoCompact ? SQUARE_TILE_SPAN : 'col-span-4 landscape-short:col-span-6'}
        onClick={() => setMobileMenuOpen(false)}
        className={cn(
          BENTO_TILE_CLASS,
          'h-full min-h-13 flex-row items-center justify-between gap-2',
          isActive('/admin')
            ? 'border-ktip-sun-500/40 bg-ktip-sun-500/15 text-white'
            : 'border-ktip-sun-500/20 bg-ktip-sun-500/[0.06] text-white/85'
        )}
      >
        <span className="truncate text-sm font-semibold"><Trans>Admin</Trans></span>
        <ShieldCheck size={16} className="text-ktip-sun-500" />
      </Link>
    )}

    {/* Account, as tiles rather than a panel of its own. The panel was a
        full-width block that could not sit beside an expanded category — it got
        pushed under the card and left the hole next to it that nothing could
        fill. As squares these are what the mosaic backfills with.

        Compact drops the labels on the four navigation tiles: at one column
        there is no room for "Business profile", and the name still reaches a
        screen reader through aria-label. */}
    {auth.user ? (
      <>
        <Link
          to="/dashboard"
          data-span={SQUARE_TILE_SPAN}
          title={t`Dashboard`}
          aria-label={t`Dashboard`}
          onClick={() => setMobileMenuOpen(false)}
          className={cn(BENTO_TILE_CLASS, BENTO_ACCOUNT_TILE, BENTO_TILE_IDLE)}
        >
          {!bentoCompact && <span className="truncate text-sm font-medium"><Trans>Dashboard</Trans></span>}
          <LayoutDashboard size={18} className="shrink-0 text-white/45" />
        </Link>
        <Link
          to={isOrgAccount ? '/dashboard/business' : '/dashboard/profile'}
          data-span={SQUARE_TILE_SPAN}
          title={isOrgAccount ? t`Business profile` : t`My CV`}
          aria-label={isOrgAccount ? t`Business profile` : t`My CV`}
          onClick={() => setMobileMenuOpen(false)}
          className={cn(BENTO_TILE_CLASS, BENTO_ACCOUNT_TILE, BENTO_TILE_IDLE)}
        >
          {!bentoCompact && (
            <span className="truncate text-sm font-medium">
              {isOrgAccount ? t`Business profile` : t`My CV`}
            </span>
          )}
          {isOrgAccount ? (
            <Building2 size={18} className="shrink-0 text-white/45" />
          ) : (
            <FileText size={18} className="shrink-0 text-white/45" />
          )}
        </Link>
        <Link
          to="/settings"
          data-span="col-span-1"
          title={t`Settings`}
          aria-label={t`Settings`}
          onClick={() => setMobileMenuOpen(false)}
          className={cn(BENTO_TILE_CLASS, 'h-full min-h-13 items-center justify-center', BENTO_TILE_IDLE)}
        >
          <Settings size={18} className="text-white/60" />
        </Link>
        <Link
          to="/grievances/my-reports"
          data-span="col-span-1"
          title={t`My Reports`}
          aria-label={t`My Reports`}
          onClick={() => setMobileMenuOpen(false)}
          className={cn(BENTO_TILE_CLASS, 'h-full min-h-13 items-center justify-center', BENTO_TILE_IDLE)}
        >
          <Flag size={18} className="text-white/60" />
        </Link>
        {/* Last, and the one tile allowed to stay two wide in compact: nothing
            follows it, so there is no square left for it to strand. */}
        <button
          data-span={WIDE_TILE_SPAN}
          onClick={() => { setMobileMenuOpen(false); handleSignOut() }}
          className={cn(
            BENTO_TILE_CLASS,
            'h-full min-h-13 flex-row items-center justify-between gap-2 border-red-500/20 bg-red-500/[0.08] text-red-400 hover:bg-red-500/15'
          )}
        >
          <span className="truncate text-sm font-medium"><Trans>Sign Out</Trans></span>
          <LogOut size={16} className="shrink-0" />
        </button>
      </>
    ) : (
      /* The pair is ONE stagger unit holding a two-up grid, not two tiles.
         As separate tiles the dense flow was free to backfill Log In into an
         earlier hole and place Sign Up wherever it landed next; inside one cell
         Sign Up is always immediately right of Log In. Soft-UI pair, same as
         the bar: white face, navy face — and no watermark, the labels are the
         whole point of these two. */
      <div data-span={WIDE_TILE_SPAN} className="grid grid-cols-2 gap-2">
        <Link
          to="/login"
          onClick={() => setMobileMenuOpen(false)}
          className={cn(BENTO_TILE_CLASS, BENTO_ACCOUNT_TILE, 'justify-center', BENTO_TILE_LIGHT)}
        >
          <span className="truncate text-sm font-semibold"><Trans>Log In</Trans></span>
        </Link>
        <Link
          to="/signup"
          onClick={() => setMobileMenuOpen(false)}
          className={cn(BENTO_TILE_CLASS, BENTO_ACCOUNT_TILE, 'justify-center', BENTO_TILE_BRAND)}
        >
          <span className="truncate text-sm font-semibold"><Trans>Sign Up</Trans></span>
        </Link>
      </div>
    )}
    </StaggeredMobileMenu>
    </>
  )
}
