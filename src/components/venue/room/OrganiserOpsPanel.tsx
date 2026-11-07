import { Fragment, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronRight, Download } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'
import { cn } from '../../../lib/utils'
import { downloadCSV } from '../../../lib/csv-export'
import { useEventTeams } from '../../../hooks/useEventTeams'
import {
  useVenueOpsSnapshot,
  useVenueUsageBreakdown,
  useVenueUsageMeters,
} from '../../../hooks/useVenueUsage'
import {
  readMeter,
  resolveFreeTiers,
  usageForTier,
  type FreeTier,
  type MeterStatus,
  type UsageMeters,
} from '../../../lib/free-tiers'
import {
  formatBytes,
  formatUsage,
  grandTotals,
  groupUsage,
  rangeBounds,
  sortUsage,
  unitOf,
  usageCsvRows,
  visibleKinds,
  type SortColumn,
  type SortDirection,
  type TeamUsage,
  type UsageKind,
  type UsageRange,
  type UsageTotals,
  type UsageUnit,
} from '../../../lib/venue-usage'
import type { Event, VenueOccupant } from '../../../types'
import { Button } from '../../ui/Button'

interface Props {
  event: Event
  /** Everyone in the venue, from the room page's presence bundle. */
  occupants: VenueOccupant[]
  isHost: boolean
}

const KIND_LABEL: Record<UsageKind, MessageDescriptor> = {
  translate_chars: msg`Chat translation`,
  caption_chars: msg`Caption translation`,
  call_seconds: msg`Calls`,
  screen_share_seconds: msg`Screen share`,
  help_request: msg`Help requests`,
  file_bytes: msg`Files`,
  tts_chars: msg`Neural voice`,
  speech_seconds: msg`Speech translation`,
  caption_speech_seconds: msg`Captioned speech`,
  read_aloud_chars: msg`Read aloud`,
}

const UNIT_LABEL: Record<UsageUnit, MessageDescriptor> = {
  chars: msg`characters`,
  minutes: msg`minutes`,
  count: msg`count`,
  bytes: msg`stored now`,
}

const RANGES: Array<{ id: UsageRange; label: MessageDescriptor }> = [
  { id: 'today', label: msg`Today` },
  { id: 'event', label: msg`This event` },
  { id: 'month', label: msg`This month` },
]

const STATUS_BAR: Record<MeterStatus, string> = {
  ok: 'bg-ktip-tropical-500',
  warn: 'bg-ktip-sun-500',
  over: 'bg-red-500',
}

const STATUS_TEXT: Record<MeterStatus, string> = {
  ok: 'text-ktip-sand-500',
  warn: 'text-ktip-sun-800',
  over: 'text-red-700',
}

const STATUS_LABEL: Record<MeterStatus, MessageDescriptor> = {
  ok: msg`Within the allowance`,
  warn: msg`Getting close`,
  over: msg`Over the allowance`,
}

/**
 * Organiser Ops: who is here, what needs attention, and where the free tiers
 * are going.
 *
 * Hosts only. The section is role-gated in the registry and every read is a
 * host-only function (migration 193), so this check is a courtesy rather
 * than the lock.
 *
 * Every part degrades on its own. Before 193 is applied the KPI row still
 * shows presence and teams, and the usage half says it is not switched on.
 */
