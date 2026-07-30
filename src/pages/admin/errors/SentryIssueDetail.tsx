import { useMemo, useState } from 'react'
import {
  type ColumnDef,
  type PaginationState,
  type SortingState,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { AlertCircle, ArrowUpRight, Check, Copy } from 'lucide-react'
import { Badge } from './ui/badge'
import { DataGrid, DataGridContainer } from './ui/data-grid/data-grid'
import { DataGridColumnHeader } from './ui/data-grid/data-grid-column-header'
import { DataGridPagination } from './ui/data-grid/data-grid-pagination'
import { DataGridScrollArea } from './ui/data-grid/data-grid-scroll-area'
import { DataGridTable } from './ui/data-grid/data-grid-table'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { Skeleton } from './ui/skeleton'
import { useCopyToClipboard } from './ui/use-copy-to-clipboard'
import { useSentryIssueEvent } from '../../../hooks/useSentryIssues'
import { formatDate } from '../../../lib/utils'
import type { SentryAttributeRow, SentryEventDetail, SentryIssueRow } from '../../../types/sentry'

/** Source groups, mapped onto the badge palette so the table reads at a glance. */
const GROUP_VARIANTS: Record<
  SentryAttributeRow['group'],
  'info-light' | 'primary-light' | 'success-light' | 'warning-light' | 'secondary'
> = {
  request: 'info-light',
  client: 'primary-light',
  release: 'success-light',
  user: 'warning-light',
  tag: 'secondary',
}

const GROUP_LABELS: Record<SentryAttributeRow['group'], string> = {
  request: 'Request',
  client: 'Client',
  release: 'Release',
  user: 'User',
  tag: 'Tag',
}

/** Copy affordance that confirms in place rather than firing a toast per cell. */
function CopyValueButton({ value }: { value: string }) {
  const { copyToClipboard, isCopied } = useCopyToClipboard()

  return (
    <Button
      variant="ghost"
      size="icon-xs"
      onClick={() => copyToClipboard(value)}
      aria-label={isCopied ? 'Copied' : 'Copy value'}
      className="opacity-0 transition-opacity group-hover/attr:opacity-100 focus-visible:opacity-100"
    >
      {isCopied ? <Check className="size-3" /> : <Copy className="size-3" />}
    </Button>
  )
}

/**
 * The sub-table: the event's context flattened into sortable, paginated
 * key/value rows — IP address, URL, browser, OS, release, user and every
 * remaining Sentry tag.
 *
 * A nested DataGrid rather than a fixed definition list, so the same table
 * affordances (sorting, paging) apply to context as to the issue stream, and a
 * new tag needs no layout change to become visible.
 */
function AttributesSubTable({ attributes }: { attributes: SentryAttributeRow[] }) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 8 })

  const columns = useMemo<ColumnDef<SentryAttributeRow>[]>(
    () => [
      {
        accessorKey: 'group',
        id: 'group',
        header: ({ column }) => <DataGridColumnHeader title="Source" column={column} />,
        cell: ({ row }) => (
          <Badge variant={GROUP_VARIANTS[row.original.group]} size="sm">
            {GROUP_LABELS[row.original.group]}
          </Badge>
        ),
        size: 100,
        enableSorting: true,
      },
      {
        accessorKey: 'key',
        id: 'key',
        header: ({ column }) => <DataGridColumnHeader title="Attribute" column={column} />,
        cell: ({ row }) => (
          <span className="text-foreground font-mono text-xs">{row.original.key}</span>
        ),
        size: 180,
        enableSorting: true,
      },
      {
        accessorKey: 'value',
        id: 'value',
        header: ({ column }) => <DataGridColumnHeader title="Value" column={column} />,
        cell: ({ row }) => {
          const { value, absentReason } = row.original

          if (!value) {
            return (
              <span className="text-muted-foreground/70 text-xs italic">
                {absentReason ?? 'Not reported'}
              </span>
            )
          }

          return (
            <div className="group/attr flex min-w-0 items-center gap-1">
              <span className="min-w-0 truncate font-mono text-xs" title={value}>
                {value}
              </span>
              <CopyValueButton value={value} />
            </div>
          )
        },
        size: 420,
        // Absent values sort last regardless of direction: an empty cell is
        // never what the operator is looking for.
        sortingFn: (a, b) =>
          (a.original.value ?? '\uffff').localeCompare(b.original.value ?? '\uffff'),
        enableSorting: true,
      },
    ],
    [],
  )

  const table = useReactTable({
    data: attributes,
    columns,
    pageCount: Math.ceil(attributes.length / pagination.pageSize),
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (row) => row.id,
  })

  return (
    <DataGrid
      table={table}
      recordCount={attributes.length}
      tableLayout={{ dense: true, rowBorder: true }}
      emptyMessage="No context on this event."
    >
      <div className="w-full min-w-0 space-y-2">
        <Card className="p-0">
          <DataGridContainer className="min-w-0">
            <DataGridScrollArea className="min-w-0">
              <DataGridTable />
            </DataGridScrollArea>
          </DataGridContainer>
        </Card>
        <DataGridPagination sizes={[8, 16, 32]} className="pb-1" />
      </div>
    </DataGrid>
  )
}

