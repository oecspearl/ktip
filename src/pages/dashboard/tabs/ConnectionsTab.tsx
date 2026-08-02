import { Link } from 'react-router'
import { Users, UserX } from 'lucide-react'
import { useMyConnections, useConnectionMutations } from '../../../hooks/useConnections'
import { useAuth } from '../../../contexts/AuthContext'
import { useMemberPanel } from '../../../contexts/MemberPanelContext'
import { usePageTitle } from '../../../hooks/usePageTitle'
import { DiamondAvatar } from '../../../components/ui/DiamondAvatar'

export default function ConnectionsTab() {
  usePageTitle('My Connections')
  const auth = useAuth()
  const { connections } = useMyConnections(auth.user?.id)
  const { removeConnection } = useConnectionMutations()
  const { openMember } = useMemberPanel()

  if (!connections?.length) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 bg-ktip-sand-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Users size={32} className="text-ktip-sand-400" />
        </div>
        <p className="text-ktip-sand-600 mb-2">No connections yet.</p>
        <Link to="/directory" className="text-sm text-ktip-ocean-600 hover:underline">
          Browse the member directory
        </Link>
      </div>
    )
  }

  return (
    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4 stagger-children">
      {connections.map((connection) => {
        const other =
          connection.requester_id === auth.user?.id ? connection.addressee : connection.requester
        const otherId =
          connection.requester_id === auth.user?.id
            ? connection.addressee_id
            : connection.requester_id
        const otherName = other?.display_name || 'Unknown User'
        return (
          <div
            key={connection.id}
            className="flex items-center justify-between gap-3 bg-ktip-cream border border-ktip-sand-200 rounded-lg p-4"
          >
            <button
              type="button"
              onClick={() => openMember(otherId)}
              className="flex items-center gap-3 min-w-0 group text-left"
            >
              <DiamondAvatar src={other?.avatar_url} name={otherName} size={44} />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ktip-sand-900 truncate group-hover:text-ktip-ocean-600 transition-colors">
                  {otherName}
                </p>
                {other?.country && (
                  <p className="text-xs text-gray-500 truncate">{other.country}</p>
                )}
              </div>
            </button>
            <button
              onClick={() => removeConnection(connection.id)}
              className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0"
              aria-label={`Remove connection with ${otherName}`}
              title="Remove connection"
            >
              <UserX size={16} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
