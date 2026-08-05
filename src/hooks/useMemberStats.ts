import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import { useAuth } from '../contexts/AuthContext'

/**
 * Every countable the dashboard Overview can put on a tile.
 *
 * `null` means "we could not read this", which is NOT the same as zero — the
 * cross-owner counts (an investor's received applications, a chamber's pending
 * verifications) sit behind RLS policies that may simply not grant the read.
 * Tiles hide on null and print the number on 0, because a confident "0
 * applications received" is worse than no tile at all.
 */
export interface MemberStats {
  projects: number
  events_organized: number
  applications: number
  rsvps: number
  forum_posts: number
  forum_replies: number
  resources: number
  connections_pending: number
  /** Grants this member posted — investor / grant:post holders */
  grants_posted: number | null
  /** Applications they sponsored — faculty / educational_partner */
  sponsorships: number | null
  /** Applications submitted TO their grants. Needs the RPC to be exact. */
  applications_received: number | null
  /** Engagement earned across every project they own */
  likes_received: number
  follows_received: number
  comments_received: number
  views_received: number
  /** Own grant applications tallied by status, for the pipeline chart */
  pipeline: { label: string; count: number }[]
  /** Last 6 months of records this member created, oldest first */
  activity: { month: string; count: number }[]
}

const MONTHS_BACK = 6

/** `2026-08`, the same bucket key `get_user_growth()` uses server-side. */
function monthKey(iso: string): string {
  return iso.slice(0, 7)
}

/** The last N month keys ending on the current one, oldest first. */
function recentMonths(now: Date, count: number): string[] {
  const out: string[] = []
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

/**
 * Per-member counts for the Overview bento.
 *
 * Head-only counts in one `Promise.all`, the same shape as `useAdminStats` and
 * the engagement readout in SignalSummary. A failing table degrades to 0 (or
 * null where the failure is expected to be a policy, not an outage) rather
 * than blanking the whole panel.
 *
 * Points, streak, badges and rank are deliberately absent — they come free
 * from `useAchievementContext()`, which is already mounted app-wide, and
 * connections come from `useConnectionCount`, already called by
 * DashboardLayout. Re-querying them here would be pure waste.
 *
 * SEAM: everything typed `number | null` is a cross-owner count. Those are the
 * ones a `get_my_member_stats()` SECURITY DEFINER RPC would make exact; until
 * then they are only as complete as RLS allows.
 */
export function useMemberStats() {
  const auth = useAuth()
  const userId = auth.user?.id

  const fetchStats = async (uid: string): Promise<MemberStats> => {
    /**
     * Head count, degraded to 0 on any error. Selects the filter column rather
     * than `id` — not every join table has an `id`, but the column being
     * filtered on is guaranteed to exist.
     */
    const count = async (
      table: string,
      column: string,
      value: string,
      extra?: { column: string; value: string }
    ) => {
      let q = (supabase as any)
        .from(table)
        .select(column, { count: 'exact', head: true })
        .eq(column, value)
      if (extra) q = q.eq(extra.column, extra.value)
      const { count: n, error } = await q
      return error ? 0 : n || 0
    }

    /** Same, but a policy denial is meaningful — keep it distinguishable. */
    const maybeCount = async (table: string, column: string, value: string) => {
      const { count: n, error } = await (supabase as any)
        .from(table)
        .select(column, { count: 'exact', head: true })
        .eq(column, value)
      return error ? null : n || 0
    }

    /** Rows this member created, for the activity buckets. */
    const createdAt = async (table: string, column: string, value: string) => {
      const { data, error } = await (supabase as any)
        .from(table)
        .select('created_at')
        .eq(column, value)
      return error ? [] : ((data as { created_at: string | null }[]) || [])
    }

    const [
      projects,
      eventsOrganized,
      applications,
      rsvps,
      forumPosts,
      forumReplies,
      resources,
      connectionsPending,
      grantsPosted,
      sponsorships,
      ownedProjects,
      appRows,
      projectDates,
      appDates,
      eventDates,
    ] = await Promise.all([
      count('projects', 'owner_id', uid),
      count('events', 'organizer_id', uid),
      count('grant_applications', 'user_id', uid),
      count('event_rsvps', 'user_id', uid),
      count('forum_posts', 'author_id', uid),
      count('forum_replies', 'author_id', uid),
      count('resources', 'author_id', uid),
      // Requests waiting on THIS member to answer — the addressee is the only
      // party who can accept or decline (migration 033)
      count('connections', 'addressee_id', uid, { column: 'status', value: 'pending' }),
      maybeCount('grants', 'created_by', uid),
      maybeCount('grant_applications', 'sponsor_id', uid),
      // View counts live on the row, so this one select covers both the
      // engagement total and the id list the like/follow counts need
      (async () => {
        const { data, error } = await (supabase as any)
          .from('projects')
          .select('id, view_count')
          .eq('owner_id', uid)
        return error ? [] : ((data as { id: string; view_count: number | null }[]) || [])
      })(),
      (async () => {
        const { data, error } = await (supabase as any)
          .from('grant_applications')
          .select('status')
          .eq('user_id', uid)
        return error ? [] : ((data as { status: string | null }[]) || [])
      })(),
      createdAt('projects', 'owner_id', uid),
      createdAt('grant_applications', 'user_id', uid),
      createdAt('events', 'organizer_id', uid),
    ])

    const projectIds = ownedProjects.map((p) => p.id)
    const views = ownedProjects.reduce((sum, p) => sum + (p.view_count || 0), 0)

    /** Engagement on rows this member owns — skipped entirely with no projects. */
    const onMyProjects = async (table: string) => {
      if (!projectIds.length) return 0
      const { count: n, error } = await (supabase as any)
        .from(table)
        .select('project_id', { count: 'exact', head: true })
        .in('project_id', projectIds)
      return error ? 0 : n || 0
    }

    const [likes, follows, comments] = await Promise.all([
      onMyProjects('project_likes'),
      onMyProjects('project_follows'),
      onMyProjects('project_comments'),
    ])

    // Pipeline: preserve the order the statuses are declared in, so the donut
    // reads draft -> pending -> review -> decided rather than alphabetically
    const tally = new Map<string, number>()
    for (const row of appRows) {
      const status = row.status || 'draft'
      tally.set(status, (tally.get(status) || 0) + 1)
    }
    const pipeline = [...tally.entries()].map(([label, n]) => ({ label, count: n }))

    // Activity: three record types collapsed into one "things you started" line
    const buckets = new Map(recentMonths(new Date(), MONTHS_BACK).map((m) => [m, 0]))
    for (const row of [...projectDates, ...appDates, ...eventDates]) {
      if (!row.created_at) continue
      const key = monthKey(row.created_at)
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) || 0) + 1)
    }
    const activity = [...buckets.entries()].map(([month, n]) => ({ month, count: n }))

    return {
      projects,
      events_organized: eventsOrganized,
      applications,
      rsvps,
      forum_posts: forumPosts,
      forum_replies: forumReplies,
      resources,
      connections_pending: connectionsPending,
      grants_posted: grantsPosted,
      sponsorships,
      // No client-visible path to this today; the RPC is what fills it in
      applications_received: null,
      likes_received: likes,
      follows_received: follows,
      comments_received: comments,
      views_received: views,
      pipeline,
      activity,
    }
  }

  const query = useQuery({
    queryKey: keys.sub('dashboard', 'stats', userId),
    queryFn: () => fetchStats(userId as string),
    enabled: !!userId,
    staleTime: 60_000,
  })

  return {
    stats: query.data,
    loading: query.isPending && !!userId,
    error: query.error,
    refetch: query.refetch,
  }
}
