import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation } from 'react-router'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useLingui } from '@lingui/react/macro'
import { useAuth } from '../../contexts/AuthContext'
import { resolveCopy, type Copy } from '../../i18n/copy'
import { cn } from '../../lib/utils'
import { DropdownPanel } from '../ui/DropdownPanel'
import { FlowingMenuItem } from '../ui/FlowingMenuItem'
import {
  crumbMenuFor,
  normalisePath,
  type CrumbMenuEntry,
  type CrumbViewer,
} from './breadcrumb-menu'

export interface BreadcrumbItem {
  /**
   * `Copy`, not `string`: most callers already resolve with `t\`…\`` before
   * this ever sees the prop, but site-map-sourced crumbs arrive as harvested
   * source strings. Resolved here rather than at every call site, same as
   * SortSelect.
   */
  label: Copy
  href?: string
  /**
   * The pages beside this step, when the page knows them better than the top
   * bar does: the categories of a list, or the other items in a category.
   * Overrides the bar-derived menu; null means "no menu" outright.
   */
  menu?: CrumbMenuEntry[] | null
}

/** Same grace period as the top bar's menus, for the same reason. */
const HOVER_CLOSE_MS = 180
const PANEL_WIDTH = 288
const GUTTER = 16

const canHover = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(hover: hover) and (pointer: fine)').matches

/** The top bar's active style, so "you are here" reads the same in both places. */
const CURRENT_CLASS = 'text-white underline decoration-ktip-nav-accent decoration-2 underline-offset-8'

/**
 * The hero's breadcrumb trail. Looks as it always has, with two additions: the
 * page you are on is underlined, and a step with anything beside it (other
 * sections, other categories, other items in the category) opens a menu of
 * them. Hover opens it with a mouse; a tap or click opens it on touch, and
 * ArrowDown opens it from the keyboard.
 *
 * The menu is portalled to <body> because the hero clips its own overflow.
 */
export function BreadcrumbNav({ items }: { items: BreadcrumbItem[] }) {
  const { t, i18n } = useLingui()
  const location = useLocation()
  const auth = useAuth()

  const viewer: CrumbViewer = useMemo(
    () => ({
      signedIn: !!auth.user,
      unverified: !!auth.user && !!auth.profile && !auth.profileLoading && !auth.verified,
      can: auth.can,
    }),
    [auth.user, auth.profile, auth.profileLoading, auth.verified, auth.can]
  )

  const [open, setOpen] = useState<number | null>(null)
  const timer = useRef(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  // A followed link is a new page; its trail should not arrive with a menu open.
  useEffect(() => {
    setOpen(null)
  }, [location.pathname])

  const enter = useCallback((index: number) => {
    if (!canHover()) return
    window.clearTimeout(timer.current)
    setOpen(index)
  }, [])
  const leave = useCallback(() => {
    if (!canHover()) return
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setOpen(null), HOVER_CLOSE_MS)
  }, [])

  const last = items.length - 1

  return (
    <nav className="text-body-lg text-white/70 hidden md:block" aria-label={t`Breadcrumb`}>
      {items.map((item, i) => {
        const path = item.href ?? (i === last ? location.pathname : undefined)
        const menu =
          item.menu !== undefined
            ? item.menu && item.menu.length > 1
              ? item.menu
              : null
            : path
              ? crumbMenuFor(path, viewer)
              : null
        return (
          <span key={i}>
            {i > 0 && (
              <span className="mx-1.5">
                <ChevronRight size={15} className="inline" aria-hidden="true" />
              </span>
            )}
            {menu ? (
              <MenuCrumb
                label={resolveCopy(i18n, item.label)}
                href={item.href}
                current={i === last}
                here={normalisePath(location.pathname)}
                entries={menu}
                open={open === i}
                onOpen={() => setOpen(i)}
                onClose={() => setOpen((o) => (o === i ? null : o))}
                onEnter={() => enter(i)}
                onLeave={leave}
              />
            ) : item.href ? (
              <Link
                to={item.href}
                aria-current={i === last ? 'page' : undefined}
                className={cn('transition-colors', i === last ? CURRENT_CLASS : 'hover:text-white')}
              >
                {resolveCopy(i18n, item.label)}
              </Link>
            ) : (
              <span aria-current={i === last ? 'page' : undefined} className={i === last ? CURRENT_CLASS : 'text-white'}>
                {resolveCopy(i18n, item.label)}
              </span>
            )}
          </span>
        )
      })}
    </nav>
  )
}

