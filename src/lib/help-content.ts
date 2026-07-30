// Help Center content.
//
// The articles themselves live in ./help/*.ts, one module per area, because a
// single file grew past the point where anyone could find anything in it.
// This module stays as the public entry point so existing imports (site-map.ts,
// the help components) keep working unchanged.

import type { HelpCategory } from './help/types'

export type { HelpArticle, HelpCategory, GettingStartedGuide } from './help/types'
export { HELP_CATEGORIES, GETTING_STARTED_GUIDES } from './help'

// ---------------------------------------------------------------------------
// Search Utility
// ---------------------------------------------------------------------------

export function searchHelpContent(
  categories: HelpCategory[],
  query: string,
  categoryFilter: string
): HelpCategory[] {
  const q = query.toLowerCase().trim()

  return categories
    .filter((cat) => !categoryFilter || cat.id === categoryFilter)
    .map((cat) => {
      if (!q) return cat

      const filteredArticles = cat.articles.filter(
        (article) =>
          article.title.toLowerCase().includes(q) ||
          article.content.toLowerCase().includes(q) ||
          article.tags.some((tag) => tag.toLowerCase().includes(q))
      )

      return { ...cat, articles: filteredArticles }
    })
    .filter((cat) => cat.articles.length > 0)
}

/** Total articles across every category — used for the sidebar "All" count. */
export function countHelpArticles(categories: HelpCategory[]): number {
  return categories.reduce((sum, cat) => sum + cat.articles.length, 0)
}
