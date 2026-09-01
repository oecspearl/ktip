import { requireCanAdminister, requirePermission } from '../_lib/require-permission'

export const config = { runtime: 'edge' }

export default async function handler(request: Request) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const guard = await requirePermission(request, 'members:manage')
  if (!guard.ok) return guard.response
  const { callerId, callerClient, adminClient } = guard

  let body: { user_id: string }
  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!body.user_id) {
    return new Response(
      JSON.stringify({ error: 'user_id is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Prevent self-deletion
  if (body.user_id === callerId) {
    return new Response(
      JSON.stringify({ error: 'Cannot delete your own account' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // The Super Admin ceiling (124): an Admin cannot delete another Admin.
  const ceiling = await requireCanAdminister(callerClient, body.user_id)
  if (ceiling) return ceiling

  const { error } = await adminClient.auth.admin.deleteUser(body.user_id)

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
}
