-- ============================================================================
-- get_my_member_stats() — the dashboard Overview bento in one round trip.
--
-- NOT YET APPLIED. Written against a measured trace, reviewed before it runs.
--
-- WHY
-- ---
-- `useMemberStats` currently issues 15 queries in one Promise.all and then 3
-- more that cannot start until the first wave returns (they need the caller's
-- project ids). Measured on /dashboard with a real session:
--
--     22 unique Supabase endpoints in that wave
--     44 HTTP requests — every Supabase call carries a CORS preflight, because
--        `apikey` + `authorization` disqualify it as a simple request, and each
--        URL is unique so the browser's preflight cache never hits
--     ~39.6 kB for the ENTIRE dashboard
--
-- The payload is nothing. The cost is round trips: the page spends ~2.6s
-- waiting for permission to ask its next question at ~90ms RTT, which is
-- roughly 7-8s on a phone at 250-300ms. This collapses that wave to one call
-- (two with its preflight) and removes a whole waterfall level with it.
--
-- The client already anticipated this: see the SEAM note at
-- src/hooks/useMemberStats.ts:71-73, which names this function.
--
-- SECURITY
-- --------
-- SECURITY DEFINER, and every count is hard-scoped to `auth.uid()`. No
-- parameter selects the subject, so there is no argument a caller could pass to
-- read another member's figures — the identity comes from the JWT and nowhere
-- else. Returns NULL for the caller when unauthenticated rather than counting
-- across the table.
--
-- This DOES intentionally see past RLS, and that is the point of the two
-- columns typed `number | null` on the client: `grants_posted` and
-- `sponsorships` are cross-owner counts that RLS may simply refuse today, so
-- the tiles hide rather than print a confidently wrong 0. Under this function
-- they become exact. `applications_received` becomes readable for the first
-- time — the client has been hardcoding null for it.
--
-- search_path is pinned so a SECURITY DEFINER function cannot be redirected by
-- a caller-set search_path, per the pattern used by the other definer functions
-- in this schema.
-- ============================================================================

create or replace function public.get_my_member_stats()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  uid uuid := auth.uid();
  project_ids uuid[];
  result jsonb;
begin
  if uid is null then
    return null;
  end if;

  -- Gathered once and reused by the three engagement counts below, which is
  -- the dependency that forced a second round trip on the client.
  select coalesce(array_agg(id), '{}') into project_ids
  from projects where owner_id = uid;

  select jsonb_build_object(
    'projects',            (select count(*) from projects            where owner_id    = uid),
    'events_organized',    (select count(*) from events              where organizer_id = uid),
    'applications',        (select count(*) from grant_applications  where user_id     = uid),
    'rsvps',               (select count(*) from event_rsvps         where user_id     = uid),
    'forum_posts',         (select count(*) from forum_posts         where author_id   = uid),
    'forum_replies',       (select count(*) from forum_replies       where author_id   = uid),
    'resources',           (select count(*) from resources           where author_id   = uid),

    -- Only the addressee can accept or decline (migration 033), so "waiting on
    -- me" is exactly the pending rows addressed to me.
    'connections_pending', (select count(*) from connections
                            where addressee_id = uid and status = 'pending'),

    'grants_posted',       (select count(*) from grants              where created_by  = uid),
    'sponsorships',        (select count(*) from grant_applications  where sponsor_id  = uid),

    -- New: applications submitted TO this member's grants. The client has no
    -- path to this under RLS and has been sending null.
    'applications_received', (
      select count(*) from grant_applications ga
      join grants g on g.id = ga.grant_id
      where g.created_by = uid
    ),

    'likes_received',    (select count(*) from project_likes    where project_id = any(project_ids)),
    'follows_received',  (select count(*) from project_follows  where project_id = any(project_ids)),
    'comments_received', (select count(*) from project_comments where project_id = any(project_ids)),
    'views_received',    (select coalesce(sum(coalesce(view_count, 0)), 0)
                          from projects where owner_id = uid),

    -- Pipeline, in a declared order rather than whatever order the rows came
    -- back in. The client built this from a Map in row order and its comment
    -- claimed a fixed draft -> pending -> review -> decided reading; it only
    -- got one by luck. Unknown statuses sort last, alphabetically, so a new
    -- one appears rather than disappearing.
    'pipeline', coalesce((
      select jsonb_agg(jsonb_build_object('label', label, 'count', n) order by ord, label)
      from (
        select
          coalesce(status, 'draft') as label,
          count(*)                  as n,
          coalesce(array_position(
            array['draft','pending','submitted','under_review','review','approved','rejected','decided'],
            coalesce(status, 'draft')
          ), 99) as ord
        from grant_applications
        where user_id = uid
        group by coalesce(status, 'draft')
      ) t
    ), '[]'::jsonb),

    -- Last 6 months of things this member started, oldest first, with empty
    -- months present as zero. generate_series is what guarantees the gaps are
    -- filled — the client was seeding a Map with every month for the same
    -- reason, and a chart with holes in it is worse than one with zeroes.
    'activity', coalesce((
      select jsonb_agg(jsonb_build_object('month', month, 'count', n) order by month)
      from (
        select
          to_char(m, 'YYYY-MM') as month,
          (
            select count(*) from (
              select created_at from projects           where owner_id     = uid
              union all
              select created_at from grant_applications where user_id      = uid
              union all
              select created_at from events             where organizer_id = uid
            ) rows
            where date_trunc('month', rows.created_at) = m
          ) as n
        from generate_series(
          date_trunc('month', now()) - interval '5 months',
          date_trunc('month', now()),
          interval '1 month'
        ) m
      ) t
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

comment on function public.get_my_member_stats() is
  'Dashboard Overview counts for the calling member, in one round trip. '
  'Replaces 18 client queries across 2 waterfall levels. Scoped to auth.uid(); '
  'takes no subject argument by design.';

-- anon is deliberately absent: the function returns null without a JWT anyway,
-- and not granting it keeps the surface to authenticated callers.
revoke all on function public.get_my_member_stats() from public;
grant execute on function public.get_my_member_stats() to authenticated;