function MenuCrumb({
  label,
  href,
  current,
  here,
  entries,
  open,
  onOpen,
  onClose,
  onEnter,
  onLeave,
}: {
  label: string
  href?: string
  current: boolean
  /** The page being viewed, normalised, to mark it inside the menu. */
  here: string
  entries: CrumbMenuEntry[]
  open: boolean
  onOpen: () => void
  onClose: () => void
  onEnter: () => void
  onLeave: () => void
}) {
  const { t, i18n } = useLingui()
  const panelId = useId()
  const triggerRef = useRef<HTMLElement | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  // Set when the keyboard opened the menu, so focus moves into it. A mouse
  // opening it must not steal focus from wherever the reader left it.
  const focusFirst = useRef(false)

  // Closed events and calls wait behind a toggle, unless the reader is on one:
  // then the fold starts open, so the menu still shows where they are.
  const foldedCount = entries.filter((e) => e.folded).length
  const [showClosed, setShowClosed] = useState(() => entries.some((e) => e.folded && e.current))
  const foldId = useId()

  const place = useCallback(() => {
    const r = triggerRef.current?.getBoundingClientRect()
    if (!r) return
    const maxLeft = window.innerWidth - PANEL_WIDTH - GUTTER
    setPos({ top: r.bottom + 8, left: Math.max(GUTTER, Math.min(r.left, maxLeft)) })
  }, [])

  const show = useCallback(() => {
    place()
    onOpen()
  }, [place, onOpen])

  // Pointer outside, scroll or resize: the menu is pinned to where the crumb
  // was, so anything that moves the crumb closes it rather than leave it
  // floating over the wrong spot.
  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent) => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return
      onClose()
    }
    // Scrolling the panel's own list is not the page moving.
    const scrolled = (e: Event) => {
      if (panelRef.current?.contains(e.target as Node)) return
      onClose()
    }
    const resized = () => onClose()
    document.addEventListener('pointerdown', outside)
    window.addEventListener('scroll', scrolled, { passive: true, capture: true })
    window.addEventListener('resize', resized)
    return () => {
      document.removeEventListener('pointerdown', outside)
      window.removeEventListener('scroll', scrolled, { capture: true })
      window.removeEventListener('resize', resized)
    }
  }, [open, onClose])

  useEffect(() => {
    if (open && focusFirst.current) {
      focusFirst.current = false
      // The panel mounts on this render; wait one frame for it to exist.
      const id = requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>('a')?.focus())
      return () => cancelAnimationFrame(id)
    }
  }, [open])

  const onTriggerKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      focusFirst.current = true
      show()
    } else if (e.key === 'Escape' && open) {
      onClose()
    }
  }

  const onPanelKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const links = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('a, button') ?? [])
    const at = links.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const step = e.key === 'ArrowDown' ? 1 : -1
      links[(at + step + links.length) % links.length]?.focus()
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault()
      onClose()
      triggerRef.current?.focus()
    }
  }

  // With a mouse, a crumb that is a link stays a link: hover shows the menu and
  // a click goes where it always went. Without hover there is no other way to
  // reach the menu, so the tap opens it instead; the crumb's own page is in it.
  const onTriggerClick = (e: MouseEvent) => {
    if (href && canHover()) return
    e.preventDefault()
    if (open) onClose()
    else show()
  }

  const chevron = (
    <ChevronDown
      size={14}
      aria-hidden="true"
      className={cn('ml-1 inline align-[-1px] opacity-70 transition-transform duration-200', open && 'rotate-180')}
    />
  )

  const triggerClass = cn(
    'transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white rounded-sm',
    current ? CURRENT_CLASS : 'hover:text-white',
    open && !current && 'text-white'
  )

  const shared = {
    onClick: onTriggerClick,
    onKeyDown: onTriggerKey,
    'aria-expanded': open,
    'aria-controls': open ? panelId : undefined,
    'aria-current': current ? ('page' as const) : undefined,
    className: triggerClass,
  }

  return (
    <span className="inline-block" onMouseEnter={() => { place(); onEnter() }} onMouseLeave={onLeave}>
      {href ? (
        <Link to={href} ref={(el) => { triggerRef.current = el }} {...shared}>
          {label}
          {chevron}
        </Link>
      ) : (
        <button
          type="button"
          ref={(el) => { triggerRef.current = el }}
          {...shared}
          aria-label={t`${label}, other pages on this level`}
        >
          {label}
          {chevron}
        </button>
      )}

      {pos &&
        createPortal(
          <DropdownPanel
            open={open}
            ref={panelRef}
            id={panelId}
            onMouseEnter={onEnter}
            onMouseLeave={onLeave}
            onKeyDown={onPanelKey}
            style={{ top: pos.top, left: pos.left, width: PANEL_WIDTH }}
            // A category can hold more items than fit under the crumb, so the
            // panel scrolls inside itself rather than run off the screen.
            className="fixed origin-top-left max-h-[min(70vh,30rem)] overflow-y-auto overscroll-contain rounded-xl bg-ktip-cream shadow-hard z-dropdown"
          >
            <ul>
              {entries.map((entry, index) => {
                // The toggle sits where the folded run starts: after the open
                // items, before the closed ones (and any "See all" after them).
                const startsFold = !!entry.folded && !entries[index - 1]?.folded
                const toggle = startsFold && (
                  <li key="fold-toggle" className="border-t border-ktip-sand-200">
                    <button
                      type="button"
                      aria-expanded={showClosed}
                      aria-controls={foldId}
                      onClick={() => setShowClosed((s) => !s)}
                      // Same green as the rows' hover sweep, so the toggle reads as part of the menu.
                      className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm font-semibold text-ktip-sand-600 transition-colors hover:bg-ktip-nav-accent hover:text-ktip-nav-accent-contrast focus-visible:bg-ktip-nav-accent focus-visible:text-ktip-nav-accent-contrast focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ktip-ocean-600"
                    >
                      <span>{showClosed ? t`Hide closed` : t`Show closed (${foldedCount})`}</span>
                      <ChevronDown
                        size={14}
                        aria-hidden="true"
                        className={cn('shrink-0 transition-transform duration-200', showClosed && 'rotate-180')}
                      />
                    </button>
                  </li>
                )
                if (entry.folded && !showClosed) return toggle || null

                const isHere = entry.current ?? normalisePath(entry.href) === here
                const name = resolveCopy(i18n, entry.name)
                const Icon = entry.icon
                return (
                  <Fragment key={entry.href}>
                  {toggle}
                  <li id={startsFold ? foldId : undefined}>
                    <FlowingMenuItem
                      to={entry.href}
                      label={name}
                      icon={entry.icon}
                      onClick={onClose}
                      className={cn(
                        'flex items-start gap-3 px-4 py-3 transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ktip-ocean-600',
                        isHere ? 'bg-ktip-ocean-50 text-ktip-ocean-700' : 'text-ktip-sand-700'
                      )}
                    >
                      {Icon && <Icon size={18} className="mt-0.5 shrink-0 opacity-70" />}
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium break-words" aria-current={isHere ? 'page' : undefined}>
                          {name}
                        </span>
                        {entry.description && (
                          <span className="mt-0.5 block text-xs text-ktip-sand-500">
                            {resolveCopy(i18n, entry.description)}
                          </span>
                        )}
                      </span>
                      {entry.badge && (
                        <span
                          className={cn(
                            'mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold',
                            entry.badge.tone === 'open'
                              ? 'border-ktip-tropical-200 bg-ktip-tropical-50 text-ktip-tropical-700'
                              : 'border-ktip-sand-200 bg-ktip-sand-100 text-ktip-sand-600'
                          )}
                        >
                          {resolveCopy(i18n, entry.badge.label)}
                        </span>
                      )}
                      {entry.count !== undefined && (
                        <span className="mt-0.5 shrink-0 text-sm tabular-nums text-ktip-sand-500">{entry.count}</span>
                      )}
                    </FlowingMenuItem>
                  </li>
                  </Fragment>
                )
              })}
            </ul>
          </DropdownPanel>,
          document.body
        )}
    </span>
  )
}
