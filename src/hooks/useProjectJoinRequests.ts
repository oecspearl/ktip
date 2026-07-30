import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { sendNotification } from '../lib/notify'
import { keys } from '../queries/keys'
import type { ProjectJoinRequest, ProjectTeamMember } from '../types'

/**
 * "Request to collaborate" — the requester-initiated half of project
 * membership (migration 079).
 *
 * Mirrors useDocumentAccess: the client inserts a pending row, and the owner's
 * decision goes through a SECURITY DEFINER RPC that writes the membership and
 * closes the request together. Nothing here can grant access on its own.
 */

const DOMAIN = 'projects'

/** Pending requests on a project. Readable by the owner (RLS does the rest). */
export function useProjectJoinRequests(projectId: string | undefined, enabled = true) {
  const query = useQuery({
    queryKey: keys.sub(DOMAIN, 'join-requests', projectId),
    queryFn: async (): Promise<ProjectJoinRequest[]> => {
      const { data, error } = await (supabase as any)
        .from('project_join_requests')
        .select('*, requester:profiles!requester_id(*)')
        .eq('project_id', projectId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })

      if (error) throw error
      return (data as any[]) || []
    },
    enabled: !!projectId && enabled,
  })

  return { requests: query.data, loading: query.isPending, error: query.error }
}

/** Every pending request across every project I own — the /invitations inbox. */
export function useIncomingJoinRequests(userId: string | undefined) {
  const query = useQuery({
    queryKey: keys.sub(DOMAIN, 'incoming-join-requests', userId),
    queryFn: async (): Promise<ProjectJoinRequest[]> => {
      // RLS already limits this to requests the caller may see: their own, and
      // any on a project they own. Filtering out their own leaves the inbox.
      const { data, error } = await (supabase as any)
        .from('project_join_requests')
        .select('*, requester:profiles!requester_id(*), project:projects!project_id(*)')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })

      if (error) throw error
      return ((data as any[]) || []).filter((r) => r.requester_id !== userId)
    },
    enabled: !!userId,
  })

  return { requests: query.data, loading: query.isPending, error: query.error }
}

/** My own pending request on one project, so the button can say "Requested". */
export function useMyJoinRequest(projectId: string | undefined, userId: string | undefined) {
  const query = useQuery({
    queryKey: keys.sub(DOMAIN, `my-join-request-${projectId}`, userId),
    queryFn: async (): Promise<ProjectJoinRequest | null> => {
      const { data, error } = await (supabase as any)
        .from('project_join_requests')
        .select('*')
        .eq('project_id', projectId)
        .eq('requester_id', userId)
        .eq('status', 'pending')
        .maybeSingle()

      if (error) throw error
      return (data as ProjectJoinRequest) || null
    },
    enabled: !!projectId && !!userId,
  })

  return { request: query.data, loading: query.isPending }
}

/**
 * The public roster.
 *
 * project_members SELECT is owner-or-member only, so reading the table
 * directly gives a visitor an empty team — which is why the detail page only
 * ever showed the owner. This RPC is the sanctioned public view (079). The
 * headcount does not need it: it lives on projects.member_count.
 */
export function useProjectTeam(projectId: string | undefined) {
  const query = useQuery({
    queryKey: keys.sub(DOMAIN, 'team', projectId),
    queryFn: async (): Promise<ProjectTeamMember[]> => {
      const { data, error } = await (supabase as any).rpc('get_project_team', {
        p_project_id: projectId,
      })
      if (error) throw error
      return (data as ProjectTeamMember[]) || []
    },
    enabled: !!projectId,
  })

  return { team: query.data, loading: query.isPending }
}

export function useProjectJoinRequestMutations() {
  const queryClient = useQueryClient()
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: keys.all(DOMAIN) })
  }

  const request = useMutation({
    mutationFn: async (params: {
      projectId: string
      projectTitle: string
      requesterId: string
      requesterName: string
      ownerId: string
      message?: string
    }) => {
      const { data, error } = await (supabase as any)
        .from('project_join_requests')
        .insert({
          project_id: params.projectId,
          requester_id: params.requesterId,
          message: params.message || null,
        })
        .select()
        .single()

      if (error) {
        // Partial unique index on (project_id, requester_id) WHERE pending
        if (error.code === '23505') {
          throw new Error('You already have a pending request for this project.')
        }
        throw error
      }

      sendNotification({
        userId: params.ownerId,
        type: 'project_join_request',
        title: 'Request to collaborate',
        body: `${params.requesterName} wants to join "${params.projectTitle}"`,
        link: `/invitations`,
      })

      return data as ProjectJoinRequest
    },
    onSuccess: invalidate,
  })

  const decide = useMutation({
    mutationFn: async (params: {
      requestId: string
      approve: boolean
      requesterId: string
      projectId: string
      projectTitle: string
    }) => {
      const { error } = await (supabase as any).rpc('decide_project_join_request', {
        p_request_id: params.requestId,
        p_approve: params.approve,
      })
      if (error) throw error

      sendNotification({
        userId: params.requesterId,
        type: 'project_join_result',
        title: params.approve ? 'You joined a project team' : 'Collaboration request declined',
        body: params.approve
          ? `You are now on the team for "${params.projectTitle}".`
          : `Your request to collaborate on "${params.projectTitle}" was declined.`,
        link: `/projects/${params.projectId}`,
      })
    },
    onSuccess: invalidate,
  })

  const withdraw = useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await (supabase as any)
        .from('project_join_requests')
        .delete()
        .eq('id', requestId)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return {
    requestToJoin: request.mutateAsync,
    requesting: request.isPending,
    decideRequest: decide.mutateAsync,
    deciding: decide.isPending,
    withdrawRequest: withdraw.mutateAsync,
  }
}
