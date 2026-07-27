import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { sendNotification } from '../lib/notify'
import { keys } from '../queries/keys'
import type { ProjectMember, ProjectMemberRole } from '../types'

// Team roster for a project (pending + accepted; declined rows are hidden)
export function useProjectMembers(projectId: string | undefined) {
  const fetchMembers = async (pid: string): Promise<ProjectMember[]> => {
    const { data, error } = await (supabase as any)
      .from('project_members')
      .select('*, user:profiles!user_id(*)')
      .eq('project_id', pid)
      .neq('status', 'declined')
      .order('created_at', { ascending: true })

    if (error) throw error
    return (data as any[]) || []
  }

  const query = useQuery({
    queryKey: keys.sub('projects', 'members', projectId),
    queryFn: () => fetchMembers(projectId as string),
    enabled: !!projectId,
  })

  return { members: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

// Current user's pending project invites (for banners / invite lists)
export function useMyProjectInvites(userId: string | undefined) {
  const fetchInvites = async (uid: string): Promise<ProjectMember[]> => {
    const { data, error } = await (supabase as any)
      .from('project_members')
      .select('*, project:projects!project_id(*)')
      .eq('user_id', uid)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data as any[]) || []
  }

  const query = useQuery({
    queryKey: keys.sub('projects', 'my-invites', userId),
    queryFn: () => fetchInvites(userId as string),
    enabled: !!userId,
  })

  return { invites: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

export function useProjectMemberMutations() {
  const queryClient = useQueryClient()

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: keys.all('projects') })
  }

  const inviteMutation = useMutation({
    mutationFn: async (params: {
      projectId: string
      projectTitle: string
      userId: string
      role: ProjectMemberRole
      invitedBy: string
    }) => {
      const { data, error } = await (supabase as any)
        .from('project_members')
        .insert({
          project_id: params.projectId,
          user_id: params.userId,
          role: params.role,
          status: 'pending',
          invited_by: params.invitedBy,
        })
        .select()
        .single()

      if (error) throw error

      sendNotification({
        userId: params.userId,
        type: 'project_invite',
        title: 'Project team invitation',
        body: `You've been invited to join "${params.projectTitle}"`,
        link: `/projects/${params.projectId}`,
      })
      return data
    },
    onSuccess: invalidate,
  })

  const respondMutation = useMutation({
    mutationFn: async (params: { membershipId: string; accept: boolean }) => {
      const { data, error } = await (supabase as any)
        .from('project_members')
        .update({ status: params.accept ? 'accepted' : 'declined' })
        .eq('id', params.membershipId)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })

  const updateRoleMutation = useMutation({
    mutationFn: async (params: { membershipId: string; role: ProjectMemberRole }) => {
      const { error } = await (supabase as any)
        .from('project_members')
        .update({ role: params.role })
        .eq('id', params.membershipId)

      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const removeMutation = useMutation({
    mutationFn: async (membershipId: string) => {
      const { error } = await (supabase as any)
        .from('project_members')
        .delete()
        .eq('id', membershipId)

      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return {
    inviteMember: inviteMutation.mutateAsync,
    respondToInvite: respondMutation.mutateAsync,
    updateMemberRole: updateRoleMutation.mutateAsync,
    removeMember: removeMutation.mutateAsync,
    loading:
      inviteMutation.isPending ||
      respondMutation.isPending ||
      updateRoleMutation.isPending ||
      removeMutation.isPending,
    error:
      inviteMutation.error || respondMutation.error || updateRoleMutation.error || removeMutation.error,
  }
}
