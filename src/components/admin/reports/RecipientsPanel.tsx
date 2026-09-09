import { useState } from 'react'
import { Mail, Plus, Trash2 } from 'lucide-react'
import { Button } from '../../ui/Button'
import { useToast } from '../../../contexts/ToastContext'
import { useReportRecipients } from '../../../hooks/useKpiReports'
import type { ReportPeriodKind } from '../../../lib/kpi-report-schema'

const KINDS: Array<[ReportPeriodKind, string]> = [
  ['month', 'Monthly'],
  ['quarter', 'Quarterly'],
  ['year', 'Annual'],
]

/**
 * Who a published report goes to (roadmap §14 Table 39 names the audiences:
 * CBU, the Technical Specialists and OECS TSIE monthly; the RPIU quarterly).
 * Addresses are data, edited here, not a deploy.
 */
export function RecipientsPanel() {
  const toast = useToast()
  const { recipients, loading, add, remove, busy } = useReportRecipients()
  const [email, setEmail] = useState('')
  const [label, setLabel] = useState('')
  const [kinds, setKinds] = useState<ReportPeriodKind[]>(['month', 'quarter', 'year'])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast.error('Enter a valid email address')
      return
    }
    if (!kinds.length) {
      toast.error('Choose at least one report kind')
      return
    }
    try {
      await add({ email, label, kinds })
      setEmail('')
      setLabel('')
      toast.success('Recipient added')
    } catch (err: any) {
      toast.error(err.message || 'Could not add the recipient')
    }
  }

  return (
    <div className="rounded-lg border border-ktip-sand-200 bg-ktip-cream p-4">
      <div className="mb-3 flex items-center gap-2">
        <Mail size={16} className="text-ktip-ocean-600" />
        <h3 className="text-sm font-semibold text-ktip-sand-900">Report recipients</h3>
      </div>
      {loading ? (
        <div className="h-10 animate-pulse rounded bg-ktip-sand-100" />
      ) : recipients?.length ? (
        <ul className="mb-3 divide-y divide-ktip-sand-100 text-sm">
          {recipients.map((r) => (
            <li key={r.email} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate font-medium text-ktip-sand-900">{r.label || r.email}</p>
                <p className="truncate text-xs text-ktip-sand-500">
                  {r.label ? `${r.email} · ` : ''}
                  {r.kinds.map((k) => KINDS.find(([kind]) => kind === k)?.[1] ?? k).join(', ')}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  remove(r.email)
                    .then(() => toast.success('Recipient removed'))
                    .catch((err: any) => toast.error(err.message || 'Could not remove'))
                }
                disabled={busy}
                aria-label={`Remove ${r.email}`}
                className="rounded p-1 text-ktip-sand-500 hover:bg-ktip-sand-100 hover:text-chart-bad"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-3 text-sm italic text-ktip-sand-500">
          No recipients yet. Published reports stay on the console until someone is added here.
        </p>
      )}
      <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.currentTarget.value)}
          placeholder="name@oecs.int"
          aria-label="Recipient email"
          className="min-w-0 flex-1 rounded-md border border-ktip-sand-300 bg-ktip-cream px-2 py-1.5 text-sm"
        />
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.currentTarget.value)}
          placeholder="Label (e.g. RPIU)"
          aria-label="Recipient label"
          className="w-36 rounded-md border border-ktip-sand-300 bg-ktip-cream px-2 py-1.5 text-sm"
        />
        <div className="flex items-center gap-2 text-xs text-ktip-sand-700">
          {KINDS.map(([kind, word]) => (
            <label key={kind} className="inline-flex items-center gap-1">
              <input
                type="checkbox"
                checked={kinds.includes(kind)}
                onChange={(e) =>
                  setKinds((prev) => (e.currentTarget.checked ? [...prev, kind] : prev.filter((k) => k !== kind)))
                }
              />
              {word}
            </label>
          ))}
        </div>
        <Button type="submit" size="sm" variant="secondary" icon={<Plus size={14} />} loading={busy}>
          Add
        </Button>
      </form>
    </div>
  )
}
