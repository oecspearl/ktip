import type { Copy } from '../i18n/copy'
import type { BreadcrumbItem } from '../components/layout/BreadcrumbNav'
import type { CrumbBadge, CrumbMenuEntry } from '../components/layout/breadcrumb-menu'
import { EVENT_TYPE_LABELS, RESOURCE_CATEGORY_LABELS } from './constants'

const fromLabels = (labels: Record<string, string>): CategoryOption[] =>
  Object.entries(labels).map(([value, label]) => ({ value, label }))

/** The label maps as ordered option lists, for the vocabularies kept as maps. */
export const EVENT_TYPE_OPTIONS = fromLabels(EVENT_TYPE_LABELS)
export const RESOURCE_CATEGORY_OPTIONS = fromLabels(RESOURCE_CATEGORY_LABELS)

/**
 * Breadcrumbs for an item that lives in a categorised list:
 *
 *   Home › Projects › Environment › ReefWatch AI
 *
 * Projects opens the other sections (worked out by the trail itself). The
 * category opens the other categories, each linking to the list filtered to
 * it. The item opens the other items in its category, ending in a link to the
 * whole filtered list when there are more than fit.
 */

export interface CategoryOption {
  value: string
  label: Copy
}

export interface CategoryTrailInput<T> {
  home: Copy
  section: { label: Copy; href: string }
  /** The query key the list page filters on: `category` or `type`. */
  param: string
  categories: readonly CategoryOption[]
  current: { id: string; title: Copy; category: string | null | undefined }
  /** Every item of this kind, in list order. Undefined while it loads. */
  items: readonly T[] | undefined
  categoryOf: (item: T) => string | null | undefined
  idOf: (item: T) => string
  titleOf: (item: T) => Copy
  pathOf: (item: T) => string
  /** Open/closed pill for each item, where the kind has such a state. */
  badgeOf?: (item: T) => CrumbBadge | undefined
  /** The last row of a long item menu, e.g. "See all 12". */
  seeAll: (count: number) => Copy
  /** How many items the menu lists before it says "See all". */
  limit?: number
}

export function categoryHref(sectionHref: string, param: string, value: string): string {
  return `${sectionHref}?${new URLSearchParams({ [param]: value })}`
}

/**
 * The list page's own trail. Unfiltered it is Home › Projects. Filtered to a
 * category it becomes Home › Projects › Environment, where Environment opens
 * the other categories, so the trail a reader followed down from an item is
 * the trail they find when they land.
 */
export function listTrail(input: {
  home: Copy
  section: { label: Copy; href: string; currentLabel?: Copy }
  param: string
  categories: readonly CategoryOption[]
  selected: string | null | undefined
}): BreadcrumbItem[] {
  const { section, param, categories } = input
  const home: BreadcrumbItem = { label: input.home, href: '/', menu: null }
  const category = categories.find((c) => c.value === input.selected)
  if (!category) return [home, { label: section.currentLabel ?? section.label }]
  return [
    home,
    { label: section.label, href: section.href },
    {
      label: category.label,
      menu: categories.map((c) => ({
        name: c.label,
        href: categoryHref(section.href, param, c.value),
        current: c.value === category.value,
      })),
    },
  ]
}

export function categoryTrail<T>(input: CategoryTrailInput<T>): BreadcrumbItem[] {
  const { section, param, categories, current, items } = input
  const limit = input.limit ?? 8

  const trail: BreadcrumbItem[] = [
    // Home is the root: nothing sits beside it.
    { label: input.home, href: '/', menu: null },
    { label: section.label, href: section.href },
  ]

  const category = categories.find((c) => c.value === current.category)
  if (!category) {
    // Uncategorised, or a value the list page does not offer as a filter: a
    // crumb for it would open a list that cannot be filtered to it.
    trail.push({ label: current.title, menu: null })
    return trail
  }

  const counts = new Map<string, number>()
  for (const item of items ?? []) {
    const value = input.categoryOf(item)
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1)
  }

  // Until the list arrives every category is offered, without a count. After,
  // only the ones with something in them, and always the reader's own.
  const categoryMenu: CrumbMenuEntry[] = categories
    .filter((c) => !items || (counts.get(c.value) ?? 0) > 0 || c.value === category.value)
    .map((c) => ({
      name: c.label,
      href: categoryHref(section.href, param, c.value),
      count: items ? (counts.get(c.value) ?? 0) : undefined,
      current: c.value === category.value,
    }))

  const filteredHref = categoryHref(section.href, param, category.value)
  trail.push({ label: category.label, href: filteredHref, menu: categoryMenu })

  if (!items) {
    trail.push({ label: current.title, menu: null })
    return trail
  }

  const siblings = items.filter((item) => input.categoryOf(item) === category.value)

  // Open items lead; closed ones follow, folded behind "Show closed". Each
  // group is capped on its own, so a long history of past events cannot crowd
  // the open ones out of the menu.
  const closedOf = (item: T) => input.badgeOf?.(item)?.tone === 'closed'
  const open = siblings.filter((item) => !closedOf(item))
  const closed = siblings.filter(closedOf)
  const cap = (group: T[]) => {
    const kept = group.slice(0, limit)
    // The reader's own item always makes the cut, so the menu shows where they are.
    const own = group.find((item) => input.idOf(item) === current.id)
    return own && !kept.includes(own) ? [...kept.slice(0, limit - 1), own] : kept
  }
  const shown = [...cap(open), ...cap(closed)]

  const itemMenu: CrumbMenuEntry[] = shown.map((item) => ({
    name: input.titleOf(item),
    href: input.pathOf(item),
    current: input.idOf(item) === current.id,
    badge: input.badgeOf?.(item),
    folded: closedOf(item) || undefined,
  }))
  if (siblings.length > shown.length) {
    itemMenu.push({ name: input.seeAll(siblings.length), href: filteredHref })
  }

  trail.push({ label: current.title, menu: itemMenu })
  return trail
}