/** Innermost-first frames. App frames are highlighted; vendor frames dim. */
function StackTrace({ frames }: { frames: SentryEventDetail['frames'] }) {
  if (!frames.length) {
    return <p className="text-muted-foreground text-xs">No stack trace on this event.</p>
  }

  return (
    // Scrolls sideways instead of truncating: bundler paths are long and the
    // interesting part is the end of them. `w-max min-w-full` lets the card grow
    // to the widest frame while still filling the panel when every frame is short.
    <div data-scroll-x className="max-w-full">
      <Card className="divide-border w-max min-w-full divide-y p-0">
      {frames.map((frame, index) => (
        <div
          key={`${frame.filename}:${frame.lineNo}:${index}`}
          className={
            frame.inApp
              ? 'flex items-baseline gap-2 px-2.5 py-1.5 font-mono text-[0.6875rem] whitespace-nowrap'
              : 'text-muted-foreground flex items-baseline gap-2 px-2.5 py-1.5 font-mono text-[0.6875rem] whitespace-nowrap'
          }
        >
          <span className="text-muted-foreground/60 w-4 shrink-0 text-right tabular-nums">
            {index}
          </span>
          <span className="text-foreground shrink-0 font-medium">{frame.function ?? '<anon>'}</span>
          <span className="shrink-0">
            {frame.filename ?? 'unknown'}
            {frame.lineNo !== null && (
              <span className="text-muted-foreground">
                :{frame.lineNo}
                {frame.colNo !== null && `:${frame.colNo}`}
              </span>
            )}
          </span>
          {frame.inApp && (
            <Badge variant="primary-light" size="xs" className="ml-auto shrink-0 ps-4">
              app
            </Badge>
          )}
        </div>
      ))}
      </Card>
    </div>
  )
}

function Breadcrumbs({ breadcrumbs }: { breadcrumbs: SentryEventDetail['breadcrumbs'] }) {
  if (!breadcrumbs.length) {
    return <p className="text-muted-foreground text-xs">No breadcrumbs on this event.</p>
  }

  return (
    // Same as the stack trace: breadcrumb messages carry things like full
    // serialised class lists, so they scroll rather than get cut off.
    <div data-scroll-x className="max-w-full">
      <Card className="divide-border w-max min-w-full divide-y p-0">
        {breadcrumbs.map((crumb, index) => (
          <div
            key={index}
            className="flex items-baseline gap-2 px-2.5 py-1.5 text-[0.6875rem] whitespace-nowrap"
          >
            {/* Category and level stay pinned while the message scrolls between
                them, so a half-scrolled row still says what it is and how bad it
                is. Both need an opaque background to cover the text passing
                underneath — bg-card matches the row.

                `truncate` belongs on the category even though the row scrolls: one
                longer than the fixed width (sentry.simulator) would otherwise
                overrun the message. The full value is on the title. */}
            <span
              className="text-muted-foreground bg-card sticky start-0 z-10 w-28 shrink-0 truncate font-mono"
              title={crumb.category ?? undefined}
            >
              {crumb.category ?? '—'}
            </span>
            <span className="shrink-0">{crumb.message ?? '—'}</span>
            <span className="text-muted-foreground/70 bg-card sticky end-0 z-10 ml-auto shrink-0 ps-4 font-mono">
              {crumb.level ?? ''}
            </span>
          </div>
        ))}
      </Card>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-muted-foreground mb-1.5 text-[0.6875rem] font-semibold tracking-wider uppercase">
      {children}
    </h4>
  )
}