export function OrganiserOpsPanel({ event, occupants, isHost }: Props) {
  const { t, i18n } = useLingui()
  const [range, setRange] = useState<UsageRange>('event')
  const [sort, setSort] = useState<{ column: SortColumn; direction: SortDirection }>({
    column: 'name',
    direction: 'asc',
  })
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())

  const { teams, loading: teamsLoading } = useEventTeams(isHost ? event.id : undefined)
  const bounds = useMemo(() => rangeBounds(range, event.start_date), [range, event.start_date])
  const breakdown = useVenueUsageBreakdown(isHost ? event.id : undefined, bounds.from, bounds.to)
  const meters = useVenueUsageMeters(isHost ? event.id : undefined)
  const snapshot = useVenueOpsSnapshot(isHost ? event.id : undefined)

  const grouped = useMemo(() => groupUsage(breakdown.data ?? []), [breakdown.data])
  const kinds = useMemo(() => visibleKinds(grouped), [grouped])
  const sorted = useMemo(
    () => sortUsage(grouped, sort.column, sort.direction),
    [grouped, sort.column, sort.direction]
  )
  const totals = useMemo(() => grandTotals(grouped), [grouped])

  if (!isHost) return null

  // ---- KPI row ------------------------------------------------------------
  const present = occupants.filter((o) => o.availability !== 'offline')
  const onTeam = new Set(teams.flatMap((team) => team.members.map((m) => m.user_id)))
  const withoutTeam = present.filter((o) => o.role === 'participant' && !onTeam.has(o.user_id))
  const dash = '–'

  const kpis: Array<{ label: string; value: string; hint?: string }> = [
    { label: t`People online`, value: String(present.length) },
    { label: t`Teams`, value: teamsLoading ? dash : String(teams.length) },
    {
      label: t`Without a team`,
      value: teamsLoading ? dash : String(withoutTeam.length),
      hint: t`Participants online now`,
    },
    {
      label: t`Open help requests`,
      value: snapshot.data ? String(snapshot.data.open_help_requests) : dash,
      hint: t`Hands raised in the last 5 minutes`,
    },
    {
      label: t`Submissions`,
      value:
        snapshot.data && snapshot.data.submissions !== null
          ? String(snapshot.data.submissions)
          : dash,
    },
  ]

  // ---- table actions --------------------------------------------------------
  const toggleSort = (column: SortColumn) =>
    setSort((current) =>
      current.column === column
        ? { column, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { column, direction: column === 'name' ? 'asc' : 'desc' }
    )

  const teamKey = (team: TeamUsage) => team.teamId ?? 'none'
  const toggleTeam = (key: string) =>
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const exportCsv = () => {
    const headers = [
      t`Team`,
      t`Member`,
      ...kinds.map((kind) => `${i18n._(KIND_LABEL[kind])} (${i18n._(UNIT_LABEL[unitOf(kind)])})`),
    ]
    const rows = usageCsvRows(sorted, kinds, {
      noTeam: t`No team`,
      unknownMember: t`Unknown member`,
    })
    const day = new Date().toISOString().slice(0, 10)
    downloadCSV(`usage-${event.slug || event.id}-${range}-${day}.csv`, headers, rows)
  }

  const noUsage = !breakdown.loading && !breakdown.missing && !breakdown.failed && sorted.length === 0

  return (
    <section
      aria-label={t`Organiser ops`}
      className="flex h-full min-w-0 flex-col gap-5 rounded-2xl border border-ktip-sand-100 bg-ktip-cream p-4 shadow-card sm:p-5"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-sm font-bold uppercase tracking-wider text-ktip-sand-700">
          <Trans>Organiser ops</Trans>
        </h2>
      </header>

      {/* KPI row */}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="rounded-xl border border-ktip-sand-100 bg-white px-3 py-2.5">
            <dt className="text-xs font-medium text-ktip-sand-500">{kpi.label}</dt>
            <dd className="font-display text-2xl font-bold text-ktip-sand-900">{kpi.value}</dd>
            {kpi.hint && <dd className="text-xs text-ktip-sand-500">{kpi.hint}</dd>}
          </div>
        ))}
      </dl>

      {breakdown.missing || meters.missing ? (
        <p className="rounded-xl bg-ktip-sand-50 px-4 py-3 text-sm text-ktip-sand-600">
          <Trans>
            Usage tracking is not switched on for this database yet. It starts counting once
            database update 193 is applied.
          </Trans>
        </p>
      ) : (
        <>
          <FreeTierMeters meters={meters.data} loading={meters.loading} failed={meters.failed} />

          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-display text-base font-bold text-ktip-sand-900">
                <Trans>Usage by team</Trans>
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                <div
                  role="radiogroup"
                  aria-label={t`Date range`}
                  className="flex rounded-lg border border-ktip-sand-200 bg-white p-0.5"
                >
                  {RANGES.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={range === option.id}
                      onClick={() => setRange(option.id)}
                      className={cn(
                        'rounded-md px-3 py-1 text-xs font-semibold',
                        range === option.id
                          ? 'bg-ktip-ocean-600 text-white'
                          : 'text-ktip-sand-600 hover:text-ktip-sand-900'
                      )}
                    >
                      {i18n._(option.label)}
                    </button>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportCsv}
                  disabled={sorted.length === 0}
                  icon={<Download size={14} aria-hidden="true" />}
                >
                  <Trans>Export CSV</Trans>
                </Button>
              </div>
            </div>

            {breakdown.loading ? (
              <div className="h-40 animate-pulse-soft rounded-xl bg-ktip-sand-100" />
            ) : breakdown.failed ? (
              <p className="text-sm text-red-700">
                <Trans>Usage could not be loaded. It tries again every minute.</Trans>
              </p>
            ) : noUsage ? (
              <p className="py-4 text-sm text-ktip-sand-500">
                <Trans>Nothing recorded in this range yet.</Trans>
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-ktip-sand-100 bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-ktip-sand-50 text-left text-xs text-ktip-sand-600">
                    <tr>
                      <SortHeader
                        label={t`Team`}
                        column="name"
                        sort={sort}
                        onSort={toggleSort}
                        align="left"
                      />
                      {kinds.map((kind) => (
                        <SortHeader
                          key={kind}
                          label={i18n._(KIND_LABEL[kind])}
                          unit={i18n._(UNIT_LABEL[unitOf(kind)])}
                          column={kind}
                          sort={sort}
                          onSort={toggleSort}
                          align="right"
                        />
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((team) => {
                      const key = teamKey(team)
                      const open = expanded.has(key)
                      const name = team.name ?? t`No team`
                      return (
                        <Fragment key={key}>
                          <tr className="border-t border-ktip-sand-100">
                            <th scope="row" className="px-3 py-2 text-left font-semibold text-ktip-sand-900">
                              <button
                                type="button"
                                onClick={() => toggleTeam(key)}
                                aria-expanded={open}
                                className="flex items-center gap-1.5 whitespace-nowrap hover:text-ktip-ocean-700"
                              >
                                <ChevronRight
                                  size={14}
                                  aria-hidden="true"
                                  className={cn('transition-transform', open && 'rotate-90')}
                                />
                                <span className={cn(!team.name && 'italic text-ktip-sand-500')}>{name}</span>
                                <span className="text-xs font-normal text-ktip-sand-500">
                                  {team.members.length}
                                </span>
                              </button>
                            </th>
                            <UsageCells totals={team.totals} kinds={kinds} locale={i18n.locale} strong />
                          </tr>
                          {open &&
                            team.members.map((member) => (
                              <tr key={`${key}-${member.userId ?? 'unknown'}`} className="bg-ktip-sand-50/60">
                                <th scope="row" className="py-1.5 pl-9 pr-3 text-left font-normal text-ktip-sand-700">
                                  <span className="whitespace-nowrap">{member.name ?? t`Unknown member`}</span>
                                </th>
                                <UsageCells totals={member.totals} kinds={kinds} locale={i18n.locale} />
                              </tr>
                            ))}
                        </Fragment>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-ktip-sand-200">
                      <th scope="row" className="px-3 py-2 text-left font-semibold text-ktip-sand-900">
                        <Trans>Total</Trans>
                      </th>
                      <UsageCells totals={totals} kinds={kinds} locale={i18n.locale} strong />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
            <p className="text-xs text-ktip-sand-500">
              <Trans>
                Each row keeps the team a person was on at the time. Files show what is stored now,
                whatever the range.
              </Trans>
            </p>
          </div>
        </>
      )}
    </section>
  )
}

function SortHeader({
  label,
  unit,
  column,
  sort,
  onSort,
  align,
}: {
  label: string
  unit?: string
  column: SortColumn
  sort: { column: SortColumn; direction: SortDirection }
  onSort: (column: SortColumn) => void
  align: 'left' | 'right'
}) {
  const active = sort.column === column
  const Arrow = sort.direction === 'asc' ? ArrowUp : ArrowDown
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={cn('px-3 py-2 font-semibold', align === 'right' ? 'text-right' : 'text-left')}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          'inline-flex items-center gap-1 whitespace-nowrap hover:text-ktip-sand-900',
          align === 'right' && 'flex-row-reverse',
          active && 'text-ktip-sand-900'
        )}
      >
        <span className="flex flex-col">
          <span>{label}</span>
          {unit && <span className="text-xs font-normal text-ktip-sand-500">{unit}</span>}
        </span>
        {active && <Arrow size={12} aria-hidden="true" />}
      </button>
    </th>
  )
}

function UsageCells({
  totals,
  kinds,
  locale,
  strong,
}: {
  totals: UsageTotals
  kinds: UsageKind[]
  locale: string
  strong?: boolean
}) {
  return (
    <>
      {kinds.map((kind) => (
        <td
          key={kind}
          className={cn(
            'whitespace-nowrap px-3 py-1.5 text-right font-mono',
            strong ? 'text-ktip-sand-900' : 'text-ktip-sand-600',
            !(totals[kind] ?? 0) && 'text-ktip-sand-300'
          )}
        >
          {formatUsage(kind, totals[kind], locale)}
        </td>
      ))}
    </>
  )
}

function FreeTierMeters({
  meters,
  loading,
  failed,
}: {
  meters: UsageMeters | null
  loading: boolean
  failed: boolean
}) {
  const { t, i18n } = useLingui()
  const tiers = useMemo(() => resolveFreeTiers(), [])
  const number = new Intl.NumberFormat(i18n.locale)

  const format = (tier: FreeTier, value: number) => {
    if (tier.unit === 'seconds') {
      const hours = new Intl.NumberFormat(i18n.locale, { maximumFractionDigits: 1 }).format(value / 3600)
      return t`${hours} h`
    }
    return number.format(Math.round(value))
  }

  const filesStored = formatBytes(Number(meters?.team_file_bytes) || 0)

  // This event's share of a monthly tier, where the ledger can say.
  const eventShare = (tier: FreeTier): number | null => {
    if (!meters) return null
    const mine = (kind: string) => Number(meters.kinds?.[kind]?.this_event ?? 0) || 0
    switch (tier.id) {
      case 'livekit_minutes':
        return mine('call_seconds')
      case 'translator_chars':
        return mine('translate_chars') + mine('caption_chars')
      case 'speech_translation_seconds':
        return mine('speech_seconds')
      default:
        return null
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-display text-base font-bold text-ktip-sand-900">
        <Trans>Free tiers, month to date</Trans>
      </h3>
      {loading ? (
        <div className="h-28 animate-pulse-soft rounded-xl bg-ktip-sand-100" />
      ) : failed || !meters ? (
        <p className="text-sm text-red-700">
          <Trans>The meters could not be loaded. They try again every minute.</Trans>
        </p>
      ) : (
        <>
          <ul className="grid gap-3 sm:grid-cols-2">
            {tiers.map((tier) => {
              const reading = readMeter(tier, usageForTier(tier.id, meters))
              const share = eventShare(tier)
              const shareText = share ? format(tier, share) : ''
              const label = i18n._(tier.label)
              const used = format(tier, reading.used)
              const limit = format(tier, tier.limit)
              const percent = Math.round(reading.percent)
              return (
                <li key={tier.id} className="rounded-xl border border-ktip-sand-100 bg-white px-3 py-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold text-ktip-sand-900">{label}</p>
                    <p className="shrink-0 font-mono text-xs text-ktip-sand-600">
                      {used} / {limit}
                    </p>
                  </div>
                  <div
                    role="progressbar"
                    aria-label={label}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.min(percent, 100)}
                    aria-valuetext={t`${percent}% used`}
                    className="mt-2 h-2 overflow-hidden rounded-full bg-ktip-sand-100"
                  >
                    <div
                      className={cn('h-full rounded-full', STATUS_BAR[reading.status])}
                      style={{ width: `${Math.min(reading.percent, 100)}%` }}
                    />
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-2 text-xs">
                    <span className={cn('font-medium', STATUS_TEXT[reading.status])}>
                      {i18n._(STATUS_LABEL[reading.status])} · {percent}%
                    </span>
                    <span className="text-ktip-sand-500">{tier.plan}</span>
                  </div>
                  {share !== null && share > 0 && (
                    <p className="mt-1 text-xs text-ktip-sand-600">
                      <Trans>This event: {shareText}</Trans>
                    </p>
                  )}
                  <p className="mt-1 text-xs text-ktip-sand-500">{i18n._(tier.note)}</p>
                </li>
              )
            })}
          </ul>
          <p className="text-xs text-ktip-sand-500">
            <Trans>Team files across all events: {filesStored}</Trans>
          </p>
        </>
      )}
    </div>
  )
}
