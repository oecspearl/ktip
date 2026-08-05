import { useState } from 'react'
import {
  AlertOctagon,
  Bot,
  Check,
  Filter,
  ListFilter,
  Plus,
  Settings2,
  ShieldAlert,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Textarea } from '../../../components/ui/Textarea'
import { Modal } from '../../../components/ui/Modal'
import { Switch, Toggle } from '../../../components/ui/Toggle'
import { ConfirmModal } from '../../../components/admin/ConfirmModal'
import { PageHero } from '../../../components/layout/PageHero'
import { usePageTitle } from '../../../hooks/usePageTitle'
import { useToast } from '../../../contexts/ToastContext'
import { useAuth } from '../../../contexts/AuthContext'
import {
  requestModerationReview,
  useManageModerationTerms,
  useModerateReport,
  useModerationQueue,
  useModerationSettings,
  useModerationTerms,
} from '../../../hooks/useModeration'
import { REPORT_CATEGORIES } from '../../../components/moderation/ReportModal'
import { formatDate } from '../../../lib/utils'
import { cn } from '../../../lib/utils'
import type { ContentReport, ModerationSeverity, ModerationTerm } from '../../../types'
import { useLingui } from '@lingui/react/macro'
import { resolveCopy, type Copy } from '../../../i18n/copy'

type TabId = 'reports' | 'automated' | 'terms' | 'settings'

const SEVERITY_COLORS: Record<string, string> = {
  low: 'bg-ktip-sand-100 text-ktip-sand-700 border-ktip-sand-200',
  medium: 'bg-ktip-sun-100 text-ktip-sun-800 border-ktip-sun-200',
  high: 'bg-red-100 text-red-700 border-red-200',
}

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-ktip-ocean-100 text-ktip-ocean-700 border-ktip-ocean-200',
  reviewing: 'bg-ktip-sun-100 text-ktip-sun-800 border-ktip-sun-200',
  actioned: 'bg-ktip-tropical-100 text-ktip-tropical-800 border-ktip-tropical-200',
  dismissed: 'bg-ktip-sand-100 text-gray-700 border-ktip-sand-200',
}

const CATEGORY_LABELS: Record<string, Copy> = Object.fromEntries(
  REPORT_CATEGORIES.map((c) => [c.value, c.label])
)

const TARGET_LABELS: Record<string, string> = {
  forum_post: 'Forum post',
  forum_reply: 'Forum reply',
  project: 'Project',
  project_comment: 'Project comment',
  message: 'Message',
  profile: 'Profile',
  grant: 'Grant',
}

