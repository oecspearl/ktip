import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { escapeIlike, truncate } from '../lib/utils'
import { keys } from '../queries/keys'
import { useAuth } from '../contexts/AuthContext'
import { ALL_ENTRIES, SITE_MAP, type SiteEntry } from '../lib/site-map'
import {
  applyAiRanking,
  filterByAccess,
  groupRows,
  localSearch,
  toRow,
  type SearchGroup,
  type SearchRow,
} from '../lib/site-search'

/**
 * Everything the navbar search panel needs, in one hook:
 *
 *  1. Places & actions — instant local fuzzy match over the static site map
 *     (`src/lib/site-map.ts`), filtered to what the viewer can actually reach.
 *  2. Content — one debounced round trip that searches seven Supabase tables,
 *     five hits each, reusing the same `escapeIlike` + `.or(...ilike...)`
 *     pattern as the per-page hooks (useProjects, useEvents, …).
 *  3. AI navigation — when the brain toggle is on, `/api/ai-search` re-ranks
 *     the local place rows and returns a plain-language answer. Local results
 *     stay visible throughout, so an AI failure only ever degrades to local.
 */

const CONTENT_MIN_CHARS = 2
const AI_MIN_CHARS = 3
const CONTENT_DEBOUNCE_MS = 250
const AI_DEBOUNCE_MS = 350
const PER_TABLE_LIMIT = 5
const MAX_PLACE_ROWS = 8

const RECENT_KEY = 'ktip_recent_searches'
const MAX_RECENT = 5

/** Shown when the box is focused but empty. */
const SUGGESTED_IDS = [
  'projects.browse',
  'grants.browse',
  'events.browse',
  'directory',
  'collaborate.hub',
  'help.center',
]

export interface UseGlobalSearchResult {
  /** Non-empty sections, in display order. */
  groups: SearchGroup[]
  /** All rows flattened in display order — the keyboard navigation list. */
  rows: SearchRow[]
  aiAnswer: string | null
  aiSteps: string[]
  aiLoading: boolean
  aiError: boolean
  contentLoading: boolean
  /** Curated starting points, used when the query is empty. */
  suggestions: SearchRow[]
  recent: string[]
  rememberQuery: (query: string) => void
  clearRecent: () => void
}

// --- helpers ----------------------------------------------------------------

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

