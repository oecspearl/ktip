import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { i18n } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import type { MessageDescriptor } from '@lingui/core'
import { supabase } from '../lib/supabase'
import { sendNotification } from '../lib/notify'
import { keys } from '../queries/keys'
import type { CollabInvite, CollabResourceType, EmailInvite } from '../types'

/**
 * The three share tables are structurally identical apart from their names,
 * so every query here is written once and mapped over this descriptor.
 */
interface ResourceSpec {
  type: CollabResourceType
  shareTable: string
  fkColumn: string
  entityTable: string
  /** Where the invitee lands after accepting. */
  href: (id: string) => string
}

export const RESOURCE_SPECS: Record<CollabResourceType, ResourceSpec> = {
  whiteboard: {
    type: 'whiteboard',
    shareTable: 'whiteboard_shares',
    fkColumn: 'whiteboard_id',
    entityTable: 'whiteboards',
    href: (id) => `/collaborate/whiteboard/${id}`,
  },
  document: {
    type: 'document',
    shareTable: 'document_shares',
    fkColumn: 'document_id',
    entityTable: 'documents',
    href: (id) => `/collaborate/document/${id}`,
  },
  snippet: {
    type: 'snippet',
    shareTable: 'snippet_shares',
    fkColumn: 'snippet_id',
    entityTable: 'snippets',
    href: (id) => `/collaborate/code/${id}`,
  },
}

const ALL_SPECS = Object.values(RESOURCE_SPECS)

const UNTITLED_LABELS: Record<CollabResourceType, MessageDescriptor> = {
  whiteboard: msg`Untitled whiteboard`,
  document: msg`Untitled document`,
  snippet: msg`Untitled snippet`,
}

/**
 * Titles come from a second query rather than an embed: while an invite is
 * still pending, RLS deliberately hides the entity row, so a join would
 * return null. Failing that lookup is expected, not an error.
 */
async function titlesFor(spec: ResourceSpec, ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {}
  const { data } = await (supabase.from(spec.entityTable) as any).select('id, title').in('id', ids)
  const map: Record<string, string> = {}
  for (const row of (data as any[]) || []) map[row.id] = row.title
  return map
}

async function fetchInvitesFor(
  spec: ResourceSpec,
  column: 'shared_with' | 'shared_by',
  userId: string,
  status: string
): Promise<CollabInvite[]> {
  const otherParty = column === 'shared_with' ? 'shared_by' : 'shared_with'
  const { data, error } = await (supabase.from(spec.shareTable) as any)
    .select(`*, party:profiles!${otherParty}(*)`)
    .eq(column, userId)
    .eq('status', status)
    .order('created_at', { ascending: false })

  if (error) throw error
  const rows = (data as any[]) || []
  const titles = await titlesFor(spec, rows.map((r) => r[spec.fkColumn]))

  return rows.map((row) => ({
    id: row.id,
    shared_with: row.shared_with,
    shared_by: row.shared_by,
    permission: row.permission ?? 'view',
    status: row.status,
    created_at: row.created_at,
    resource_type: spec.type,
    resource_id: row[spec.fkColumn],
    resource_title: titles[row[spec.fkColumn]] || i18n._(UNTITLED_LABELS[spec.type]),
    inviter: column === 'shared_with' ? row.party : undefined,
    recipient: column === 'shared_by' ? row.party : undefined,
  }))
}

/** Collaboration invitations awaiting the current user's response. */
export function useMyCollabInvites(userId: string | undefined) {
  const query = useQuery({
    queryKey: keys.sub('collab-invites', 'received', userId),
    queryFn: async () => {
      const batches = await Promise.all(
        ALL_SPECS.map((spec) => fetchInvitesFor(spec, 'shared_with', userId as string, 'pending'))
      )
      return batches.flat().sort((a, b) => b.created_at.localeCompare(a.created_at))
    },
    enabled: !!userId,
  })

  return { invites: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

/** Invitations the current user has sent that nobody has answered yet. */
export function useSentCollabInvites(userId: string | undefined) {
  const query = useQuery({
    queryKey: keys.sub('collab-invites', 'sent', userId),
    queryFn: async () => {
      const batches = await Promise.all(
        ALL_SPECS.map((spec) => fetchInvitesFor(spec, 'shared_by', userId as string, 'pending'))
      )
      return batches.flat().sort((a, b) => b.created_at.localeCompare(a.created_at))
    },
    enabled: !!userId,
  })

  return { invites: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

/** Outstanding email invitations the current user has sent. */
export function useSentEmailInvites(userId: string | undefined) {
  const query = useQuery({
    queryKey: keys.sub('collab-invites', 'email', userId),
    queryFn: async (): Promise<EmailInvite[]> => {
      const { data, error } = await (supabase.from('email_invites') as any)
        .select('*')
        .eq('invited_by', userId as string)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) throw error
      return (data as EmailInvite[]) || []
    },
    enabled: !!userId,
  })

  return { invites: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

export function useCollabInviteMutations() {
    const { t } = useLingui()
  const queryClient = useQueryClient()
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: keys.all('collab-invites') })
    queryClient.invalidateQueries({ queryKey: keys.all('whiteboards') })
    queryClient.invalidateQueries({ queryKey: keys.all('documents') })
    queryClient.invalidateQueries({ queryKey: keys.all('snippets') })
  }

  const respondMutation = useMutation({
    mutationFn: async (params: {
      invite: CollabInvite
      accept: boolean
      responderName: string
    }) => {
      const spec = RESOURCE_SPECS[params.invite.resource_type]
      const { error } = await (supabase.from(spec.shareTable) as any)
        .update({ status: params.accept ? 'accepted' : 'declined' })
        .eq('id', params.invite.id)

      if (error) throw error

      if (params.accept) {
        sendNotification({
          userId: params.invite.shared_by,
          type: 'invite_accepted',
          title: t`Invitation accepted`,
          body: t`${params.responderName} accepted your invitation to "${params.invite.resource_title}"`,
          link: spec.href(params.invite.resource_id),
        })
      }
    },
    onSuccess: invalidate,
  })

  /** Withdraw an invitation you sent, or leave a collaboration you joined. */
  const revokeMutation = useMutation({
    mutationFn: async (invite: CollabInvite) => {
      const spec = RESOURCE_SPECS[invite.resource_type]
      const { error } = await (supabase.from(spec.shareTable) as any).delete().eq('id', invite.id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const revokeEmailMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      const { error } = await (supabase.from('email_invites') as any)
        .update({ status: 'revoked' })
        .eq('id', inviteId)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return {
    respondToInvite: respondMutation.mutateAsync,
    revokeInvite: revokeMutation.mutateAsync,
    revokeEmailInvite: revokeEmailMutation.mutateAsync,
    loading:
      respondMutation.isPending || revokeMutation.isPending || revokeEmailMutation.isPending,
    error: respondMutation.error || revokeMutation.error || revokeEmailMutation.error,
  }
}
