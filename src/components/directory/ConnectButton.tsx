import { UserPlus, UserCheck, Clock, Check, X } from 'lucide-react'
import {
  useConnectionStatus,
  useConnectionMutations,
  type ConnectionStatus,
} from '../../hooks/useConnections'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { useLingui } from '@lingui/react/macro'

interface ConnectButtonProps {
  otherUserId: string
  size?: 'sm' | 'md'
  /** Pre-fetched via useConnectionStatuses (directory grid) — skips the per-card query. */
  status?: ConnectionStatus
  /** Pair with `status` while the batch query is still in flight. */
  statusPending?: boolean
  /**
   * `hero` dresses the control for the member page's band: solid white for
   * the one action, frosted glass for the rest. The brand-navy fill of the
   * default reads as a hole on a navy backdrop.
   */
  tone?: 'default' | 'hero'
}

/**
 * State-aware connect control: Connect -> Pending -> (other side)
 * Accept/Decline -> Connected.
 */
export function ConnectButton({ otherUserId, size = 'md', status, statusPending, tone = 'default' }: ConnectButtonProps) {
    const { t } = useLingui()
  const auth = useAuth()
  const toast = useToast()
  const myId = auth.user?.id
  // Standalone fallback only; a provided `status` prop disables this query.
  const own = useConnectionStatus(status ? undefined : myId, otherUserId)
  const state = status ? status.state : own.state
  const connection = status ? status.connection : own.connection
  const statusLoading = status ? Boolean(statusPending) : own.loading
  const { sendRequest, respondToRequest, removeConnection, loading } = useConnectionMutations()

  if (!myId || myId === otherUserId) return null

  const hero = tone === 'hero'
  const base = hero
    ? 'inline-flex items-center justify-center gap-2 rounded-neu px-5 py-3 text-label font-bold transition-colors disabled:opacity-60'
    : size === 'sm'
      ? 'px-3 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center gap-1 disabled:opacity-50'
      : 'px-4 py-2 text-sm font-bold rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50'
  // The primary fill and the quiet fill, per tone.
  const primary = hero ? 'bg-white text-brand-navy hover:bg-ktip-sand-100' : 'btn-brand'
  const quiet = hero
    ? 'border border-white/30 bg-white/10 text-white backdrop-blur-sm hover:bg-white/20'
    : 'bg-ktip-sand-100 text-gray-600 hover:bg-ktip-sand-200'
  const done = hero
    ? 'border border-white/30 bg-white/10 text-white backdrop-blur-sm cursor-default'
    : 'bg-ktip-tropical-100 text-ktip-tropical-700 cursor-default'
  const iconSize = size === 'sm' ? 14 : 16
  const busy = loading || statusLoading

  const handleConnect = async () => {
    try {
      await sendRequest({
        requesterId: myId,
        requesterName: auth.profile?.display_name || t`Someone`,
        addresseeId: otherUserId,
      })
      toast.success(t`Connection request sent`)
    } catch (err: any) {
      toast.error(err.message || t`Failed to send request`)
    }
  }

  const handleRespond = async (accept: boolean) => {
    if (!connection) return
    try {
      await respondToRequest({
        connectionId: connection.id,
        accept,
        myId,
        myName: auth.profile?.display_name || t`Someone`,
        requesterId: connection.requester_id,
      })
      toast.success(accept ? t`Connection accepted` : t`Request declined`)
    } catch (err: any) {
      toast.error(err.message || t`Failed to respond`)
    }
  }

  const handleCancel = async () => {
    if (!connection) return
    try {
      await removeConnection(connection.id)
      toast.success(t`Request cancelled`)
    } catch (err: any) {
      toast.error(err.message || t`Failed to cancel`)
    }
  }

  if (state === 'connected') {
    return (
      <span className={`${base} ${done}`}>
        <UserCheck size={iconSize} />
        {t`Connected`}
      </span>
    )
  }

  if (state === 'pending_sent') {
    return (
      <button onClick={handleCancel} disabled={busy} className={`${base} ${quiet}`} title={t`Cancel request`}>
        <Clock size={iconSize} />
        {t`Pending`}
      </button>
    )
  }

  if (state === 'pending_received') {
    return (
      <span className="flex items-center gap-1.5">
        <button onClick={() => handleRespond(true)} disabled={busy} className={`${base} ${primary}`}>
          <Check size={iconSize} />
          {t`Accept`}
        </button>
        <button onClick={() => handleRespond(false)} disabled={busy} className={`${base} ${quiet}`}>
          <X size={iconSize} />
          {t`Decline`}
        </button>
      </span>
    )
  }

  return (
    <button onClick={handleConnect} disabled={busy} className={`${base} ${primary}`}>
      <UserPlus size={iconSize} />
      {t`Connect`}
    </button>
  )
}
