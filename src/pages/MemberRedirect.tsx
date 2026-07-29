import { Navigate, useParams } from 'react-router'

/**
 * Members no longer have a page — they open in a drawer over the directory.
 * This exists because notification rows already in the database carry
 * `/profile/<id>` links (see useConnections.ts), so the path has to keep
 * resolving for as long as those rows do.
 */
export default function MemberRedirect() {
  const { id } = useParams()
  if (!id) return <Navigate to="/directory" replace />
  return <Navigate to={`/directory?member=${id}`} replace />
}
