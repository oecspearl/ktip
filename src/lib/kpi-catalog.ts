import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  Award,
  BarChart3,
  Building2,
  CalendarDays,
  DollarSign,
  FolderKanban,
  Gauge,
  Globe,
  Handshake,
  Heart,
  Layers,
  LifeBuoy,
  MessageSquare,
  Repeat,
  Sparkles,
  Timer,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react'
import { ok, unavailable, type Measured } from './measured'

/**
 * The roadmap's results framework, as code.
 *
 * `OECS SKIP KTIP Roadmap v1.1 July 2026` §14 "Success Metrics (KPIs) &
 * Reporting", Tables 32-38. The split with `kpi_targets` (migration 131) is
 * deliberate and is the design:
 *
 *   a KPI's MEANING is code, because it has to be reviewed;
 *   a KPI's TARGET is data, because it will be renegotiated without a deploy.
 *
 * `definitionNote` is the field to read first. Several roadmap KPIs are stated
 * without a definition — "actively participating", "active projects", "active
 * mentors" — and the decision we made is recorded here rather than buried in
 * SQL, because a reviewer comparing our number to theirs needs to know what we
 * counted.
 *
 * English, not lingui: this renders inside src/pages/admin/, which
 * scripts/i18n/config.mjs excludes.
 */

export type KpiTable = 'T32' | 'T33' | 'T34' | 'T35' | 'T36' | 'T37' | 'T38'

export type KpiUnit =
  | 'count'
  | 'percent'
  | 'minutes'
  | 'hours'
  | 'rating'
  | 'currency_xcd'
  | 'nps'

export type KpiCadence =
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'biannual'
  | 'annual'

/** The JSONB blob from get_platform_pulse(), keyed exactly as the RPC builds it. */
export type PlatformPulse = Record<string, number | string | null>

export interface PlatformKpi {
  key: string
  table: KpiTable
  label: string
  icon: LucideIcon
  unit: KpiUnit
  cadence: KpiCadence
  /** Whether a bigger number is better. Ticket time and error rate are 'down'. */
  direction: 'up' | 'down'
  /** Where the number comes from, and what we decided it means. */
  definitionNote: string
  /**
   * 1 — true on deploy day.
   * 2 — a collector whose first useful reading is ~30 days out.
   * 3 — a fact no query can produce; a human attests it.
   */
  phase: 1 | 2 | 3
  read: (pulse: PlatformPulse | undefined) => Measured
}

/** A pulse field, or an honest blank. Never coerces null to zero. */
function num(pulse: PlatformPulse | undefined, key: string): Measured {
  if (!pulse) return unavailable('The platform pulse could not be read')
  const raw = pulse[key]
  if (raw === null || raw === undefined) return unavailable(`${key} was not returned`)
  const value = Number(raw)
  return Number.isFinite(value) ? ok(value) : unavailable(`${key} was not a number`)
}

/** A percentage built from two pulse fields, guarding the zero denominator. */
function ratio(
  pulse: PlatformPulse | undefined,
  numeratorKey: string,
  denominatorKey: string
): Measured {
  const numerator = num(pulse, numeratorKey)
  const denominator = num(pulse, denominatorKey)
  if (numerator.state !== 'ok' || denominator.state !== 'ok') {
    return numerator.state !== 'ok' ? numerator : denominator
  }
  // Zero declared members is not "0% under 35" — it is no reading at all.
  if (denominator.value === 0) return unavailable('Nobody has declared this yet')
  return ok(Math.round((numerator.value / denominator.value) * 1000) / 10)
}