export default function AdminModerationPage() {
    const { i18n } = useLingui()
  const toast = useToast()
  const auth = useAuth()

  usePageTitle('Moderation')

  const [activeTab, setActiveTab] = useState<TabId>('reports')
  const [statusFilter, setStatusFilter] = useState('open')
  const [severityFilter, setSeverityFilter] = useState('')

  const { reports, loading, refetch } = useModerationQueue({
    status: statusFilter,
    severity: severityFilter,
  })
  const { moderateReport, loading: actioning } = useModerateReport()
  const { terms, refetch: refetchTerms } = useModerationTerms()
  const { createTerm, updateTerm, deleteTerm } = useManageModerationTerms()
  const { settings, updateSettings, saving } = useModerationSettings()

  const [selected, setSelected] = useState<ContentReport | null>(null)
  const [adminNotes, setAdminNotes] = useState('')
  const [aiVerdict, setAiVerdict] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)

  const [termModalOpen, setTermModalOpen] = useState(false)
  const [newTerm, setNewTerm] = useState({
    pattern: '',
    kind: 'term' as 'term' | 'regex',
    severity: 'medium' as ModerationSeverity,
    category: '' as string,
    note: '',
  })
  const [confirmDeleteTerm, setConfirmDeleteTerm] = useState<ModerationTerm | null>(null)

  const canAction = auth.can('moderation:action')

  // reporter === author is the marker the trigger writes for machine flags.
  const humanReports = (reports ?? []).filter((r) => r.reporter_id !== r.target_author_id)
  const automatedFlags = (reports ?? []).filter((r) => r.reporter_id === r.target_author_id)
  const visible = activeTab === 'automated' ? automatedFlags : humanReports

  const tabs: { id: TabId; label: string; icon: typeof ListFilter }[] = [
    { id: 'reports', label: `Reports (${humanReports.length})`, icon: ListFilter },
    { id: 'automated', label: `Auto-flagged (${automatedFlags.length})`, icon: Bot },
    { id: 'terms', label: 'Filter terms', icon: ShieldAlert },
    { id: 'settings', label: 'Settings', icon: Settings2 },
  ]

  const openDetail = (report: ContentReport) => {
    setSelected(report)
    setAdminNotes(report.admin_notes || '')
    setAiVerdict(null)
  }

  const handleAction = async (action: 'restore' | 'quarantine' | 'remove' | 'dismiss') => {
    if (!selected) return
    try {
      await moderateReport({ reportId: selected.id, action, notes: adminNotes || undefined })
      toast.success(`Report ${action === 'dismiss' ? 'dismissed' : action + 'd'}`)
      setSelected(null)
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to action report')
    }
  }

  const handleAiReview = async () => {
    if (!selected) return
    setAiLoading(true)
    try {
      const verdict = await requestModerationReview(selected.id)
      setAiVerdict(
        verdict
          ? `${(verdict.severity || 'unclear').toUpperCase()} — ${verdict.rationale}`
          : 'Second opinion unavailable.'
      )
    } finally {
      setAiLoading(false)
    }
  }

  const handleCreateTerm = async () => {
    if (!newTerm.pattern.trim()) return
    try {
      await createTerm({
        pattern: newTerm.pattern.trim(),
        kind: newTerm.kind,
        severity: newTerm.severity,
        category: (newTerm.category || null) as any,
        note: newTerm.note || null,
        created_by: auth.user?.id ?? null,
      })
      toast.success('Filter term added')
      setTermModalOpen(false)
      setNewTerm({ pattern: '', kind: 'term', severity: 'medium', category: '', note: '' })
      refetchTerms()
    } catch (err: any) {
      toast.error(err.message || 'Failed to add term')
    }
  }

  const handleDeleteTerm = async () => {
    if (!confirmDeleteTerm) return
    try {
      await deleteTerm(confirmDeleteTerm.id)
      toast.success('Term removed')
      setConfirmDeleteTerm(null)
      refetchTerms()
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove term')
    }
  }

  return (
    <div>
      <PageHero
        inset
        compact
        eyebrow="Administration"
        title="Moderation"
        subtitle="Reported content, automated flags, and the rules that drive them"
        imageSeed="admin-moderation"
      />

      <div className="relative border-b border-ktip-sand-200 mb-6" role="tablist" aria-label="Moderation">
        <nav className="flex gap-1 -mb-px overflow-x-auto scrollbar-hide">
          {tabs.map((tab) => (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex-shrink-0',
                activeTab === tab.id
                  ? 'border-ktip-ocean-500 text-ktip-ocean-600'
                  : 'border-transparent text-ktip-sand-500 hover:text-ktip-sand-700 hover:border-ktip-sand-300'
              )}
              key={tab.id}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="animate-tab-enter">
        {(activeTab === 'reports' || activeTab === 'automated') && (
          <>
            <div className="bg-ktip-cream rounded-2xl shadow-card border border-ktip-sand-100 p-4 mb-6">
              <div className="flex flex-wrap items-center gap-3">
                <Filter size={16} className="text-ktip-sand-400" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="border border-ktip-sand-200 rounded-lg px-3 py-2 text-sm bg-ktip-cream focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500"
                >
                  <option value="">All statuses</option>
                  <option value="open">Open</option>
                  <option value="reviewing">Reviewing</option>
                  <option value="actioned">Actioned</option>
                  <option value="dismissed">Dismissed</option>
                </select>
                <select
                  value={severityFilter}
                  onChange={(e) => setSeverityFilter(e.target.value)}
                  className="border border-ktip-sand-200 rounded-lg px-3 py-2 text-sm bg-ktip-cream focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500"
                >
                  <option value="">All severities</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
                {(statusFilter || severityFilter) && (
                  <button
                    type="button"
                    onClick={() => {
                      setStatusFilter('')
                      setSeverityFilter('')
                    }}
                    className="inline-flex items-center gap-1 text-sm text-ktip-sand-500 hover:text-ktip-sand-800"
                  >
                    <X size={14} /> Clear all
                  </button>
                )}
              </div>
            </div>

            <div className="bg-ktip-cream rounded-2xl shadow-card border border-ktip-sand-100 overflow-hidden">
              {loading && <p className="p-8 text-center text-ktip-sand-500">Loading queue…</p>}
              {!loading && visible.length === 0 && (
                <p className="p-8 text-center text-ktip-sand-500">Nothing to review.</p>
              )}
              <ul className="divide-y divide-ktip-sand-100">
                {visible.map((report) => (
                  <li key={report.id}>
                    <button
                      type="button"
                      onClick={() => openDetail(report)}
                      className="w-full text-left px-4 py-4 hover:bg-ktip-sand-50/60 transition-colors"
                    >
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <span className="text-sm font-medium text-ktip-sand-900">
                          {TARGET_LABELS[report.target_type] ?? report.target_type}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLORS[report.status]}`}>
                          {report.status}
                        </span>
                        {report.severity && (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${SEVERITY_COLORS[report.severity]}`}>
                            {report.severity}
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-ktip-sand-100 text-ktip-sand-700 border border-ktip-sand-200">
                          {resolveCopy(i18n, CATEGORY_LABELS[report.category] ?? report.category)}
                        </span>
                      </div>
                      {report.content_snapshot && (
                        <p className="text-sm text-ktip-sand-700 line-clamp-2">{report.content_snapshot}</p>
                      )}
                      <p className="text-xs text-ktip-sand-500 mt-1">
                        {report.target_author?.display_name || 'Unknown author'} · {formatDate(report.created_at)}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        {activeTab === 'terms' && (
          <div className="bg-ktip-cream rounded-2xl shadow-card border border-ktip-sand-100 overflow-hidden">
            <div className="p-4 border-b border-ktip-sand-100 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-display font-bold text-ktip-sand-900">Filter terms</h2>
                <p className="text-sm text-ktip-sand-600 mt-1">
                  Checked at write time on posts, replies, comments and messages. Terms scoped to a
                  country only apply to members from that country.
                </p>
              </div>
              {canAction && (
                <Button size="sm" icon={<Plus size={15} />} onClick={() => setTermModalOpen(true)}>
                  Add term
                </Button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-ktip-sand-100">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-ktip-sand-500 uppercase tracking-wider">Pattern</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-ktip-sand-500 uppercase tracking-wider">Kind</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-ktip-sand-500 uppercase tracking-wider">Severity</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-ktip-sand-500 uppercase tracking-wider">Active</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-ktip-sand-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ktip-sand-100 stagger-rows">
                  {(terms ?? []).map((term) => (
                    <tr key={term.id} className="hover:bg-ktip-sand-50/60 transition-colors">
                      <td className="px-4 py-3">
                        <code className="text-xs font-mono text-ktip-sand-800 break-all">{term.pattern}</code>
                        {term.note && <p className="text-xs text-ktip-sand-500 mt-0.5">{term.note}</p>}
                      </td>
                      <td className="px-4 py-3 text-sm text-ktip-sand-700">{term.kind}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${SEVERITY_COLORS[term.severity]}`}>
                          {term.severity}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Switch
                          checked={term.is_active}
                          label={`Toggle ${term.pattern}`}
                          disabled={!canAction}
                          onChange={(next) =>
                            updateTerm(term.id, { is_active: next }).then(() => refetchTerms())
                          }
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={!canAction}
                          icon={<Trash2 size={14} />}
                          onClick={() => setConfirmDeleteTerm(term)}
                        >
                          Remove
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {(terms?.length ?? 0) === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-ktip-sand-500">
                        No filter terms configured.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'settings' && settings && (
          <div className="bg-ktip-cream rounded-2xl shadow-card border border-ktip-sand-100 p-6 space-y-5 max-w-2xl">
            <div>
              <h2 className="text-lg font-display font-bold text-ktip-sand-900">Auto-quarantine</h2>
              <p className="text-sm text-ktip-sand-600 mt-1">
                When enough distinct members report the same item inside the window, it is hidden
                automatically and queued for review.
              </p>
            </div>

            <Toggle
              checked={settings.auto_quarantine_enabled}
              disabled={!canAction}
              label="Enable report-driven auto-quarantine"
              description="Turning this off leaves the automated content filter running; only the report threshold stops applying."
              onChange={(checked) =>
                updateSettings({ auto_quarantine_enabled: checked }).then(() =>
                  toast.success('Setting saved')
                )
              }
            />

            <div className="grid sm:grid-cols-2 gap-4">
              <Input
                type="number"
                label="Reports before quarantine"
                min={1}
                defaultValue={settings.report_threshold}
                disabled={!canAction}
                onBlur={(e) => {
                  const value = Number(e.target.value)
                  if (value > 0 && value !== settings.report_threshold) {
                    updateSettings({ report_threshold: value }).then(() => toast.success('Threshold saved'))
                  }
                }}
                fullWidth
              />
              <Input
                type="number"
                label="Window (minutes)"
                min={1}
                defaultValue={settings.report_window_minutes}
                disabled={!canAction}
                onBlur={(e) => {
                  const value = Number(e.target.value)
                  if (value > 0 && value !== settings.report_window_minutes) {
                    updateSettings({ report_window_minutes: value }).then(() => toast.success('Window saved'))
                  }
                }}
                fullWidth
              />
            </div>

            {saving && <p className="text-xs text-ktip-sand-500">Saving…</p>}

            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-ktip-sand-50 border border-ktip-sand-200">
              <AlertOctagon size={16} className="text-ktip-sand-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-ktip-sand-700">
                The severity matrix itself is fixed: low warns the author, medium quarantines the
                content, and high also suspends the account and escalates to safety administrators
                and the member’s institution.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Report detail */}
      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? `${TARGET_LABELS[selected.target_type] ?? selected.target_type} report` : ''}
        size="lg"
      >
        {selected && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLORS[selected.status]}`}>
                {selected.status}
              </span>
              {selected.severity && (
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${SEVERITY_COLORS[selected.severity]}`}>
                  {selected.severity}
                </span>
              )}
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-ktip-sand-100 text-ktip-sand-700 border border-ktip-sand-200">
                {resolveCopy(i18n, CATEGORY_LABELS[selected.category] ?? selected.category)}
              </span>
            </div>

            {selected.content_snapshot && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-ktip-sand-500 mb-1">
                  Content at report time
                </p>
                <p className="text-sm text-ktip-sand-800 whitespace-pre-wrap p-3 rounded-xl bg-ktip-sand-50 border border-ktip-sand-200">
                  {selected.content_snapshot}
                </p>
              </div>
            )}

            {selected.detail && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-ktip-sand-500 mb-1">
                  Reporter’s note
                </p>
                <p className="text-sm text-ktip-sand-800">{selected.detail}</p>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-ktip-sand-500">
                  Second opinion
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  loading={aiLoading}
                  icon={<Sparkles size={14} />}
                  onClick={handleAiReview}
                >
                  Ask for review
                </Button>
              </div>
              <p className="text-sm text-ktip-sand-700">
                {aiVerdict ?? 'Advisory only — it does not change what is visible.'}
              </p>
            </div>

            <Textarea
              label="Admin notes"
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              rows={3}
              fullWidth
            />

            <div className="flex flex-wrap justify-end gap-2 pt-4 border-t border-ktip-sand-100">
              <Button variant="outline" size="sm" onClick={() => setSelected(null)}>
                Close
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!canAction}
                loading={actioning}
                icon={<X size={14} />}
                onClick={() => handleAction('dismiss')}
              >
                Dismiss
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!canAction}
                loading={actioning}
                icon={<Check size={14} />}
                onClick={() => handleAction('restore')}
              >
                Restore
              </Button>
              <Button
                variant="danger"
                size="sm"
                disabled={!canAction}
                loading={actioning}
                icon={<Trash2 size={14} />}
                onClick={() => handleAction('remove')}
              >
                Remove content
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* New term */}
      <Modal open={termModalOpen} onClose={() => setTermModalOpen(false)} title="Add filter term" size="md">
        <div className="space-y-4">
          <Input
            label="Pattern"
            value={newTerm.pattern}
            onChange={(e) => setNewTerm({ ...newTerm, pattern: e.target.value })}
            helperText="A word for 'term', or a POSIX regular expression for 'regex'."
            fullWidth
          />

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ktip-sand-700 mb-1">Kind</label>
              <select
                value={newTerm.kind}
                onChange={(e) => setNewTerm({ ...newTerm, kind: e.target.value as 'term' | 'regex' })}
                className="w-full border border-ktip-sand-200 rounded-lg px-3 py-2 text-sm bg-ktip-cream focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500"
              >
                <option value="term">Term</option>
                <option value="regex">Regex</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-ktip-sand-700 mb-1">Severity</label>
              <select
                value={newTerm.severity}
                onChange={(e) => setNewTerm({ ...newTerm, severity: e.target.value as ModerationSeverity })}
                className="w-full border border-ktip-sand-200 rounded-lg px-3 py-2 text-sm bg-ktip-cream focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500"
              >
                <option value="low">Low — warn the author</option>
                <option value="medium">Medium — quarantine</option>
                <option value="high">High — quarantine, suspend, escalate</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-ktip-sand-700 mb-1">Category</label>
            <select
              value={newTerm.category}
              onChange={(e) => setNewTerm({ ...newTerm, category: e.target.value })}
              className="w-full border border-ktip-sand-200 rounded-lg px-3 py-2 text-sm bg-ktip-cream focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500"
            >
              <option value="">Unspecified</option>
              {REPORT_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {resolveCopy(i18n, c.label)}
                </option>
              ))}
            </select>
          </div>

          <Input
            label="Note (optional)"
            value={newTerm.note}
            onChange={(e) => setNewTerm({ ...newTerm, note: e.target.value })}
            fullWidth
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-ktip-sand-100">
            <Button variant="outline" size="sm" onClick={() => setTermModalOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleCreateTerm}>
              Add term
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={!!confirmDeleteTerm}
        title="Remove filter term"
        message={`"${confirmDeleteTerm?.pattern}" will no longer be checked on new content. Existing decisions are unaffected.`}
        confirmLabel="Remove"
        confirmVariant="danger"
        onConfirm={handleDeleteTerm}
        onCancel={() => setConfirmDeleteTerm(null)}
      />
    </div>
  )
}
