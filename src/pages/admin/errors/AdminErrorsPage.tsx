import { useEffect, useMemo, useState } from 'react'
import {
  type ColumnDef,
  type ExpandedState,
  type PaginationState,
  type Row,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import {
  ArrowUpRight,
  BellOff,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  Copy,
  Funnel,
  MoreHorizontal,
  RotateCcw,
  RotateCw,
  Search,
  Settings2,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react'
import { Badge } from './ui/badge'
import { DataGrid } from './ui/data-grid/data-grid'
import { DataGridColumnHeader } from './ui/data-grid/data-grid-column-header'
import { DataGridColumnVisibility } from './ui/data-grid/data-grid-column-visibility'
import { DataGridPagination } from './ui/data-grid/data-grid-pagination'
import { DataGridScrollArea } from './ui/data-grid/data-grid-scroll-area'
import {
  DataGridTable,
  DataGridTableRowSelect,
  DataGridTableRowSelectAll,
} from './ui/data-grid/data-grid-table'
import {
  Frame,
  FrameDescription,
  FrameFooter,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from './ui/frame'
import { Button } from './ui/button'
import { Checkbox } from './ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from './ui/input-group'
import { Label } from './ui/label'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'
import { Skeleton } from './ui/skeleton'
import { useCopyToClipboard } from './ui/use-copy-to-clipboard'
import { useToast } from '../../../contexts/ToastContext'
import {
  isSentryNotConfigured,
  useSentryIssues,
  useSentryTriage,
} from '../../../hooks/useSentryIssues'
import { cn, formatDate } from '../../../lib/utils'
import {
  SENTRY_ISSUE_SCOPES,
  type SentryIssueRow,
  type SentryIssueScope,
  type SentryMutableStatus,
  type SentryStatsPeriod,
} from '../../../types/sentry'
import { SentryIssueDetail } from './SentryIssueDetail'
import { usePageTitle } from '../../../hooks/usePageTitle'

const PERIOD_OPTIONS: Array<{ value: SentryStatsPeriod; label: string }> = [
  { value: '1h', label: 'Last hour' },
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '14d', label: 'Last 14 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
]

const SCOPE_LABELS: Record<SentryIssueScope, string> = {
  unresolved: 'Unresolved',
  resolved: 'Resolved',
  ignored: 'Ignored',
  all: 'All',
}

/** How long each `statsPeriod` is, for the "new in window" stat. */
const PERIOD_MS: Record<SentryStatsPeriod, number> = {
  '1h': 36e5,
  '24h': 864e5,
  '7d': 6048e5,
  '14d': 12096e5,
  '30d': 2592e6,
  '90d': 7776e6,
}

/** Sentry's level vocabulary mapped onto the ReUI badge palette. */
const LEVEL_VARIANTS: Record<
  string,
  'destructive-light' | 'warning-light' | 'info-light' | 'secondary'
> = {
  fatal: 'destructive-light',
  error: 'destructive-light',
  warning: 'warning-light',
  info: 'info-light',
  debug: 'secondary',
}

const STATUS_VARIANTS: Record<string, 'warning-outline' | 'success-outline' | 'secondary'> = {
  unresolved: 'warning-outline',
  resolved: 'success-outline',
  ignored: 'secondary',
}

const numberFormatter = new Intl.NumberFormat('en-US')

/**
 * Compact volume bars. Decorative — the count beside it is the data.
 *
 * Capped at 16 buckets: the column is ~100px wide and has to hold the count as
 * well, so a longer series would compress the bars into an unreadable smear.
 */
function Sparkline({ values }: { values: number[] }) {
  if (!values.length) return <span className="text-muted-foreground/50 text-xs">—</span>

  const series = values.slice(-16)
  const max = Math.max(...series, 1)

  return (
    <div className="flex h-4 shrink-0 items-end gap-px" aria-hidden="true">
      {series.map((value, index) => (
        <span
          key={index}
          className={
            value > 0 ? 'bg-foreground/45 w-0.5 rounded-t-[1px]' : 'bg-border/70 w-0.5'
          }
          style={{ height: `${Math.max((value / max) * 100, value > 0 ? 15 : 8)}%` }}
        />
      ))}
    </div>
  )
}

/**
 * "2h", "3d" — the timestamp columns are too narrow for date-fns' prose
 * ("about 10 hours ago" clips), and the exact time is on the title attribute.
 */
function formatAge(value: string): string {
  const seconds = Math.max((Date.now() - new Date(value).getTime()) / 1000, 0)
  if (seconds < 60) return `${Math.floor(seconds)}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d`
  return `${Math.floor(seconds / 2592000)}mo`
}

/** One cell of the stat strip. Borders instead of cards. */
function Stat({ label, value, loading }: { label: string; value: string; loading: boolean }) {
  return (
    <div className="px-4 py-3 first:pl-0">
      <div className="text-muted-foreground text-[0.6875rem] font-medium tracking-wide uppercase">
        {label}
      </div>
      {loading ? (
        <Skeleton className="mt-1.5 h-6 w-16" />
      ) : (
        <div className="mt-0.5 font-mono text-xl tabular-nums">{value}</div>
      )}
    </div>
  )
}

/**
 * Per-row triage menu. Every entry is a real Sentry write except "Copy short
 * ID", so the dashboard can close an issue without a detour to sentry.io.
 */
function ActionsCell({
  row,
  onStatus,
  onDelete,
}: {
  row: Row<SentryIssueRow>
  onStatus: (issueIds: string[], status: SentryMutableStatus) => void
  onDelete: (issueIds: string[]) => void
}) {
  const { copyToClipboard } = useCopyToClipboard()
  const { success } = useToast()
  const issue = row.original
  const isOpen = issue.status === 'unresolved'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button className="size-7" size="icon" variant="ghost" aria-label="Issue actions">
            <MoreHorizontal />
          </Button>
        }
      />
      <DropdownMenuContent side="bottom" align="end">
        {isOpen ? (
          <>
            <DropdownMenuItem onClick={() => onStatus([issue.id], 'resolved')}>
              <CircleCheck className="size-3.5" />
              Resolve
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onStatus([issue.id], 'ignored')}>
              <BellOff className="size-3.5" />
              Ignore
            </DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuItem onClick={() => onStatus([issue.id], 'unresolved')}>
            <RotateCcw className="size-3.5" />
            Reopen
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            copyToClipboard(issue.shortId)
            success(`Copied ${issue.shortId}`)
          }}
        >
          <Copy className="size-3.5" />
          Copy short ID
        </DropdownMenuItem>
        {issue.permalink && (
          <DropdownMenuItem
            onClick={() => window.open(issue.permalink, '_blank', 'noreferrer,noopener')}
          >
            <ArrowUpRight className="size-3.5" />
            Open in Sentry
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => onDelete([issue.id])}>
          <Trash2 className="size-3.5" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Admin error dashboard: the live Sentry issue stream as a sortable,
 * filterable, searchable data grid inside a Frame container. Each row expands
 * into a sub-table of its latest occurrence's context (IP address, URL,
 * browser, OS, release, tags), and rows can be triaged individually or in bulk.
 */
export default function AdminErrorsPage() {
  usePageTitle('Errors')
  const [scope, setScope] = useState<SentryIssueScope>('unresolved')
  const [statsPeriod, setStatsPeriod] = useState<SentryStatsPeriod>('14d')
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedLevels, setSelectedLevels] = useState<string[]>([])
  const [sorting, setSorting] = useState<SortingState>([{ id: 'lastSeen', desc: true }])
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 25 })
  const [expanded, setExpanded] = useState<ExpandedState>({})
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})

  const { issues, loading, error, isFetching, refetch } = useSentryIssues({ scope, statsPeriod })
  const triage = useSentryTriage()
  const { success, error: toastError } = useToast()

  // Typing shouldn't re-filter on every keystroke of a 100-row window.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery.trim().toLowerCase()), 200)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const filteredIssues = useMemo(
    () =>
      issues.filter((issue) => {
        const matchesLevel = !selectedLevels.length || selectedLevels.includes(issue.level)
        const matchesSearch =
          !debouncedSearch ||
          `${issue.title} ${issue.value} ${issue.culprit} ${issue.shortId} ${issue.type}`
            .toLowerCase()
            .includes(debouncedSearch)
        return matchesLevel && matchesSearch
      }),
    [issues, selectedLevels, debouncedSearch],
  )

  // Facet counts come from the unfiltered window so the numbers stay stable as
  // boxes are ticked, the way Sentry's own filters behave.
  const levelCounts = useMemo(
    () =>
      issues.reduce<Record<string, number>>((counts, issue) => {
        counts[issue.level] = (counts[issue.level] || 0) + 1
        return counts
      }, {}),
    [issues],
  )

  const stats = useMemo(
    () => ({
      issues: filteredIssues.length,
      events: filteredIssues.reduce((sum, issue) => sum + issue.count, 0),
      users: filteredIssues.reduce((sum, issue) => sum + issue.userCount, 0),
      // "New" means the first occurrence falls inside the window, which is
      // what makes a regression visible at a glance.
      fresh: filteredIssues.filter(
        (issue) =>
          issue.firstSeen &&
          Date.now() - new Date(issue.firstSeen).getTime() <= PERIOD_MS[statsPeriod],
      ).length,
    }),
    [filteredIssues, statsPeriod],
  )

  // Any change to the visible set can strand the viewer on a page or a
  // selection that no longer exists.
  useEffect(() => {
    setPagination((previous) => ({ ...previous, pageIndex: 0 }))
    setRowSelection({})
    setExpanded({})
  }, [debouncedSearch, selectedLevels, scope, statsPeriod])

  const applyStatus = (issueIds: string[], status: SentryMutableStatus) => {
    triage.mutate(
      { action: 'setStatus', issueIds, status },
      {
        onSuccess: () => {
          setRowSelection({})
          success(
            issueIds.length === 1
              ? `Issue marked ${status}.`
              : `${issueIds.length} issues marked ${status}.`,
          )
        },
        onError: (mutationError) =>
          toastError(
            mutationError instanceof Error ? mutationError.message : 'Sentry rejected the change.',
          ),
      },
    )
  }

  const deleteIssues = (issueIds: string[]) => {
    const label = issueIds.length === 1 ? 'this issue' : `${issueIds.length} issues`
    if (!window.confirm(`Permanently delete ${label} and all their events from Sentry?`)) return

    triage.mutate(
      { action: 'delete', issueIds },
      {
        onSuccess: () => {
          setRowSelection({})
          success(issueIds.length === 1 ? 'Issue deleted.' : `${issueIds.length} issues deleted.`)
        },
        onError: (mutationError) =>
          toastError(
            mutationError instanceof Error
              ? mutationError.message
              : 'Sentry rejected the deletion. Deleting issues needs the event:admin scope.',
          ),
      },
    )
  }

  /**
   * Per-column loading placeholders.
   *
   * The grid renders `meta.skeleton` inside each cell of a skeleton row (see
   * ui/data-grid/data-grid-table.tsx), and a column that omits it renders an
   * EMPTY cell. With none declared, `loadingMode="skeleton"` produced pageSize
   * collapsed hairlines instead of a table.
   *
   * Shapes mirror the real cell content — the issue cell is two lines, level and
   * status are pills — so the layout does not jump when the data lands.
   */
  const columns = useMemo<ColumnDef<SentryIssueRow>[]>(
    () => [
      {
        id: 'select',
        header: () => <DataGridTableRowSelectAll />,
        cell: ({ row }) => <DataGridTableRowSelect row={row} />,
        size: 32,
        enableSorting: false,
        enableHiding: false,
        enableResizing: false,
        meta: { skeleton: <Skeleton className="size-4 rounded-[4px]" /> },
      },
      {
        id: 'expand',
        header: () => null,
        cell: ({ row }) =>
          row.getCanExpand() ? (
            <Button
              onClick={row.getToggleExpandedHandler()}
              size="icon-sm"
              variant="ghost"
              className="opacity-70 hover:bg-transparent hover:opacity-100"
              aria-label={row.getIsExpanded() ? 'Collapse event context' : 'Expand event context'}
              aria-expanded={row.getIsExpanded()}
            >
              {row.getIsExpanded() ? (
                <ChevronUp aria-hidden="true" />
              ) : (
                <ChevronDown aria-hidden="true" />
              )}
            </Button>
          ) : null,
        size: 32,
        enableSorting: false,
        enableHiding: false,
        enableResizing: false,
        // The grid renders whichever column declares expandedContent, so the
        // sub-table is declared here beside the toggle that opens it.
        meta: {
          expandedContent: (issue: SentryIssueRow) => <SentryIssueDetail issue={issue} />,
          cellClassName: 'align-top',
          skeleton: <Skeleton className="size-4 rounded-sm" />,
        },
      },
      {
        id: 'issue',
        accessorFn: (row) => row.title,
        header: ({ column }) => (
          <DataGridColumnHeader title="Issue" visibility={true} column={column} />
        ),
        cell: ({ row }) => (
          <div className="min-w-0 py-0.5">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[0.8125rem] font-medium" title={row.original.title}>
                {row.original.title}
              </span>
              {row.original.isUnhandled && (
                <Badge variant="destructive-light" size="xs" className="shrink-0">
                  unhandled
                </Badge>
              )}
            </div>
            <div className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-[0.6875rem]">
              <code className="font-mono whitespace-nowrap">{row.original.shortId}</code>
              {row.original.culprit && (
                <>
                  <span className="opacity-40">·</span>
                  <span className="truncate" title={row.original.culprit}>
                    {row.original.culprit}
                  </span>
                </>
              )}
            </div>
          </div>
        ),
        size: 300,
        meta: {
          headerTitle: 'Issue',
          autoSize: true,
          skeleton: (
            <div className="space-y-1.5 py-0.5">
              <Skeleton className="h-3.5 w-[70%]" />
              <Skeleton className="h-2.5 w-[45%]" />
            </div>
          ),
        },
        enableSorting: true,
        enableHiding: false,
      },
      {
        accessorKey: 'level',
        id: 'level',
        header: ({ column }) => (
          <DataGridColumnHeader title="Level" visibility={true} column={column} />
        ),
        cell: ({ row }) => (
          <Badge variant={LEVEL_VARIANTS[row.original.level] ?? 'secondary'} size="sm">
            {row.original.level}
          </Badge>
        ),
        size: 76,
        meta: { headerTitle: 'Level', skeleton: <Skeleton className="h-5 w-14 rounded-md" /> },
      },
      {
        accessorKey: 'status',
        id: 'status',
        header: ({ column }) => (
          <DataGridColumnHeader title="Status" visibility={true} column={column} />
        ),
        cell: ({ row }) => (
          <Badge variant={STATUS_VARIANTS[row.original.status] ?? 'secondary'} size="sm">
            {row.original.substatus ?? row.original.status}
          </Badge>
        ),
        size: 92,
        meta: { headerTitle: 'Status', skeleton: <Skeleton className="h-5 w-16 rounded-md" /> },
      },
      {
        accessorKey: 'count',
        id: 'volume',
        header: ({ column }) => (
          <DataGridColumnHeader title="Events" visibility={true} column={column} />
        ),
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Sparkline values={row.original.eventCounts} />
            <span className="font-mono text-xs tabular-nums">
              {numberFormatter.format(row.original.count)}
            </span>
          </div>
        ),
        size: 104,
        meta: {
          headerTitle: 'Events',
          skeleton: (
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-3 w-4" />
            </div>
          ),
        },
      },
      {
        accessorKey: 'userCount',
        id: 'userCount',
        header: ({ column }) => (
          <DataGridColumnHeader title="Users" visibility={true} column={column} />
        ),
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums">
            {numberFormatter.format(row.original.userCount)}
          </span>
        ),
        size: 56,
        meta: { headerTitle: 'Users', skeleton: <Skeleton className="h-3 w-5" /> },
      },
      {
        id: 'lastSeen',
        accessorFn: (row) => (row.lastSeen ? new Date(row.lastSeen).getTime() : 0),
        header: ({ column }) => (
          <DataGridColumnHeader title="Last seen" visibility={true} column={column} />
        ),
        cell: ({ row }) =>
          row.original.lastSeen ? (
            <span
              className="text-muted-foreground text-xs whitespace-nowrap"
              title={formatDate(row.original.lastSeen, "d MMM yyyy 'at' HH:mm:ss")}
            >
              {formatAge(row.original.lastSeen)} ago
            </span>
          ) : (
            <span className="text-muted-foreground/60 text-xs">—</span>
          ),
        size: 88,
        meta: { headerTitle: 'Last seen', skeleton: <Skeleton className="h-3 w-12" /> },
      },
      {
        id: 'firstSeen',
        accessorFn: (row) => (row.firstSeen ? new Date(row.firstSeen).getTime() : 0),
        header: ({ column }) => (
          <DataGridColumnHeader title="First seen" visibility={true} column={column} />
        ),
        cell: ({ row }) =>
          row.original.firstSeen ? (
            <span
              className="text-muted-foreground text-xs whitespace-nowrap"
              title={formatDate(row.original.firstSeen, "d MMM yyyy 'at' HH:mm:ss")}
            >
              {formatAge(row.original.firstSeen)} ago
            </span>
          ) : (
            <span className="text-muted-foreground/60 text-xs">—</span>
          ),
        size: 88,
        meta: { headerTitle: 'First seen', skeleton: <Skeleton className="h-3 w-12" /> },
      },
      {
        id: 'actions',
        header: () => null,
        cell: ({ row }) => <ActionsCell row={row} onStatus={applyStatus} onDelete={deleteIssues} />,
        size: 44,
        enableSorting: false,
        enableHiding: false,
        enableResizing: false,
        meta: { skeleton: <Skeleton className="size-6 rounded-md" /> },
      },
    ],
    // applyStatus / deleteIssues close over stable setters and the mutation
    // object; rebuilding columns on every render would reset column sizing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const [columnOrder, setColumnOrder] = useState<string[]>(
    columns.map((column) => column.id as string),
  )

  // The admin shell leaves ~890px for content and the table is fixed-layout, so
  // the visible columns have to fit that budget or the last ones are scrolled
  // out of sight under the frame's rounded edge. First seen is the least useful
  // at a glance; it stays one click away in the Columns menu.
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    firstSeen: false,
  })

  const table = useReactTable({
    columns,
    data: filteredIssues,
    pageCount: Math.ceil(filteredIssues.length / pagination.pageSize),
    getRowId: (row) => row.id,
    getRowCanExpand: () => true,
    state: { pagination, sorting, expanded, rowSelection, columnOrder, columnVisibility },
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    onExpandedChange: setExpanded,
    onRowSelectionChange: setRowSelection,
    onColumnOrderChange: setColumnOrder,
    onColumnVisibilityChange: setColumnVisibility,
    enableRowSelection: true,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
  })

  const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id])
  const hasFilters = Boolean(debouncedSearch) || selectedLevels.length > 0
  const notConfigured = isSentryNotConfigured(error)

  if (notConfigured) {
    return (
      <div className="errors-console space-y-5">
        <PageHeading />
        <SetupNotice />
      </div>
    )
  }

  return (
    <div className="errors-console space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeading />
        <div className="flex items-center gap-1.5">
          <Select
            value={statsPeriod}
            onValueChange={(value) => setStatsPeriod(value as SentryStatsPeriod)}
          >
            <SelectTrigger size="sm" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {PERIOD_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            aria-label="Refresh issues"
          >
            <RotateCw className={cn('size-3.5', isFetching && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stat strip */}
      <div className="border-border divide-border grid grid-cols-2 divide-x border-y sm:grid-cols-4">
        <Stat label="Issues" value={numberFormatter.format(stats.issues)} loading={loading} />
        <Stat label="Events" value={numberFormatter.format(stats.events)} loading={loading} />
        <Stat
          label="Users affected"
          value={numberFormatter.format(stats.users)}
          loading={loading}
        />
        <Stat label="New in window" value={numberFormatter.format(stats.fresh)} loading={loading} />
      </div>

      {/* Scope tabs */}
      <div className="border-border bg-muted/40 inline-flex items-center gap-0.5 rounded-lg border p-0.5">
        {SENTRY_ISSUE_SCOPES.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setScope(option)}
            aria-pressed={scope === option}
            className={cn(
              'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
              scope === option
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {SCOPE_LABELS[option]}
          </button>
        ))}
      </div>

      {error && (
        <div className="border-destructive/25 bg-destructive/5 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm">
          <TriangleAlert className="text-destructive mt-0.5 size-4 shrink-0" />
          <div className="min-w-0">
            <p className="font-medium">Could not load issues from Sentry.</p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {error instanceof Error ? error.message : String(error)}
            </p>
          </div>
        </div>
      )}

      <DataGrid
        table={table}
        recordCount={filteredIssues.length}
        isLoading={loading}
        loadingMode="skeleton"
        emptyMessage={
          hasFilters
            ? 'No issues match these filters.'
            : `No ${SCOPE_LABELS[scope].toLowerCase()} issues in this window.`
        }
        tableLayout={{
          dense: true,
          rowBorder: true,
          headerSticky: true,
          columnsPinnable: true,
          columnsMovable: true,
          columnsVisibility: true,
          columnsResizable: false,
        }}
      >
        <Frame className="w-full" stacked dense>
          <FrameHeader className="flex w-full flex-row flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <FrameTitle>{SCOPE_LABELS[scope]} issues</FrameTitle>
              <FrameDescription>
                {selectedIds.length > 0
                  ? `${selectedIds.length} selected`
                  : `${numberFormatter.format(filteredIssues.length)} of ${numberFormatter.format(issues.length)} in window`}
              </FrameDescription>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Bulk actions replace the toolbar's filters while rows are selected */}
              {selectedIds.length > 0 ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={triage.isPending}
                    onClick={() => applyStatus(selectedIds, 'resolved')}
                  >
                    <CircleCheck className="size-3.5" />
                    Resolve
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={triage.isPending}
                    onClick={() => applyStatus(selectedIds, 'ignored')}
                  >
                    <BellOff className="size-3.5" />
                    Ignore
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={triage.isPending}
                    onClick={() => applyStatus(selectedIds, 'unresolved')}
                  >
                    <RotateCcw className="size-3.5" />
                    Reopen
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={triage.isPending}
                    onClick={() => deleteIssues(selectedIds)}
                  >
                    <Trash2 className="size-3.5" />
                    Delete
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setRowSelection({})}>
                    <X className="size-3.5" />
                    Clear
                  </Button>
                </>
              ) : (
                <>
                  <InputGroup className="bg-background w-56">
                    <InputGroupAddon align="inline-start">
                      <Search />
                    </InputGroupAddon>
                    <InputGroupInput
                      placeholder="Search title, culprit, KTIP-1A…"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      aria-label="Search issues"
                    />
                    {searchQuery.length > 0 && (
                      <InputGroupAddon align="inline-end">
                        <InputGroupButton
                          aria-label="Clear search"
                          title="Clear"
                          size="icon-xs"
                          onClick={() => setSearchQuery('')}
                        >
                          <X />
                        </InputGroupButton>
                      </InputGroupAddon>
                    )}
                  </InputGroup>

                  <Popover>
                    <PopoverTrigger
                      render={
                        <Button variant="outline" size="sm">
                          <Funnel className="size-3.5" />
                          Level
                          {selectedLevels.length > 0 && (
                            <Badge size="sm" variant="info-outline">
                              {selectedLevels.length}
                            </Badge>
                          )}
                        </Button>
                      }
                    />
                    <PopoverContent className="w-44" align="end">
                      <div className="space-y-3">
                        <div className="text-muted-foreground text-xs font-medium">
                          Filter by level
                        </div>
                        <div className="space-y-3">
                          {Object.keys(levelCounts)
                            .sort()
                            .map((level) => (
                              <div key={level} className="flex items-center gap-2.5">
                                <Checkbox
                                  id={`level-${level}`}
                                  checked={selectedLevels.includes(level)}
                                  onCheckedChange={(checked) =>
                                    setSelectedLevels((previous) =>
                                      checked === true
                                        ? [...previous, level]
                                        : previous.filter((entry) => entry !== level),
                                    )
                                  }
                                />
                                <Label
                                  htmlFor={`level-${level}`}
                                  className="flex grow items-center justify-between gap-1.5 font-normal"
                                >
                                  {level}
                                  <span className="text-muted-foreground">
                                    {levelCounts[level]}
                                  </span>
                                </Label>
                              </div>
                            ))}
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>

                  {hasFilters && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSearchQuery('')
                        setSelectedLevels([])
                      }}
                    >
                      <X className="size-3.5" />
                      Reset
                    </Button>
                  )}

                  <DataGridColumnVisibility
                    table={table}
                    trigger={
                      <Button variant="outline" size="sm">
                        <Settings2 className="size-3.5" />
                        Columns
                      </Button>
                    }
                  />
                </>
              )}
            </div>
          </FrameHeader>

          <FramePanel className="p-0 shadow-none">
            {/* The height cap cannot be passed here: this className lands on the
                scroll-area wrapper, not on the viewport that actually scrolls.
                It lives on [data-slot=scroll-area-viewport] in ./index.css. */}
            <DataGridScrollArea>
              <DataGridTable />
            </DataGridScrollArea>
          </FramePanel>

          <FrameFooter className="py-1.5 pr-2 pl-2.5">
            <DataGridPagination sizes={[10, 25, 50, 100]} />
          </FrameFooter>
        </Frame>
      </DataGrid>
    </div>
  )
}

function PageHeading() {
  return (
    <div>
      <div className="text-muted-foreground text-[0.6875rem] font-semibold tracking-widest uppercase">
        Monitoring
      </div>
      <h1 className="font-display mt-0.5 text-2xl leading-none font-semibold tracking-tight">
        Errors
      </h1>
      <p className="text-muted-foreground mt-1.5 text-sm">
        Live Sentry issues for this project. Expand a row for the request and client context of its
        most recent occurrence.
      </p>
    </div>
  )
}

/**
 * Shown when the proxy reports 501: error monitoring is not wired up on the
 * server. Deliberately says nothing about the specific configuration — the fix
 * is an operator action, and the details stay server-side.
 */
function SetupNotice() {
  return (
    <Frame className="w-full">
      <FramePanel>
        <div className="flex items-start gap-3">
          <TriangleAlert className="text-warning mt-0.5 size-4 shrink-0" />
          <div className="min-w-0 space-y-1">
            <h2 className="text-sm font-semibold">Error monitoring is unavailable</h2>
            <p className="text-muted-foreground text-sm">
              This dashboard is not connected to the monitoring service. Please contact your system
              administrator.
            </p>
          </div>
        </div>
      </FramePanel>
    </Frame>
  )
}