export const PLATFORM_KPIS: PlatformKpi[] = [
  // ------------------------------------------------------------- T32 (PAD)
  {
    key: 't32.firms_participating',
    table: 'T32',
    label: 'Firms & entrepreneurs participating',
    icon: Building2,
    unit: 'count',
    cadence: 'annual',
    direction: 'up',
    definitionNote:
      'The roadmap does not define "actively participating". We count members holding an entrepreneur, private-sector, BSO, NGO or SME role who have at least one activity day in the period — registration alone is not participation, so this is deliberately not the same figure as new firm registrations.',
    phase: 1,
    read: (p) => num(p, 't32.firms_participating'),
  },
  {
    key: 't32.innovations_adopted',
    table: 'T32',
    label: 'Innovations adopted from institutional collaboration',
    icon: Sparkles,
    unit: 'count',
    cadence: 'annual',
    direction: 'up',
    definitionNote:
      'Attested, not measured: impact_records of kind innovation_adopted (migration 134), each naming who asserted it and linking to evidence. Nothing on the platform records adoption and nothing plausibly could.',
    phase: 3,
    read: (p) => num(p, 't32.innovations_adopted'),
  },

  // ------------------------------------------------- T33 (community growth)
  {
    key: 't33.new_registrations_total',
    table: 'T33',
    label: 'New registrations',
    icon: UserPlus,
    unit: 'count',
    cadence: 'monthly',
    direction: 'up',
    definitionNote: 'profiles.created_at within the reporting period.',
    phase: 1,
    read: (p) => num(p, 't33.new_registrations_total'),
  },
  {
    key: 't33.new_registrations_firms',
    table: 'T33',
    label: 'New firm & entrepreneur registrations',
    icon: Building2,
    unit: 'count',
    cadence: 'monthly',
    direction: 'up',
    definitionNote:
      'Registrations in the period holding entrepreneur, private_sector, chamber_admin, ngo or sme.',
    phase: 1,
    read: (p) => num(p, 't33.new_registrations_firms'),
  },
  {
    key: 't33.verified_mentors_investors',
    table: 'T33',
    label: 'Verified mentors & investors',
    icon: UserCheck,
    unit: 'count',
    cadence: 'monthly',
    direction: 'up',
    definitionNote: 'profiles.is_verified AND holding a mentor or investor role.',
    phase: 1,
    read: (p) => num(p, 't33.verified_mentors_investors'),
  },
  {
    key: 't33.active_mentors',
    table: 'T33',
    label: 'Active mentors',
    icon: Handshake,
    unit: 'count',
    cadence: 'monthly',
    direction: 'up',
    definitionNote:
      '"Active" is our definition: holds the mentor role and has at least one activity day in the last 30. Relationships are a separate KPI (T35) and need the mentorships table.',
    phase: 1,
    read: (p) => num(p, 't33.active_mentors'),
  },
  {
    key: 't33.active_investors',
    table: 'T33',
    label: 'Active investors',
    icon: DollarSign,
    unit: 'count',
    cadence: 'monthly',
    direction: 'up',
    definitionNote: 'Holds the investor role and has at least one activity day in the last 30.',
    phase: 1,
    read: (p) => num(p, 't33.active_investors'),
  },
  {
    key: 't33.oecs_state_coverage',
    table: 'T33',
    label: 'OECS member states reached',
    icon: Globe,
    unit: 'count',
    cadence: 'monthly',
    direction: 'up',
    definitionNote:
      'Distinct countries.is_oecs_member values with at least one member. NOTE: the roadmap target is 12; countries currently flags 11. The denominator is read from the table, never hardcoded — raise the discrepancy with the programme lead rather than assuming either number.',
    phase: 1,
    read: (p) => num(p, 't33.oecs_state_coverage'),
  },

  // ------------------------------------------------------ T34 (engagement)
  {
    key: 't34.mau_pct',
    table: 'T34',
    label: 'Monthly active users',
    icon: Users,
    unit: 'percent',
    cadence: 'monthly',
    direction: 'up',
    definitionNote:
      'Distinct members with an activity day in the last 30, over all registered members. Sourced from user_activity_days (066), NOT analytics_events — the latter is consent-gated and would only ever describe consenting sessions.',
    phase: 1,
    read: (p) => num(p, 't34.mau_pct'),
  },
  {
    key: 't34.dau_pct',
    table: 'T34',
    label: 'Daily active users',
    icon: Activity,
    unit: 'percent',
    cadence: 'daily',
    direction: 'up',
    definitionNote: 'Distinct members with an activity day today, over all registered members.',
    phase: 1,
    read: (p) => num(p, 't34.dau_pct'),
  },
  {
    key: 't34.retention_pct',
    table: 'T34',
    label: 'Monthly retention',
    icon: Repeat,
    unit: 'percent',
    cadence: 'monthly',
    direction: 'up',
    definitionNote:
      'Of the members active in the previous 30-day window, the share also active in the current one. The 12-month cohort grid needs 12 months of history; this number does not.',
    phase: 1,
    read: (p) => num(p, 't34.retention_pct'),
  },
  {
    key: 't34.session_minutes',
    table: 'T34',
    label: 'Average session duration',
    icon: Timer,
    unit: 'minutes',
    cadence: 'monthly',
    direction: 'up',
    definitionNote:
      'Derived from the first and last page view in a session. A LOWER BOUND, and over CONSENTING SESSIONS ONLY — the last page of every session contributes nothing, and analytics_events inserts are consent-gated. Label it as such wherever it renders.',
    phase: 2,
    read: (p) => num(p, 't34.session_minutes'),
  },
  {
    key: 't34.nps',
    table: 'T34',
    label: 'Net promoter score',
    icon: Heart,
    unit: 'nps',
    cadence: 'biannual',
    direction: 'up',
    definitionNote:
      '%promoters (9-10) minus %detractors (0-6) from nps_responses, scored 0-10 (migration 133). NULL rather than 0 when nobody has answered — an NPS of zero is a real and quite bad score.',
    phase: 2,
    read: (p) => num(p, 't34.nps'),
  },

  // -------------------------------------------------------- T35 (activity)
  {
    key: 't35.active_projects',
    table: 'T35',
    label: 'Active projects',
    icon: FolderKanban,
    unit: 'count',
    cadence: 'monthly',
    direction: 'up',
    definitionNote:
      'projects has no active flag. Our definition: public, status = active, and touched in the last 90 days.',
    phase: 1,
    read: (p) => num(p, 't35.active_projects'),
  },
  {
    key: 't35.active_mentorships',
    table: 'T35',
    label: 'Active mentorship relationships',
    icon: Handshake,
    unit: 'count',
    cadence: 'monthly',
    direction: 'up',
    definitionNote:
      'mentorships with status = active (migration 133). Before 133 this was uncomputable: mentorship:offer had been a permission with no schema behind it since 063.',
    phase: 2,
    read: (p) => num(p, 't35.active_mentorships'),
  },
  {
    key: 't35.challenges_completed',
    table: 'T35',
    label: 'Innovation challenges completed',
    icon: Award,
    unit: 'count',
    cadence: 'annual',
    direction: 'up',
    definitionNote: 'events with event_type = challenge and status = completed in the period.',
    phase: 1,
    read: (p) => num(p, 't35.challenges_completed'),
  },
  {
    key: 't35.challenge_submissions',
    table: 'T35',
    label: 'Challenge submissions',
    icon: Layers,
    unit: 'count',
    cadence: 'annual',
    direction: 'up',
    definitionNote:
      'event_solutions rows. The roadmap states this per challenge; this is the platform total, so read it against the challenge count beside it.',
    phase: 1,
    read: (p) => num(p, 't35.challenge_submissions'),
  },
  {
    key: 't35.projects_per_month',
    table: 'T35',
    label: 'Projects created',
    icon: FolderKanban,
    unit: 'count',
    cadence: 'monthly',
    direction: 'up',
    definitionNote: 'projects.created_at within the reporting period.',
    phase: 1,
    read: (p) => num(p, 't35.projects_created'),
  },
  {
    key: 't35.forum_posts_per_month',
    table: 'T35',
    label: 'Discussions started',
    icon: MessageSquare,
    unit: 'count',
    cadence: 'monthly',
    direction: 'up',
    definitionNote:
      'forum_posts.created_at in the period — threads, not replies. The roadmap calls these "forum posts".',
    phase: 1,
    read: (p) => num(p, 't35.forum_posts'),
  },
  {
    key: 't35.events_per_month',
    table: 'T35',
    label: 'Events hosted',
    icon: CalendarDays,
    unit: 'count',
    cadence: 'monthly',
    direction: 'up',
    definitionNote:
      'events starting in the period with status published or completed. Drafts and cancellations are not events the platform hosted.',
    phase: 1,
    read: (p) => num(p, 't35.events_hosted'),
  },
  {
    key: 't35.connections_per_active_user',
    table: 'T35',
    label: 'Connections per active user',
    icon: Users,
    unit: 'count',
    cadence: 'monthly',
    direction: 'up',
    definitionNote: 'Accepted connections made in the period, divided by MAU.',
    phase: 1,
    read: (p) => num(p, 't35.connections_per_active_user'),
  },

  // ---------------------------------------------------------- T36 (health)
  {
    key: 't36.satisfaction',
    table: 'T36',
    label: 'User satisfaction',
    icon: Heart,
    unit: 'rating',
    cadence: 'monthly',
    direction: 'up',
    definitionNote: 'Mean feedback.rating (1-5, migration 093) across all rated feedback.',
    phase: 1,
    read: (p) => num(p, 't36.satisfaction'),
  },
  {
    key: 't36.ticket_hours',
    table: 'T36',
    label: 'Average ticket resolution',
    icon: LifeBuoy,
    unit: 'hours',
    cadence: 'monthly',
    direction: 'down',
    definitionNote:
      'Mean hours between feedback.created_at and replied_at (127). The feedback queue IS the ticket queue — no separate table was invented for this.',
    phase: 1,
    read: (p) => num(p, 't36.ticket_hours'),
  },
  {
    key: 't36.uptime_pct',
    table: 'T36',
    label: 'Uptime',
    icon: Gauge,
    unit: 'percent',
    cadence: 'monthly',
    direction: 'up',
    definitionNote:
      'Latest platform_health_samples reading in the period (migration 134), written by an external probe with the service role. A system cannot measure its own downtime — the minutes that matter are the ones where nothing ran.',
    phase: 3,
    read: (p) => num(p, 't36.uptime_pct'),
  },
  {
    key: 't36.error_rate_5xx',
    table: 'T36',
    label: 'HTTP 5xx rate',
    icon: BarChart3,
    unit: 'percent',
    cadence: 'monthly',
    direction: 'down',
    definitionNote: 'Latest platform_health_samples reading in the period (migration 134), fed from Sentry. Lower is better, so the progress bar inverts.',
    phase: 3,
    read: (p) => num(p, 't36.error_rate_5xx'),
  },

  // -------------------------------------------------- T37 (economic impact)
  {
    key: 't37.users_connected_to_funding',
    table: 'T37',
    label: 'Members connected to funding',
    icon: DollarSign,
    unit: 'count',
    cadence: 'quarterly',
    direction: 'up',
    definitionNote:
      'Distinct grant_applications.user_id in the period. This is the count the dashboard was already fetching and never rendering.',
    phase: 1,
    read: (p) => num(p, 't37.users_connected_to_funding'),
  },
  {
    key: 't37.grants_awarded',
    table: 'T37',
    label: 'Grants awarded',
    icon: Award,
    unit: 'count',
    cadence: 'quarterly',
    direction: 'up',
    definitionNote:
      'grant_applications with status approved, decided in the period. Becomes exact once awards are recorded explicitly.',
    phase: 1,
    read: (p) => num(p, 't37.grants_awarded'),
  },
  {
    key: 't37.capital_facilitated_xcd',
    table: 'T37',
    label: 'Capital facilitated (EC$)',
    icon: TrendingUp,
    unit: 'currency_xcd',
    cadence: 'annual',
    direction: 'up',
    definitionNote:
      'Sum of grant_applications.awarded_amount denominated in XCD (migration 133). Awards in other currencies are COUNTED SEPARATELY, never converted — grants.currency defaults to USD and describes the call, not the award, so a converted total would be a fabricated figure.',
    phase: 2,
    read: (p) => num(p, 't37.capital_facilitated_xcd'),
  },

  // ----------------------------------------------------------- T38 (other)
  {
    key: 't38.under_35_pct',
    table: 'T38',
    label: 'Members under 35',
    icon: Users,
    unit: 'percent',
    cadence: 'monthly',
    direction: 'up',
    definitionNote:
      'Of members who declared a date of birth, the share under 35. The denominator is declarations, not all members, so the figure is honest about its coverage. account_age is read only as a count inside a definer function — 091 forbids joining it into a query that returns rows.',
    phase: 1,
    read: (p) => ratio(p, 't38.under_35_count', 't38.under_35_declared'),
  },
  {
    key: 't38.female_pct',
    table: 'T38',
    label: 'Female-identifying members',
    icon: Users,
    unit: 'percent',
    cadence: 'monthly',
    direction: 'up',
    definitionNote:
      'Of members who declared a gender identity, the share female-identifying. member_demographics (133) follows 091\'s posture — declared, sensitive, aggregate-only out of a definer function, never a column on profiles. The denominator is declarations, not all members.',
    phase: 2,
    read: (p) => ratio(p, 't38.female_count', 't38.gender_declared'),
  },
  {
    key: 't38.non_grant_revenue_pct',
    table: 'T38',
    label: 'Revenue from non-grant sources',
    icon: TrendingUp,
    unit: 'percent',
    cadence: 'quarterly',
    direction: 'up',
    definitionNote: 'Attested: the non-grant share of impact_records revenue lines for the period (migration 134). NULL rather than 0 when nothing is recorded — an empty table is not evidence that no revenue was non-grant.',
    phase: 3,
    read: (p) => num(p, 't38.non_grant_revenue_pct'),
  },
]