/** Rich-text bodies are stored as HTML; the panel shows a plain snippet. */
function plainText(input: string | null | undefined): string {
  if (!input) return ''
  return input.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

// --- content search ---------------------------------------------------------

async function searchContent(rawQuery: string): Promise<SearchRow[]> {
  const q = escapeIlike(rawQuery)
  if (!q) return []

  const db = supabase as any

  const projects = db
    .from('projects')
    .select('id, title, summary, description')
    .eq('is_public', true)
    .or(`title.ilike.%${q}%,summary.ilike.%${q}%,description.ilike.%${q}%,tags_text.ilike.%${q}%`)
    .limit(PER_TABLE_LIMIT)

  const events = db
    .from('events')
    .select('id, title, summary, description')
    .neq('status', 'draft')
    .or(`title.ilike.%${q}%,summary.ilike.%${q}%,description.ilike.%${q}%,tags_text.ilike.%${q}%`)
    .limit(PER_TABLE_LIMIT)

  const grants = db
    .from('grants')
    .select('id, title, summary, description')
    .or(`title.ilike.%${q}%,summary.ilike.%${q}%,description.ilike.%${q}%,eligibility.ilike.%${q}%`)
    .limit(PER_TABLE_LIMIT)

  const posts = db
    .from('forum_posts')
    .select('id, title, content, board:forum_boards(slug, name)')
    .or(`title.ilike.%${q}%,content.ilike.%${q}%`)
    .limit(PER_TABLE_LIMIT)

  const resources = db
    .from('resources')
    .select('id, title, summary, description')
    .eq('is_published', true)
    .or(`title.ilike.%${q}%,summary.ilike.%${q}%,description.ilike.%${q}%,tags_text.ilike.%${q}%`)
    .limit(PER_TABLE_LIMIT)

  const integrations = db
    .from('integrations')
    .select('id, name, summary, description')
    .eq('is_published', true)
    .or(`name.ilike.%${q}%,summary.ilike.%${q}%,description.ilike.%${q}%,tags_text.ilike.%${q}%`)
    .limit(PER_TABLE_LIMIT)

  const members = db
    .from('profiles')
    .select('id, display_name, bio, country')
    .or(`display_name.ilike.%${q}%,bio.ilike.%${q}%`)
    .limit(PER_TABLE_LIMIT)

  // A failing table (e.g. RLS on profiles for anonymous viewers) must not take
  // the whole panel down, so each result is unwrapped independently.
  const [
    projectsRes,
    eventsRes,
    grantsRes,
    postsRes,
    resourcesRes,
    integrationsRes,
    membersRes,
  ] = await Promise.all([projects, events, grants, posts, resources, integrations, members])

  const rows: SearchRow[] = []

  for (const p of projectsRes?.data ?? []) {
    rows.push({
      id: `project:${p.id}`,
      kind: 'project',
      title: p.title,
      description: truncate(plainText(p.summary || p.description), 100),
      category: 'Projects',
      href: `/projects/${p.id}`,
      icon: 'FolderKanban',
    })
  }

  for (const e of eventsRes?.data ?? []) {
    rows.push({
      id: `event:${e.id}`,
      kind: 'event',
      title: e.title,
      description: truncate(plainText(e.summary || e.description), 100),
      category: 'Events',
      href: `/events/${e.id}`,
      icon: 'Calendar',
    })
  }

  for (const g of grantsRes?.data ?? []) {
    rows.push({
      id: `grant:${g.id}`,
      kind: 'grant',
      title: g.title,
      description: truncate(plainText(g.summary || g.description), 100),
      category: 'Funding',
      href: `/grants/${g.id}`,
      icon: 'DollarSign',
    })
  }

  for (const post of postsRes?.data ?? []) {
    const slug = post.board?.slug
    if (!slug) continue
    rows.push({
      id: `post:${post.id}`,
      kind: 'post',
      title: post.title,
      description: truncate(plainText(post.content), 100),
      category: post.board?.name || 'Forums',
      href: `/forums/${slug}/${post.id}`,
      icon: 'MessageSquare',
    })
  }

  for (const r of resourcesRes?.data ?? []) {
    rows.push({
      id: `resource:${r.id}`,
      kind: 'resource',
      title: r.title,
      description: truncate(plainText(r.summary || r.description), 100),
      category: 'Resources',
      href: `/resources/${r.id}`,
      icon: 'BookOpen',
    })
  }

  for (const i of integrationsRes?.data ?? []) {
    rows.push({
      id: `integration:${i.id}`,
      kind: 'integration',
      title: i.name,
      description: truncate(plainText(i.summary || i.description), 100),
      category: 'Integrations',
      // No integration detail route — land on the directory tab, pre-filtered.
      href: `/resources?tab=integrations&search=${encodeURIComponent(i.name)}`,
      icon: 'Plug',
    })
  }

  for (const m of membersRes?.data ?? []) {
    rows.push({
      id: `member:${m.id}`,
      kind: 'member',
      title: m.display_name || 'Member',
      description: truncate(plainText(m.bio) || m.country || '', 100),
      category: 'Directory',
      href: `/profile/${m.id}`,
      icon: 'User',
    })
  }

  return rows
}

// --- hook -------------------------------------------------------------------

export function useGlobalSearch(query: string, aiMode: boolean): UseGlobalSearchResult {
  const auth = useAuth()
  const signedIn = !!auth.user
  const isOecs = !!auth.profile?.roles?.includes('oecs')

  const trimmed = query.trim()
  const debouncedQuery = useDebouncedValue(trimmed, CONTENT_DEBOUNCE_MS)
  const debouncedAiQuery = useDebouncedValue(trimmed, AI_DEBOUNCE_MS)

  // 1. Places & actions (+ help articles) — local, instant
  const visibleEntries = useMemo(
    () => filterByAccess(ALL_ENTRIES, { signedIn, isOecs }),
    [signedIn, isOecs]
  )

  const placeRows = useMemo(() => {
    if (!trimmed) return []
    return localSearch(trimmed, visibleEntries)
      .slice(0, MAX_PLACE_ROWS)
      .map((entry: SiteEntry) => toRow(entry, entry.href?.startsWith('/help?article=') ? 'help' : 'place'))
  }, [trimmed, visibleEntries])

  // 2. Live content
  const contentQuery = useQuery({
    queryKey: keys.list('global_search', debouncedQuery),
    queryFn: () => searchContent(debouncedQuery),
    enabled: debouncedQuery.length >= CONTENT_MIN_CHARS,
    staleTime: 30_000,
  })

  // 3. AI navigation
  const [aiIds, setAiIds] = useState<string[]>([])
  const [aiAnswer, setAiAnswer] = useState<string | null>(null)
  const [aiSteps, setAiSteps] = useState<string[]>([])
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!aiMode || debouncedAiQuery.length < AI_MIN_CHARS) {
      abortRef.current?.abort()
      setAiIds([])
      setAiAnswer(null)
      setAiSteps([])
      setAiLoading(false)
      setAiError(false)
      return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setAiLoading(true)
    setAiError(false)

    let cancelled = false

    ;(async () => {
      try {
        const res = await fetch('/api/ai-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({ query: debouncedAiQuery, signedIn, isOecs }),
        })
        if (!res.ok) throw new Error(`AI search failed: ${res.status}`)
        const data = (await res.json()) as { ids?: string[]; answer?: string; steps?: string[] }
        if (cancelled) return
        setAiIds(Array.isArray(data.ids) ? data.ids : [])
        setAiAnswer(typeof data.answer === 'string' && data.answer.trim() ? data.answer : null)
        setAiSteps(Array.isArray(data.steps) ? data.steps.filter((s) => typeof s === 'string') : [])
      } catch (err) {
        if ((err as Error).name === 'AbortError' || cancelled) return
        // Endpoint missing, key unset, or model unreachable — keep local results
        setAiError(true)
        setAiIds([])
        setAiAnswer(null)
        setAiSteps([])
      } finally {
        if (!cancelled) setAiLoading(false)
      }
    })()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [aiMode, debouncedAiQuery, signedIn, isOecs])

  // AI ids can name entries the local search missed entirely, so pull those in
  const aiExtraRows = useMemo(() => {
    if (!aiMode || aiIds.length === 0) return []
    const present = new Set(placeRows.map((r) => r.id))
    const byId = new Map(visibleEntries.map((e) => [e.id, e]))
    return aiIds
      .filter((id) => !present.has(id))
      .map((id) => byId.get(id))
      .filter((e): e is SiteEntry => !!e)
      .map((entry) => toRow(entry, entry.href?.startsWith('/help?article=') ? 'help' : 'place'))
  }, [aiMode, aiIds, placeRows, visibleEntries])

  const groups = useMemo(() => {
    const places = [...placeRows, ...aiExtraRows]
    const ranked = aiMode ? applyAiRanking(places, aiIds) : places
    return groupRows([...ranked, ...(contentQuery.data ?? [])])
  }, [placeRows, aiExtraRows, aiMode, aiIds, contentQuery.data])

  // Flattened in the exact order the panel renders, so keyboard navigation and
  // the visible list can never drift apart.
  const rows = useMemo(() => groups.flatMap((group) => group.rows), [groups])

  // Suggestions & recent searches
  const suggestions = useMemo(() => {
    const byId = new Map(SITE_MAP.map((e) => [e.id, e]))
    return SUGGESTED_IDS.map((id) => byId.get(id))
      .filter((e): e is SiteEntry => !!e)
      .filter((e) => filterByAccess([e], { signedIn, isOecs }).length > 0)
      .map((e) => toRow(e))
  }, [signedIn, isOecs])

  const [recent, setRecent] = useState<string[]>(() => readRecent())

  const rememberQuery = useCallback((value: string) => {
    const term = value.trim()
    if (term.length < CONTENT_MIN_CHARS) return
    setRecent((prev) => {
      const next = [term, ...prev.filter((p) => p.toLowerCase() !== term.toLowerCase())].slice(0, MAX_RECENT)
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next))
      } catch {
        // storage unavailable — recents just do not persist
      }
      return next
    })
  }, [])

  const clearRecent = useCallback(() => {
    setRecent([])
    try {
      localStorage.removeItem(RECENT_KEY)
    } catch {
      // ignore
    }
  }, [])

  return {
    groups,
    rows,
    aiAnswer,
    aiSteps,
    aiLoading,
    aiError,
    contentLoading: contentQuery.isFetching,
    suggestions,
    recent,
    rememberQuery,
    clearRecent,
  }
}