/**
 * The full issue title, wrapped rather than truncated.
 *
 * The parent row has a fixed-width Issue column and truncates to one line, which
 * is right for scanning but means a long `Error: ...` message is unreadable. This
 * repeats it in the expanded panel with no truncation, so opening a row is how
 * you read the whole name. It renders in the loading and error states too — the
 * title comes from the row that is already in hand, so there is nothing to wait
 * for.
 */
function IssueHeading({ issue }: { issue: SentryIssueRow }) {
  return (
    <div className="min-w-0 space-y-1">
      <div className="flex flex-wrap items-start gap-1.5">
        <h3 className="text-[0.8125rem] leading-snug font-semibold break-words">{issue.title}</h3>
        {issue.isUnhandled && (
          <Badge variant="destructive-light" size="xs" className="mt-px shrink-0">
            unhandled
          </Badge>
        )}
      </div>
      {issue.culprit && (
        <p className="text-muted-foreground font-mono text-[0.6875rem] break-all">
          {issue.culprit}
        </p>
      )}
    </div>
  )
}

/**
 * The expanded sub-row for one issue: the context of its most recent
 * occurrence as a sub-table, plus the stack trace and breadcrumbs.
 *
 * Fetched lazily — this component only mounts once its row is expanded, so
 * opening the dashboard costs one request no matter how many rows are visible.
 */
export function SentryIssueDetail({ issue }: { issue: SentryIssueRow }) {
  const { event, loading, error } = useSentryIssueEvent(issue.id)
  const { copyToClipboard, isCopied } = useCopyToClipboard()

  if (loading) {
    return (
      <div className="bg-muted/30 space-y-3 p-3 pl-12">
        <IssueHeading issue={issue} />
        <Skeleton className="h-3 w-48" />
        <Skeleton className="h-52 w-full" />
      </div>
    )
  }

  if (error || !event) {
    return (
      <div className="bg-muted/30 min-w-0 space-y-3 p-3 pl-12">
        <IssueHeading issue={issue} />
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <AlertCircle className="size-3.5 shrink-0" />
          {error instanceof Error
            ? error.message
            : 'Could not load the latest event for this issue.'}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-muted/30 min-w-0 space-y-3 p-3 pl-12">
      <IssueHeading issue={issue} />

      {/* Occurrence header */}
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className="text-muted-foreground text-[0.6875rem] font-semibold tracking-wider uppercase">
          Latest event
        </span>
        <code className="text-muted-foreground font-mono text-[0.6875rem]">{event.eventId}</code>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => copyToClipboard(event.eventId)}
          aria-label={isCopied ? 'Copied event ID' : 'Copy event ID'}
        >
          {isCopied ? <Check className="size-3" /> : <Copy className="size-3" />}
        </Button>
        {event.dateCreated && (
          <span className="text-muted-foreground text-[0.6875rem]">
            {formatDate(event.dateCreated, "d MMM yyyy 'at' HH:mm:ss")}
          </span>
        )}
        <div className="grow" />
        {(event.permalink || issue.permalink) && (
          <Button
            variant="outline"
            size="xs"
            // Base UI needs telling that the rendered element is not a
            // <button>, or it warns about lost button semantics.
            nativeButton={false}
            render={
              <a
                href={event.permalink ?? issue.permalink ?? undefined}
                target="_blank"
                rel="noreferrer noopener"
              />
            }
          >
            Open in Sentry
            <ArrowUpRight className="size-3" />
          </Button>
        )}
      </div>

      {/* Context sub-table */}
      <div className="min-w-0">
        <SectionLabel>Event context</SectionLabel>
        <AttributesSubTable attributes={event.attributes} />
      </div>

      <div className="grid min-w-0 gap-3 xl:grid-cols-2">
        <div className="min-w-0">
          <SectionLabel>Stack trace (innermost first)</SectionLabel>
          <StackTrace frames={event.frames} />
        </div>
        <div className="min-w-0">
          <SectionLabel>Breadcrumbs (most recent first)</SectionLabel>
          <Breadcrumbs breadcrumbs={event.breadcrumbs} />
        </div>
      </div>
    </div>
  )
}
