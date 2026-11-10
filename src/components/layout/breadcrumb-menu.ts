import type { ComponentType } from 'react'
import type { PermissionKey } from '../../types'
import type { Copy } from '../../i18n/copy'
import { leadingLinks, navDropdowns, trailingLinks, type NavDropdown } from './Navbar'

/**
 * What a breadcrumb step opens: the other pages on the same level as it.
 *
 *   Home is the root. It has no siblings, so it has no menu.
 *
 *   A section (Projects, Events, Funding, Community, Resources, Help) opens the
 *   other sections. The list is the top bar's own, read from the lists Navbar
 *   renders, so a crumb never offers a page the bar does not.
 *
 *   A page inside one of the bar's dropdowns that is not its section's landing
 *   page (My Events, Forums, My Applications) opens the rest of that group.
 *
 *   Below that the levels are data, not navigation: a category and the items
 *   in it. The page that knows them hands its crumbs a ready-made `menu`
 *   (see lib/category-crumbs.ts), which wins over anything worked out here.
 */

export interface CrumbMenuEntry {
  name: Copy
  href: string
  icon?: ComponentType<{ size?: number; className?: string }>
  description?: Copy
  /** Shown at the end of the row, e.g. how many projects a category holds. */
  count?: number
  /** A state pill at the end of the row: whether an event or call is open. */
  badge?: CrumbBadge
  /** Kept behind the menu's "Show closed" toggle until the reader opens it. */
  folded?: boolean
  /**
   * Marks the entry the reader is on. Needed for entries whose href carries a
   * query (/projects?category=environment), which the path alone cannot tell
   * apart. Left out, the entry is current when its path is the page's path.
   */
  current?: boolean
}

export interface CrumbBadge {
  label: Copy
  tone: 'open' | 'closed'
}

/** Who is looking: the same two gates the Navbar applies to its own menus. */
export interface CrumbViewer {
  /** False for a signed-out visitor, who keeps every CTA (they route to login). */
  signedIn: boolean
  /** Signed in, profile loaded, and not yet verified (migration 205). */
  unverified: boolean
  can: (key: PermissionKey) => boolean
}

type Gated = { requires?: PermissionKey; unverified?: boolean }

function shows(item: Gated, viewer: CrumbViewer): boolean {
  if (item.requires && viewer.signedIn && !viewer.can(item.requires)) return false
  if (viewer.unverified && !item.unverified) return false
  return true
}

/** "/events/" and "/events?x=1" both mean "/events". */
export function normalisePath(path: string): string {
  const bare = path.split(/[?#]/)[0] || '/'
  return bare.length > 1 ? bare.replace(/\/+$/, '') : bare
}

function visibleGroup(group: NavDropdown, viewer: CrumbViewer): CrumbMenuEntry[] {
  return group.items.filter((item) => shows(item, viewer))
}

/** Every section the viewer can open, Home excluded, in bar order. */
function sections(viewer: CrumbViewer): CrumbMenuEntry[] {
  const entries: CrumbMenuEntry[] = []
  for (const link of leadingLinks) if (link.href !== '/' && shows(link, viewer)) entries.push(link)
  // A dropdown is not a page, so the section stands in as its landing page:
  // its first entry, which is the one every group lists first on purpose.
  for (const group of navDropdowns) {
    const landing = group.items[0]
    if (landing && shows(landing, viewer)) {
      entries.push({ name: group.name, href: landing.href, icon: group.icon })
    }
  }
  for (const link of trailingLinks) if (shows(link, viewer)) entries.push(link)
  return entries
}

/** The sections' own paths, whether or not this viewer can open them. */
const SECTION_PATHS = new Set<string>([
  ...leadingLinks.filter((l) => l.href !== '/').map((l) => l.href),
  ...navDropdowns.flatMap((g) => (g.items[0] ? [g.items[0].href] : [])),
  ...trailingLinks.map((l) => l.href),
])

/**
 * The menu for the crumb at `path`, or null when it has none: Home, a page the
 * bar does not list, or a level with nothing else on it.
 */
export function crumbMenuFor(path: string, viewer: CrumbViewer): CrumbMenuEntry[] | null {
  const at = normalisePath(path)
  if (at === '/') return null

  if (SECTION_PATHS.has(at)) {
    const others = sections(viewer).filter((s) => s.href !== at)
    return others.length > 0 ? others : null
  }

  for (const group of navDropdowns) {
    if (!group.items.some((item) => item.href === at)) continue
    const entries = visibleGroup(group, viewer)
    return entries.length > 1 ? entries : null
  }
  return null
}
