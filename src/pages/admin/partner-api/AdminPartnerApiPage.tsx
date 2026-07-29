import { useState } from 'react'
import { KeyRound, Plus, Ban, Copy, Check } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Modal } from '../../../components/ui/Modal'
import { PageHero } from '../../../components/layout/PageHero'
import { usePageTitle } from '../../../hooks/usePageTitle'
import { useToast } from '../../../contexts/ToastContext'
import { useApiClients, useApiClientMutations } from '../../../hooks/useEmployers'
import type { ApiClient } from '../../../types'

const SCOPE_LABELS: Record<string, string> = {
  'employers:read': 'Read verified employers',
}

export default function AdminPartnerApiPage() {
  const toast = useToast()
  usePageTitle('Partner API')

  const { clients, loading, refetch } = useApiClients()
  const { createApiClient, revokeApiClient, loading: mutating } = useApiClientMutations()

  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  // Held in component state only, for as long as the modal is open. The key is
  // never written to storage — the server cannot reissue it, and neither can we.
  const [issuedKey, setIssuedKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [confirmRevoke, setConfirmRevoke] = useState<ApiClient | null>(null)

  const handleCreate = async () => {
    if (!name.trim()) return
    try {
      const result = await createApiClient({ name: name.trim(), scopes: ['employers:read'] })
      setIssuedKey(result.key)
      setCopied(false)
      setShowCreate(false)
      setName('')
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to create API key')
    }
  }

  const handleCopy = async () => {
    if (!issuedKey) return
    try {
      await navigator.clipboard.writeText(issuedKey)
      setCopied(true)
    } catch {
      toast.error('Copy failed — select the key and copy it manually')
    }
  }

  const handleRevoke = async () => {
    if (!confirmRevoke) return
    try {
      await revokeApiClient(confirmRevoke.id)
      toast.success('Key revoked')
      setConfirmRevoke(null)
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to revoke key')
    }
  }

  return (
    <>
      <PageHero
        inset
        compact
        eyebrow="Administration"
        title="Partner API"
        subtitle="Keys that let external platforms pull verified employer data"
        imageSeed="admin-partner-api"
        actions={
          <Button onClick={() => setShowCreate(true)} icon={<Plus size={16} />}>
            Issue Key
          </Button>
        }
      />

      <div className="bg-ktip-cream rounded-2xl shadow-card border border-ktip-sand-100 overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-4">
            <div className="h-12 bg-ktip-sand-100 rounded-lg animate-pulse-soft" />
            <div className="h-12 bg-ktip-sand-100 rounded-lg animate-pulse-soft" />
          </div>
        ) : clients && clients.length > 0 ? (
          <div className="divide-y divide-ktip-sand-100">
            {clients.map((client) => (
              <div key={client.id} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ktip-sand-900 truncate">
                    {client.name}
                    {client.revoked_at && (
                      <span className="ml-2 text-[11px] font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-600">
                        Revoked
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-ktip-sand-500 font-mono">{client.key_prefix}…</p>
                  <p className="text-xs text-ktip-sand-500">
                    {client.scopes.map((s) => SCOPE_LABELS[s] || s).join(', ')}
                    {' · '}
                    {client.last_used_at
                      ? `last used ${new Date(client.last_used_at).toLocaleString()}`
                      : 'never used'}
                  </p>
                </div>
                {!client.revoked_at && (
                  <button
                    onClick={() => setConfirmRevoke(client)}
                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                    title="Revoke"
                  >
                    <Ban size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-16 px-4">
            <div className="w-16 h-16 bg-ktip-sand-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <KeyRound size={32} className="text-ktip-sand-400" />
            </div>
            <h3 className="text-lg font-semibold text-ktip-sand-900 mb-1">No API keys issued</h3>
            <p className="text-ktip-sand-500 text-sm">
              Issue one key per partner platform so any of them can be revoked on its own.
            </p>
          </div>
        )}
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Issue API Key" size="md">
        <div className="space-y-4">
          <Input
            label="Partner name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Caribbean Jobs Portal"
            helperText="One key per partner. Sharing a key between platforms makes it impossible to revoke just one."
            fullWidth
          />
          <p className="text-sm text-ktip-sand-600">
            This key grants read access to employers that are both verified and marked as shared.
            It does not expire; revoke it to cut access off.
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} loading={mutating}>
              Issue Key
            </Button>
          </div>
        </div>
      </Modal>

      {/* Shown once, and only once. */}
      <Modal open={!!issuedKey} onClose={() => setIssuedKey(null)} title="Copy this key now" size="md">
        <div className="space-y-4">
          <p className="text-sm text-ktip-sand-600">
            Only a hash of this key is stored. Once you close this dialog it cannot be shown again
            by anyone, including OECS staff with database access. If it is lost, revoke this key and
            issue a new one.
          </p>
          <div className="bg-ktip-sand-50 border border-ktip-sand-200 rounded-xl p-3 font-mono text-xs break-all">
            {issuedKey}
          </div>
          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={handleCopy}
              icon={copied ? <Check size={16} /> : <Copy size={16} />}
            >
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button onClick={() => setIssuedKey(null)}>Done</Button>
          </div>
        </div>
      </Modal>

      {confirmRevoke && (
        <Modal open onClose={() => setConfirmRevoke(null)} title="Revoke API Key" size="sm">
          <p className="text-sm text-ktip-sand-600 mb-6">
            Revoke "{confirmRevoke.name}"? The next request using this key fails immediately, and it
            cannot be reactivated. Data already pulled by this partner is not affected.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setConfirmRevoke(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleRevoke} loading={mutating}>
              Revoke
            </Button>
          </div>
        </Modal>
      )}
    </>
  )
}
