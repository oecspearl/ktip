import { Navigate, useLocation, useParams } from 'react-router'

/**
 * Old `/profile/<id>` and `/u/<id>` links. Notification rows already in the
 * database carry the first (see useConnections.ts), and the second was the
 * member page's address until the URLs were made readable, so both have to keep
 * resolving for as long as those links do.
 *
 * They now land on the member page rather than the directory drawer: someone
 * following an old link is arriving from outside the flow, which is exactly
 * the case the standalone page was brought back for.
 */
export default function MemberRedirect() {
  const { id } = useParams()
  const { pathname } = useLocation()
  if (!id) return <Navigate to="/directory" replace />
  // Keeps the /cv suffix when one is present, so an old CV link still opens a CV.
  const suffix = pathname.endsWith('/cv') ? '/cv' : ''
  return <Navigate to={`/user/${id}${suffix}`} replace />
}
