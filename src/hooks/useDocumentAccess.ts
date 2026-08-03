import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { sendNotification } from '../lib/notify'
import { keys } from '../queries/keys'
import type {
  DocumentAccessGrant,
  DocumentAccessRequest,
  DocumentEntityType,
  DocumentVisibility,
} from '../types'
import { useLingui } from '@lingui/react/macro'

const DOMAIN = 'document-access'
const DOCUMENTS_DOMAIN = 'entity-documents'

/** Where a document lives, for the notification deep link. */
export function documentLink(entityType: DocumentEntityType, entityId: string): string {
  return entityType === 'grant' ? `/grants/${entityId}` : `/projects/${entityId}`
}

/** Everyone the owner has shared a document with. Owner-only by RLS. */
export function useDocumentGrants(documentId: string | undefined, enabled = true) {
  const fetchGrants = async (): Promise<DocumentAccessGrant[]> => {
    const { data, error } = await (supabase as any)
      .from('document_access')
      .select('*, user:profiles!user_id(*)')
      .eq('document_id', documentId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data as DocumentAccessGrant[]) || []
  }

  const query = useQuery({
    queryKey: keys.sub(DOMAIN, 'grants', documentId),
    queryFn: fetchGrants,
    enabled: enabled && !!documentId,
  })

  return { grants: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

/** Access requests on a document. Visible to the owner and to each requester. */
export function useDocumentAccessRequests(documentId: string | undefined, enabled = true) {
  const fetchRequests = async (): Promise<DocumentAccessRequest[]> => {
    const { data, error } = await (supabase as any)
      .from('document_access_requests')
      .select('*, requester:profiles!requester_id(*)')
      .eq('document_id', documentId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data as DocumentAccessRequest[]) || []
  }

  const query = useQuery({
    queryKey: keys.sub(DOMAIN, 'requests', documentId),
    queryFn: fetchRequests,
    enabled: enabled && !!documentId,
  })

  return {
    requests: query.data,
    pendingRequests: (query.data || []).filter((r) => r.status === 'pending'),
    loading: query.isPending,
    error: query.error,
    refetch: query.refetch,
  }
}

/** The current user's own outstanding requests, for a "waiting on owner" state. */
export function useMyAccessRequests(userId: string | undefined) {
  const fetchRequests = async (): Promise<DocumentAccessRequest[]> => {
    const { data, error } = await (supabase as any)
      .from('document_access_requests')
      .select('*')
      .eq('requester_id', userId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data as DocumentAccessRequest[]) || []
  }

  const query = useQuery({
    queryKey: keys.sub(DOMAIN, 'mine', userId),
    queryFn: fetchRequests,
    enabled: !!userId,
  })

  return { requests: query.data, loading: query.isPending, error: query.error }
}

export function useDocumentAccessMutations() {
    const { t } = useLingui()
  const queryClient = useQueryClient()

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: keys.all(DOMAIN) })
    queryClient.invalidateQueries({ queryKey: keys.all(DOCUMENTS_DOMAIN) })
  }

  const requestAccess = useMutation({
    mutationFn: async (params: {
      documentId: string
      requesterId: string
      ownerId: string
      documentTitle: string
      entityType: DocumentEntityType
      entityId: string
      requesterName: string
      message?: string
    }) => {
      const { data, error } = await (supabase as any)
        .from('document_access_requests')
        .insert({
          document_id: params.documentId,
          requester_id: params.requesterId,
          message: params.message || null,
        })
        .select()
        .single()

      if (error) {
        // Partial unique index on (document_id, requester_id) WHERE pending
        if (error.code === '23505') {
          throw new Error(t`You already have a pending request for this document.`)
        }
        throw error
      }

      sendNotification({
        userId: params.ownerId,
        type: 'document_access_request',
        title: t`Document access requested`,
        body: t`${params.requesterName} is requesting access to "${params.documentTitle}"`,
        link: documentLink(params.entityType, params.entityId),
      })

      return data as DocumentAccessRequest
    },
    onSuccess: invalidate,
  })

  /**
   * Approve or deny. The grant and the request status are written together by
   * decide_document_access_request() so the client cannot leave them out of sync.
   */
  const decideRequest = useMutation({
    mutationFn: async (params: {
      requestId: string
      approve: boolean
      role?: 'viewer' | 'editor'
      requesterId: string
      documentTitle: string
      entityType: DocumentEntityType
      entityId: string
    }) => {
      const { error } = await (supabase as any).rpc('decide_document_access_request', {
        p_request_id: params.requestId,
        p_approve: params.approve,
        p_role: params.role || 'viewer',
      })
      if (error) throw error

      const roleLabel = params.role === 'editor' ? t`an editor` : t`a viewer`
      sendNotification({
        userId: params.requesterId,
        type: 'document_access_result',
        title: params.approve ? t`Document access granted` : t`Document access declined`,
        body: params.approve
          ? t`You can now open "${params.documentTitle}" as ${roleLabel}.`
          : t`Your request to access "${params.documentTitle}" was declined.`,
        link: documentLink(params.entityType, params.entityId),
      })
    },
    onSuccess: invalidate,
  })

  const setVisibility = useMutation({
    mutationFn: async (params: { documentId: string; visibility: DocumentVisibility }) => {
      const { error } = await (supabase as any)
        .from('entity_documents')
        .update({ visibility: params.visibility })
        .eq('id', params.documentId)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const shareWithUser = useMutation({
    mutationFn: async (params: {
      documentId: string
      userId: string
      role: 'viewer' | 'editor'
      grantedBy: string
      documentTitle: string
      entityType: DocumentEntityType
      entityId: string
    }) => {
      const { error } = await (supabase as any)
        .from('document_access')
        .upsert(
          {
            document_id: params.documentId,
            user_id: params.userId,
            role: params.role,
            granted_by: params.grantedBy,
          },
          { onConflict: 'document_id,user_id' }
        )
      if (error) throw error

      sendNotification({
        userId: params.userId,
        type: 'document_access_result',
        title: t`A document was shared with you`,
        body: t`You can now open "${params.documentTitle}".`,
        link: documentLink(params.entityType, params.entityId),
      })
    },
    onSuccess: invalidate,
  })

  const updateGrantRole = useMutation({
    mutationFn: async (params: { grantId: string; role: 'viewer' | 'editor' }) => {
      const { error } = await (supabase as any)
        .from('document_access')
        .update({ role: params.role })
        .eq('id', params.grantId)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const revokeAccess = useMutation({
    mutationFn: async (grantId: string) => {
      const { error } = await (supabase as any).from('document_access').delete().eq('id', grantId)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return {
    requestAccess: requestAccess.mutateAsync,
    requestingAccess: requestAccess.isPending,
    decideRequest: decideRequest.mutateAsync,
    decidingRequest: decideRequest.isPending,
    setVisibility: setVisibility.mutateAsync,
    settingVisibility: setVisibility.isPending,
    shareWithUser: shareWithUser.mutateAsync,
    sharing: shareWithUser.isPending,
    updateGrantRole: updateGrantRole.mutateAsync,
    revokeAccess: revokeAccess.mutateAsync,
  }
}
