import { Link } from 'react-router'
import { Users, UserX } from 'lucide-react'
import { useMyConnections, useConnectionMutations } from '../../../hooks/useConnections'
import { useAuth } from '../../../contexts/AuthContext'
import { useMemberPanel } from '../../../contexts/MemberPanelContext'
import { usePageTitle } from '../../../hooks/usePageTitle'
import { DiamondAvatar } from '../../../components/ui/DiamondAvatar'
import { Trans, useLingui } from '@lingui/react/macro'

export default function ConnectionsTab() {
    const { t } = useLingui()
  usePageTitle(t`My Connections`)
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
        <p className="text-ktip-sand-600 mb-2"><Trans>No connections yet.</Trans></p>
        <Link to="/directory" className="text-sm text-ktip-ocean-600 hover:underline">
          <Trans>Browse the member directory</Trans>
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
        const otherName = other?.display_name || t`Unknown User`
        return (
          /*
           * The whole card opens the preview, not just the name.
           *
           * A button is the outer element rather than a wrapper around one, so
           * there is a single tab stop per card and the entire surface is the
           * target. Remove sits inside it, which nests an interactive element
           * in a button — invalid, and a real problem for a screen reader — so
           * the row is a div with a click handler plus an explicit button role
           * and key handling, and Remove stops propagation.
           */
          <div
            key={connection.id}
            role="button"
            tabIndex={0}
            onClick={() => openMember(otherId)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                openMember(otherId)
              }
            }}
            aria-label={otherName}
            className="group flex cursor-pointer items-center justify-between gap-3 rounded-surface bg-ktip-cream p-4 shadow-neu transition-shadow hover:shadow-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ktip-ocean-500"
          >
            <span className="flex min-w-0 items-center gap-3 text-left">
              <DiamondAvatar src={other?.avatar_url} name={otherName} size={44} />
              <span className="min-w-0">
                <span className="block truncate text-caption font-bold text-ktip-sand-900 transition-colors group-hover:text-ktip-ocean-600">
                  {otherName}
                </span>
                {other?.country && (
                  <span className="block truncate text-micro text-ktip-sand-500">
                    {other.country}
                  </span>
                )}
              </span>
            </span>
            <button
              onClick={(e) => {
                // Without this the card's own handler fires straight after and
                // opens the preview for the member just removed.
                e.stopPropagation()
                removeConnection(connection.id)
              }}
              className="shrink-0 rounded-control p-2 text-ktip-sand-400 transition-colors hover:bg-red-50 hover:text-red-500"
              aria-label={t`Remove connection with ${otherName}`}
              title={t`Remove connection`}
            >
              <UserX size={16} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
