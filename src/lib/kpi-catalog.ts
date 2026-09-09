import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  Award,
  BarChart3,
  BookOpen,
  Building2,
  CalendarDays,
  DollarSign,
  Flag,
  FolderKanban,
  Gauge,
  Globe,
  Handshake,
  Heart,
  Landmark,
  Layers,
  LifeBuoy,
  Link2,
  MapPin,
  MessageSquare,
  Plane,
  Repeat,
  Scale,
  ShieldAlert,
  Sparkles,
  Ticket,
  Timer,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
  Zap,
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
  | 'milliseconds'

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
  /**
   * Reported, not targeted. The roadmap asks for some figures to be published
   * without setting a number to hit (§6 complaint volumes); a tile for one of
   * these shows the reading and no bar.
   */
  reportedOnly?: true
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

  // ------------------------------------------------------------------------
  // Indicators the roadmap states outside §14's tables — the §3 objectives and
  // the Table 15–17 phase success criteria — plus two T36 figures the pulse
  // already emitted and nothing rendered. Read from get_phase4_pulse
  // (migration 146). Grouped by `table` for display, so their position here
  // does not matter.
  // ------------------------------------------------------------------------
  {
    key: 't33.resources_published',
    table: 'T33',
    label: 'Knowledge resources published',
    icon: BookOpen,
    unit: 'count',
    cadence: 'monthly',
    direction: 'up',
    definitionNote:
      'resources with is_published, cumulative. Roadmap §3 "50+ knowledge resources published and accessed" and Table 15 "knowledge library seeded".',
    phase: 1,
    read: (p) => num(p, 't33.resources_published'),
  },
  {
    key: 't33.partners_integrated',
    table: 'T33',
    label: 'Partners formally integrated',
    icon: Landmark,
    unit: 'count',
    cadence: 'quarterly',
    direction: 'up',
    definitionNote:
      'Verified institutions (064) plus verified employers (058). "Formally integrated" is undefined by the roadmap; a completed verification, which names who verified and when, is the closest thing the platform records to a signed MOU.',
    phase: 1,
    read: (p) => num(p, 't33.partners_integrated'),
  },
  {
    key: 't33.partner_onboarded_users',
    table: 'T33',
    label: 'Members onboarded through partnerships',
    icon: Link2,
    unit: 'count',
    cadence: 'monthly',
    direction: 'up',
    definitionNote:
      'Distinct members who arrived through Virtual Campus single sign-on (vc_identities, 068) or hold an approved institution membership (064). Table 15 asks for 50 by launch and Table 16 for 100 by month six.',
    phase: 1,
    read: (p) => num(p, 't33.partner_onboarded_users'),
  },
  {
    key: 't33.diaspora_members',
    table: 'T33',
    label: 'Diaspora members registered',
    icon: Plane,
    unit: 'count',
    cadence: 'quarterly',
    direction: 'up',
    definitionNote:
      'Members holding the diaspora organisation role (110). Table 17 targets 50; the dedicated diaspora onboarding it describes is a Months 6–12 item, so this reads low until that lands.',
    phase: 2,
    read: (p) => num(p, 't33.diaspora_members'),
  },
  {
    key: 't35.event_registrations',
    table: 'T35',
    label: 'Event registrations',
    icon: Ticket,
    unit: 'count',
    cadence: 'monthly',
    direction: 'up',
    definitionNote: 'event_rsvps created in the period. Table 15: "10+ events listed; 500+ event registrations".',
    phase: 1,
    read: (p) => num(p, 't35.event_registrations'),
  },
  {
    key: 't35.resource_reach_pct',
    table: 'T35',
    label: 'Resource library reach',
    icon: BookOpen,
    unit: 'percent',
    cadence: 'monthly',
    direction: 'up',
    definitionNote:
      'Signed-in members with at least one page view under /resources in the period, as a share of monthly active users. Page views are consent-gated (022), so this can only ever describe consenting sessions and will read LOW — the same caveat as session duration. Table 15 targets 70%.',
    phase: 1,
    read: (p) => num(p, 't35.resource_reach_pct'),
  },
  {
    key: 't35.challenge_submission_states',
    table: 'T35',
    label: 'States represented in challenge submissions',
    icon: MapPin,
    unit: 'count',
    cadence: 'quarterly',
    direction: 'up',
    definitionNote:
      'Distinct profile countries among event_solutions authors in the period. Table 16: "35+ challenge submissions from >= 7 OECS states".',
    phase: 1,
    read: (p) => num(p, 't35.challenge_submission_states'),
  },
  {
    key: 't36.p75_lcp_ms',
    table: 'T36',
    label: 'Page load, p75',
    icon: Zap,
    unit: 'milliseconds',
    cadence: 'weekly',
    direction: 'down',
    definitionNote:
      '75th percentile of Largest Contentful Paint reported by real readers (web_vitals:lcp beacons, consent-gated) over the period. Roadmap §14 Table 36: "<3 seconds (3G)". The Lighthouse figure in scripts/perf is a build-machine number and is not this.',
    phase: 1,
    read: (p) => num(p, 't36.p75_lcp_ms_rum'),
  },
  {
    key: 't36.security_incidents',
    table: 'T36',
    label: 'Critical security incidents',
    icon: ShieldAlert,
    unit: 'count',
    cadence: 'quarterly',
    direction: 'down',
    definitionNote:
      'impact_records of kind security_incident in the period (134) — attested by a person with evidence, never inferred from logs. The target is zero, so the reading is met only by an empty count.',
    phase: 1,
    read: (p) => num(p, 't36.security_incidents'),
  },
  {
    key: 't36.moderation_review_hours',
    table: 'T36',
    label: 'Flagged content review time',
    icon: Flag,
    unit: 'hours',
    cadence: 'monthly',
    direction: 'down',
    definitionNote:
      'Mean hours from content_reports.created_at to resolved_at for reports resolved in the period (065). Roadmap §5: "flagged content reviewed within 24 hours".',
    phase: 1,
    read: (p) => num(p, 't36.moderation_review_hours'),
  },
  {
    key: 't36.complaints_total',
    table: 'T36',
    label: 'Complaints & reports received',
    icon: Scale,
    unit: 'count',
    cadence: 'monthly',
    direction: 'down',
    definitionNote:
      'Content reports (065) + takedown notices (117) + grievances (018) filed in the period. Roadmap §6 requires aggregate complaint volumes in the monthly and quarterly report; there is no target, only the number.',
    phase: 1,
    reportedOnly: true,
    read: (p) => num(p, 't36.complaints_total'),
  },
  {
    key: 't37.grants_listed',
    table: 'T37',
    label: 'Funding opportunities listed',
    icon: DollarSign,
    unit: 'count',
    cadence: 'monthly',
    direction: 'up',
    definitionNote:
      'Active grants whose deadline is unset or has not passed at the start of the period. Table 15: "20+ funding opportunities listed".',
    phase: 1,
    read: (p) => num(p, 't37.grants_listed'),
  },
  {
    key: 't37.grants_directory_reach_pct',
    table: 'T37',
    label: 'Grants directory reach',
    icon: DollarSign,
    unit: 'percent',
    cadence: 'monthly',
    direction: 'up',
    definitionNote:
      'Signed-in members with at least one page view under /grants in the period, as a share of monthly active users. Consent-gated, so reads low — see resource reach. Table 15 targets 60% of active users monthly.',
    phase: 1,
    read: (p) => num(p, 't37.grants_directory_reach_pct'),
  },
  {
    key: 't37.projects_reached_revenue',
    table: 'T37',
    label: 'Projects tracked to early revenue',
    icon: TrendingUp,
    unit: 'count',
    cadence: 'annual',
    direction: 'up',
    definitionNote:
      'Roadmap §3: "at least 5 innovation projects tracked from ideation to early-stage revenue". Nothing links a revenue record to a project yet, so this is attested — a Phase 3 collector.',
    phase: 3,
    read: (p) => num(p, 't37.projects_reached_revenue'),
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
    case 'milliseconds':
      return `${Math.round(value).toLocaleString()} ms`
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
  if (!Number.isFinite(target)) return null
  // A zero target only makes sense for a 'down' KPI ("zero critical
  // incidents"): met exactly when the reading is zero, missed by any other
  // reading. There is no ratio to take, so it is decided outright.
  if (target === 0) return direction === 'down' ? (value <= 0 ? 1 : 0) : null
  const raw = direction === 'up' ? value / target : target / (value || target)
  return Math.max(0, Math.min(raw, 1.5))
}

/** On track, close enough, needs someone, or nothing to judge. */
export type KpiStatus = 'good' | 'warn' | 'bad' | 'none'

/**
 * The one place the thresholds live.
 *
 * 100% is met, 80% is close enough to leave alone, below that needs someone.
 * Tiles, the radial gauges, the overview strip and the report fact pack all
 * read this so a KPI cannot be amber on one surface and green on another.
 */
export function kpiStatus(progress: number | null): KpiStatus {
  if (progress === null) return 'none'
  if (progress >= 1) return 'good'
  if (progress >= 0.8) return 'warn'
  return 'bad'
}