export const KPI_TABLE_TITLES: Record<KpiTable, string> = {
  T32: 'PAD evaluation metrics',
  T33: 'Community growth',
  T34: 'User engagement',
  T35: 'Platform activity',
  T36: 'Platform health',
  T37: 'Economic impact',
  T38: 'Inclusion & sustainability',
}

export const KPI_TABLE_ORDER: KpiTable[] = ['T32', 'T33', 'T34', 'T35', 'T36', 'T37', 'T38']

/** Formats a reading for display. Units differ enough that this is worth centralising. */
export function formatKpiValue(value: number, unit: KpiUnit): string {
  switch (unit) {
    case 'percent':
      return `${value}%`
    case 'minutes':
      return `${value} min`
    case 'hours':
      return `${value} h`
    case 'rating':
      return value.toFixed(1)
    case 'nps':
      return value > 0 ? `+${value}` : String(value)
    case 'currency_xcd':
      return `EC$${value.toLocaleString()}`
    default:
      return value.toLocaleString()
  }
}

/**
 * Progress toward a target, 0-1.
 *
 * A 'down' KPI (ticket hours, error rate) is met by being BELOW its target, so
 * the ratio inverts — otherwise a resolution time of 2 hours against a 24-hour
 * target would render as 8% of the way there.
 */
export function kpiProgress(
  value: number,
  target: number,
  direction: 'up' | 'down'
): number | null {
  if (!Number.isFinite(target) || target === 0) return null
  const raw = direction === 'up' ? value / target : target / (value || target)
  return Math.max(0, Math.min(raw, 1.5))
}
