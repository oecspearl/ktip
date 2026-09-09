import { useState, type FormEvent } from 'react'
import { Globe, Plus } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Switch } from '../../../components/ui/Toggle'
import { useAuth } from '../../../contexts/AuthContext'
import { useToast } from '../../../contexts/ToastContext'
import { useSetTrustedDomain, useTrustedDomains } from '../../../hooks/useEmailVerification'
import { normaliseTrustedDomain } from '../../../lib/email-domain'
import { ROLE_DEFINITIONS } from '../../../lib/permissions'
import { ROLE_COLORS, ROLE_LABELS } from '../../../lib/constants'
import { resolveCopy } from '../../../i18n/copy'
import { formatDate } from '../../../lib/utils'
import { useLingui } from '@lingui/react/macro'

/**
 * Roles a domain may carry. Mirrors guard_trusted_domain_role() in migration
 * 145: no admin tier, no aliases, none of the four institution-bound roles.
 * The database refuses the rest whatever this list says.
 */
const INSTITUTION_BOUND = new Set(['student', 'faculty', 'chamber_admin', 'educational_partner'])
const DOMAIN_ROLES = ROLE_DEFINITIONS.filter(
  (r) => r.tier !== 'admin' && !r.aliasOf && !INSTITUTION_BOUND.has(r.slug)
)

/**
 * The trusted-domain list (145): email domains whose confirmed addresses
 * verify an account with nobody clicking. Small and deliberate — the CHECK in
 * the database refuses free-mail providers, and the form says so first.
 */
export function TrustedDomainsPanel() {
  const auth = useAuth()
  const toast = useToast()
  const { i18n } = useLingui()

  const canManageRoles = auth.can('role:manage')
  const { domains, loading } = useTrustedDomains(auth.can('verification:review'))
  const { setDomain, loading: saving } = useSetTrustedDomain()

  const [domainDraft, setDomainDraft] = useState('')
  const [labelDraft, setLabelDraft] = useState('')
  const [roleDraft, setRoleDraft] = useState('')
  const [draftError, setDraftError] = useState('')

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault()
    const domain = normaliseTrustedDomain(domainDraft)
    if (!domain) {
      setDraftError('Enter a bare domain such as oecs.int. Free-mail providers cannot be trusted.')
      return
    }
    if (!labelDraft.trim()) {
      setDraftError('Give the organisation a name.')
      return
    }
    setDraftError('')
    try {
      await setDomain({
        domain,
        label: labelDraft.trim(),
        grantsRole: canManageRoles && roleDraft ? roleDraft : null,
      })
      toast.success(`@${domain} is now trusted`)
      setDomainDraft('')
      setLabelDraft('')
      setRoleDraft('')
    } catch (err: any) {
      toast.error(err.message || 'Could not save the domain')
    }
  }

  const toggleActive = async (domain: string, label: string, grantsRole: string | null, notes: string | null, next: boolean) => {
    try {
      await setDomain({ domain, label, grantsRole, isActive: next, notes })
      toast.success(next ? `@${domain} re-enabled` : `@${domain} paused`)
    } catch (err: any) {
      toast.error(err.message || 'Could not update the domain')
    }
  }

  return (
    <div className="bg-ktip-cream rounded-2xl shadow-card border border-ktip-sand-100 p-5 mb-6">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 bg-ktip-ocean-100 rounded-xl flex items-center justify-center shrink-0">
          <Globe size={20} className="text-ktip-ocean-600" />
        </div>
        <div>
          <h2 className="text-lg font-display font-bold text-ktip-sand-900">Trusted email domains</h2>
          <p className="text-sm text-ktip-sand-600">
            A confirmed address at one of these verifies the account on its own, with nobody
            reviewing it. Exact match, lowercase, no subdomains inferred. Pausing a domain stops
            new verifications; it does not remove badges already earned.
          </p>
        </div>
      </div>

      <form onSubmit={handleAdd} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end mb-5">
        <Input
          label="Domain"
          placeholder="oecs.int"
          value={domainDraft}
          onChange={(e) => setDomainDraft(e.target.value)}
          fullWidth
        />
        <Input
          label="Organisation"
          placeholder="Organisation of Eastern Caribbean States"
          value={labelDraft}
          onChange={(e) => setLabelDraft(e.target.value)}
          fullWidth
        />
        {canManageRoles ? (
          <label className="text-sm">
            <span className="block text-xs font-medium text-ktip-sand-600 mb-1">Also grants</span>
            <select
              value={roleDraft}
              onChange={(e) => setRoleDraft(e.target.value)}
              className="border border-ktip-sand-200 rounded-lg px-3 py-2 text-sm bg-ktip-cream focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500"
            >
              <option value="">Badge only</option>
              {DOMAIN_ROLES.map((r) => (
                <option key={r.slug} value={r.slug}>
                  {resolveCopy(i18n, r.label)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span />
        )}
        <Button type="submit" size="sm" loading={saving} icon={<Plus size={14} />}>
          Trust domain
        </Button>
      </form>
      {draftError && <p className="text-sm text-red-600 -mt-3 mb-4">{draftError}</p>}

      {loading ? (
        <p className="text-sm text-ktip-sand-500">Loading…</p>
      ) : domains.length === 0 ? (
        <p className="text-sm text-ktip-sand-500">
          No trusted domains yet. Every new member goes through a school, or the document queue.
        </p>
      ) : (
        <ul className="divide-y divide-ktip-sand-100">
          {domains.map((d) => (
            <li key={d.domain} className="py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm text-ktip-sand-900">@{d.domain}</span>
                  <span className="text-sm text-ktip-sand-700">{d.label}</span>
                  {d.grants_role && (
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${ROLE_COLORS[d.grants_role] || 'bg-ktip-sand-100 text-ktip-sand-700 border-ktip-sand-200'}`}
                    >
                      + {resolveCopy(i18n, ROLE_LABELS[d.grants_role] ?? d.grants_role)}
                    </span>
                  )}
                  {!d.is_active && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-ktip-sand-100 text-ktip-sand-600 border border-ktip-sand-200">
                      Paused
                    </span>
                  )}
                </div>
                <p className="text-xs text-ktip-sand-500 mt-0.5">Added {formatDate(d.created_at)}</p>
              </div>
              <Switch
                checked={d.is_active}
                onChange={(next) => toggleActive(d.domain, d.label, d.grants_role, d.notes, next)}
                label={d.is_active ? `Pause @${d.domain}` : `Re-enable @${d.domain}`}
                disabled={saving}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default TrustedDomainsPanel
