import { Navigate, useParams } from 'react-router'

/**
 * Old `/profile/<id>` links. Notification rows already in the database carry
 * them (see useConnections.ts), so the path has to keep resolving for as long
 * as those rows do.
 *
 * They now land on the member page rather than the directory drawer: someone
 * following an old link is arriving from outside the flow, which is exactly
 * the case the standalone page was brought back for.
 */
export default function MemberRedirect() {
  const { id } = useParams()
  if (!id) return <Navigate to="/directory" replace />
  return <Navigate to={`/u/${id}`} replace />
}
