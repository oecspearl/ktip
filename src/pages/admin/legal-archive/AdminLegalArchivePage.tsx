import { useState, type FormEvent } from 'react'
import { Archive, Download, FileJson, Search } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Modal } from '../../../components/ui/Modal'
import { Select } from '../../../components/ui/Select'
import { Switch } from '../../../components/ui/Toggle'
import { PageHero } from '../../../components/layout/PageHero'
import { usePageTitle } from '../../../hooks/usePageTitle'
import { useToast } from '../../../contexts/ToastContext'
import {
  LEGAL_ARCHIVE_EXPORT_CAP,
  LEGAL_ARCHIVE_PAGE,
  fetchLegalArchiveExport,
  isUuid,
  useLegalArchive,
  useLegalArchiveEntry,
  useSetLegalHold,
  type LegalArchiveFilters,
  type LegalArchiveRow,
} from '../../../hooks/useLegalArchive'

/**
 * /admin/legal-archive — the 3-year archive of deleted records (migration 187).
 *
 * For the legal team: find what was deleted, read the row as it was, export it,
 * and put it on legal hold so the daily purge leaves it alone. Nothing here can
 * restore, edit or delete a record. Staff-only, so English only, like the rest
 * of the admin console.
 */

// The tables migration 187 attaches the trigger to, plus the two labels the
// file helpers and the purge cron write.
const ENTITY_TYPES: { value: string; label: string }[] = [
  { value: 'projects', label: 'Projects' },
  { value: 'events', label: 'Events' },
  { value: 'resources', label: 'Resources' },
  { value: 'grants', label: 'Funding calls' },
  { value: 'grant_applications', label: 'Funding applications' },
  { value: 'forum_posts', label: 'Forum posts' },
  { value: 'forum_replies', label: 'Forum replies' },
  { value: 'messages', label: 'Messages' },
  { value: 'documents', label: 'Documents' },
  { value: 'entity_documents', label: 'Attached documents' },
  { value: 'user_consents', label: 'Consent records' },
  { value: 'content_reports', label: 'Content reports' },
  { value: 'takedown_notices', label: 'Takedown notices' },
  { value: 'grievances', label: 'Grievances' },
  { value: 'files', label: 'Files only' },
  { value: 'storage_purge_retry', label: 'File purge retries' },
]

const TYPE_LABEL = new Map(ENTITY_TYPES.map((t) => [t.value, t.label]))
const ALL = '__all__'

