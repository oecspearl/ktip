import { UserPlus, UserCheck, Clock, Check, X } from 'lucide-react'
import { useConnectionStatus, useConnectionMutations } from '../../hooks/useConnections'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'

interface ConnectButtonProps {
  otherUserId: string
  size?: 'sm' | 'md'
}

/**
 * State-aware connect control: Connect -> Pending -> (other side)
 * Accept/Decline -> Connected.
 */
export function ConnectButton({ otherUserId, size = 'md' }: ConnectButtonProps) {
  const auth = useAuth()
  const toast = useToast()
  const myId = auth.user?.id
  const { state, connection, loading: statusLoading } = useConnectionStatus(myId, otherUserId)
  const { sendRequest, respondToRequest, removeConnection, loading } = useConnectionMutations()

  if (!myId || myId === otherUserId) return null

  const base =
    size === 'sm'
      ? 'px-3 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center gap-1 disabled:opacity-50'
      : 'px-4 py-2 text-sm font-bold rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50'
  const iconSize = size === 'sm' ? 14 : 16
  const busy = loading || statusLoading

  const handleConnect = async () => {
    try {
      await sendRequest({
        requesterId: myId,
        requesterName: auth.profile?.display_name || 'Someone',
        addresseeId: otherUserId,
      })
      toast.success('Connection request sent')
    } catch (err: any) {
      toast.error(err.message || 'Failed to send request')
    }
  }

  const handleRespond = async (accept: boolean) => {
    if (!connection) return
    try {
      await respondToRequest({
        connectionId: connection.id,
        accept,
        myId,
        myName: auth.profile?.display_name || 'Someone',
        requesterId: connection.requester_id,
      })
      toast.success(accept ? 'Connection accepted' : 'Request declined')
    } catch (err: any) {
      toast.error(err.message || 'Failed to respond')
    }
  }

  const handleCancel = async () => {
    if (!connection) return
    try {
      await removeConnection(connection.id)
      toast.success('Request cancelled')
    } catch (err: any) {
      toast.error(err.message || 'Failed to cancel')
    }
  }

  if (state === 'connected') {
    return (
      <span className={`${base} bg-ktip-tropical-100 text-ktip-tropical-700 cursor-default`}>
        <UserCheck size={iconSize} />
        Connected
      </span>
    )
  }

  if (state === 'pending_sent') {
    return (
      <button onClick={handleCancel} disabled={busy} className={`${base} bg-ktip-sand-100 text-gray-600 hover:bg-ktip-sand-200`} title="Cancel request">
        <Clock size={iconSize} />
        Pending
      </button>
    )
  }

  if (state === 'pending_received') {
    return (
      <span className="flex items-center gap-1.5">
        <button onClick={() => handleRespond(true)} disabled={busy} className={`${base} btn-brand`}>
          <Check size={iconSize} />
          Accept
        </button>
        <button onClick={() => handleRespond(false)} disabled={busy} className={`${base} bg-ktip-sand-100 text-gray-600 hover:bg-ktip-sand-200`}>
          <X size={iconSize} />
          Decline
        </button>
      </span>
    )
  }

  return (
    <button onClick={handleConnect} disabled={busy} className={`${base} btn-brand`}>
      <UserPlus size={iconSize} />
      Connect
    </button>
  )
}