function formatDate(value: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function shortId(value: string | null): string {
  if (!value) return '—'
  return value.length > 13 ? `${value.slice(0, 8)}…` : value
}

function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export default function AdminLegalArchivePage() {
  usePageTitle('Legal Archive')
  const toast = useToast()

  const [draft, setDraft] = useState<LegalArchiveFilters>({})
  const [filters, setFilters] = useState<LegalArchiveFilters>({})
  const { rows, loading, error } = useLegalArchive(filters)

  const [viewing, setViewing] = useState<string | null>(null)
  const { entry, loading: entryLoading } = useLegalArchiveEntry(viewing)

  const [holdTarget, setHoldTarget] = useState<LegalArchiveRow | null>(null)
  const [holdReason, setHoldReason] = useState('')
  const { setLegalHold, loading: holdSaving } = useSetLegalHold()

  const [exporting, setExporting] = useState(false)

  const ownerInvalid = !!draft.ownerId?.trim() && !isUuid(draft.ownerId)

  const handleSearch = (e: FormEvent) => {
    e.preventDefault()
    if (ownerInvalid) return
    setFilters({ ...draft })
  }

  const handleClear = () => {
    setDraft({})
    setFilters({})
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const exported = await fetchLegalArchiveExport(filters)
      const stamp = new Date().toISOString().slice(0, 10)
      downloadJson(`legal-archive-${stamp}.json`, {
        exported_at: new Date().toISOString(),
        filters,
        count: exported.length,
        capped: exported.length >= LEGAL_ARCHIVE_EXPORT_CAP,
        rows: exported,
      })
      if (exported.length >= LEGAL_ARCHIVE_EXPORT_CAP) {
        toast.info(`Export stopped at ${LEGAL_ARCHIVE_EXPORT_CAP} records. Narrow the search to get the rest.`)
      }
    } catch (err: any) {
      toast.error(err?.message || 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  const openHold = (row: LegalArchiveRow) => {
    setHoldTarget(row)
    setHoldReason(row.hold_reason ?? '')
  }

  const confirmHold = async () => {
    if (!holdTarget) return
    const next = !holdTarget.legal_hold
    try {
      await setLegalHold({ id: holdTarget.id, hold: next, reason: next ? holdReason : undefined })
      toast.success(next ? 'Legal hold set' : 'Legal hold lifted')
      setHoldTarget(null)
    } catch (err: any) {
      toast.error(err?.message || 'Could not change the legal hold')
    }
  }

  const purgeDue = holdTarget ? new Date(holdTarget.purge_after).getTime() <= Date.now() : false

  return (
    <>
      <PageHero
        inset
        compact
        eyebrow="Administration"
        title="Legal Archive"
        subtitle="Deleted records, kept for 3 years and then purged"
        imageSeed="admin-legal-archive"
      />

      <form
        onSubmit={handleSearch}
        className="bg-ktip-cream rounded-2xl shadow-card border border-ktip-sand-100 p-4 mb-4 space-y-4"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="flex flex-col gap-1.5">
            <span id="legal-archive-type" className="text-label font-medium text-ktip-sand-700">
              Record type
            </span>
            <Select
              ariaLabelledBy="legal-archive-type"
              value={draft.entityType ?? ALL}
              onChange={(value) => setDraft((d) => ({ ...d, entityType: value === ALL ? undefined : value }))}
              options={[{ value: ALL, label: 'All types' }, ...ENTITY_TYPES]}
            />
          </div>
          <Input
            label="Owner ID"
            value={draft.ownerId ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, ownerId: e.target.value }))}
            placeholder="Member's user ID"
            error={ownerInvalid ? 'Enter a full user ID' : undefined}
            fullWidth
          />
          <Input
            label="Record ID"
            value={draft.entityId ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, entityId: e.target.value }))}
            placeholder="ID of the deleted record"
            fullWidth
          />
          <Input
            label="Deleted from"
            type="date"
            value={draft.from ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value || undefined }))}
            fullWidth
          />
          <Input
            label="Deleted to"
            type="date"
            value={draft.to ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value || undefined }))}
            fullWidth
          />
          <label className="flex items-center gap-3 self-end pb-2 text-sm text-ktip-sand-700">
            <input
              type="checkbox"
              checked={!!draft.heldOnly}
              onChange={(e) => setDraft((d) => ({ ...d, heldOnly: e.target.checked || undefined }))}
              className="h-4 w-4"
            />
            On legal hold only
          </label>
        </div>
        <div className="flex flex-wrap justify-end gap-3">
          <Button type="button" variant="secondary" onClick={handleClear}>
            Clear
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={handleExport}
            loading={exporting}
            icon={<Download className="h-4 w-4" />}
          >
            Export JSON
          </Button>
          <Button type="submit" icon={<Search className="h-4 w-4" />}>
            Search
          </Button>
        </div>
      </form>

      <div className="bg-ktip-cream rounded-2xl shadow-card border border-ktip-sand-100 overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-4">
            <div className="h-12 bg-ktip-sand-100 rounded-lg animate-pulse-soft" />
            <div className="h-12 bg-ktip-sand-100 rounded-lg animate-pulse-soft" />
          </div>
        ) : error ? (
          <p className="p-6 text-sm text-red-600">Could not load the archive: {(error as Error).message}</p>
        ) : rows && rows.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-ktip-sand-500 border-b border-ktip-sand-100">
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Record</th>
                    <th className="px-4 py-3 font-medium">Owner</th>
                    <th className="px-4 py-3 font-medium">Deleted</th>
                    <th className="px-4 py-3 font-medium">Deleted by</th>
                    <th className="px-4 py-3 font-medium">Purge after</th>
                    <th className="px-4 py-3 font-medium">Legal hold</th>
                    <th className="px-4 py-3 font-medium sr-only">View</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ktip-sand-100">
                  {rows.map((row) => (
                    <tr key={row.id} className="align-middle">
                      <td className="px-4 py-3 whitespace-nowrap text-ktip-sand-900">
                        {TYPE_LABEL.get(row.entity_type) ?? row.entity_type}
                        {row.reason && <span className="block text-xs text-ktip-sand-500">{row.reason}</span>}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-ktip-sand-700" title={row.entity_id}>
                        {shortId(row.entity_id)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-ktip-sand-700" title={row.owner_id ?? ''}>
                        {shortId(row.owner_id)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">{formatDate(row.deleted_at)}</td>
                      <td className="px-4 py-3 font-mono text-xs text-ktip-sand-700" title={row.deleted_by ?? ''}>
                        {row.deleted_by ? shortId(row.deleted_by) : 'System'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">{formatDate(row.purge_after)}</td>
                      <td className="px-4 py-3">
                        <Switch
                          checked={row.legal_hold}
                          onChange={() => openHold(row)}
                          label={row.legal_hold ? 'Lift legal hold' : 'Set legal hold'}
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setViewing(row.id)}
                          icon={<FileJson className="h-4 w-4" />}
                        >
                          View
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length >= LEGAL_ARCHIVE_PAGE && (
              <p className="px-4 py-3 text-xs text-ktip-sand-500 border-t border-ktip-sand-100">
                Showing the newest {LEGAL_ARCHIVE_PAGE}. Narrow the search, or export, to see the rest.
              </p>
            )}
          </>
        ) : (
          <div className="text-center py-16 px-4">
            <div className="w-16 h-16 bg-ktip-sand-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Archive className="h-8 w-8 text-ktip-sand-400" />
            </div>
            <h3 className="text-lg font-semibold text-ktip-sand-900 mb-1">Nothing found</h3>
            <p className="text-ktip-sand-500 text-sm">No deleted records match this search.</p>
          </div>
        )}
      </div>

      <Modal open={!!viewing} onClose={() => setViewing(null)} title="Archived record" size="2xl">
        {entryLoading ? (
          <div className="h-40 bg-ktip-sand-100 rounded-lg animate-pulse-soft" />
        ) : entry ? (
          <div className="space-y-4">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div>
                <dt className="text-xs text-ktip-sand-500">Type</dt>
                <dd className="text-ktip-sand-900">{TYPE_LABEL.get(entry.entity_type) ?? entry.entity_type}</dd>
              </div>
              <div>
                <dt className="text-xs text-ktip-sand-500">Record ID</dt>
                <dd className="font-mono text-xs break-all">{entry.entity_id}</dd>
              </div>
              <div>
                <dt className="text-xs text-ktip-sand-500">Owner ID</dt>
                <dd className="font-mono text-xs break-all">{entry.owner_id ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-ktip-sand-500">Deleted by</dt>
                <dd className="font-mono text-xs break-all">{entry.deleted_by ?? 'System'}</dd>
              </div>
              <div>
                <dt className="text-xs text-ktip-sand-500">Deleted</dt>
                <dd>{new Date(entry.deleted_at).toLocaleString('en-GB')}</dd>
              </div>
              <div>
                <dt className="text-xs text-ktip-sand-500">Purge after</dt>
                <dd>
                  {formatDate(entry.purge_after)}
                  {entry.legal_hold && ' (on legal hold)'}
                </dd>
              </div>
              {entry.hold_reason && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-ktip-sand-500">Hold reason</dt>
                  <dd>{entry.hold_reason}</dd>
                </div>
              )}
              {entry.storage_paths.length > 0 && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-ktip-sand-500">Archived files</dt>
                  <dd className="font-mono text-xs break-all whitespace-pre-line">
                    {entry.storage_paths.map((f) => `${f.bucket}/${f.path}`).join('\n')}
                  </dd>
                </div>
              )}
            </dl>
            <pre className="bg-ktip-sand-50 border border-ktip-sand-200 rounded-xl p-3 text-xs overflow-auto max-h-96 whitespace-pre-wrap break-all">
              {JSON.stringify(entry.snapshot, null, 2)}
            </pre>
            <div className="flex justify-end gap-3">
              <Button
                variant="secondary"
                icon={<Download className="h-4 w-4" />}
                onClick={() => downloadJson(`legal-archive-${entry.entity_type}-${entry.entity_id}.json`, entry)}
              >
                Download
              </Button>
              <Button onClick={() => setViewing(null)}>Close</Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-ktip-sand-600">This record is no longer in the archive.</p>
        )}
      </Modal>

      {holdTarget && (
        <Modal
          open
          onClose={() => setHoldTarget(null)}
          title={holdTarget.legal_hold ? 'Lift legal hold' : 'Set legal hold'}
          size="md"
        >
          <div className="space-y-4">
            {holdTarget.legal_hold ? (
              <p className="text-sm text-ktip-sand-600">
                {purgeDue
                  ? 'This record is past its purge date. Once the hold is lifted it is permanently deleted in the next daily run.'
                  : `Once the hold is lifted this record is permanently deleted after ${formatDate(holdTarget.purge_after)}.`}
              </p>
            ) : (
              <>
                <p className="text-sm text-ktip-sand-600">
                  A record on legal hold is kept past its purge date until the hold is lifted. Use it
                  when the record is needed for a claim, an investigation or a request from a regulator.
                </p>
                <Input
                  label="Reason"
                  value={holdReason}
                  onChange={(e) => setHoldReason(e.target.value)}
                  placeholder="e.g. case reference"
                  fullWidth
                />
              </>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={() => setHoldTarget(null)}>
                Cancel
              </Button>
              <Button onClick={confirmHold} loading={holdSaving}>
                {holdTarget.legal_hold ? 'Lift hold' : 'Set hold'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
