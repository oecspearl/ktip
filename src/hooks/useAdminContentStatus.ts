import { useMutation, useQueryClient } from '@tanstack/react-query'
import { i18n } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import { settleEach, type SettleOptions } from '../lib/bulk'
import { sendAdminNote } from '../lib/admin-notes'

/** What the console can suspend through admin_set_content_status() (183). */
export type ModeratedKind = 'project' | 'event' | 'resource'

/** projects.status, resources.status and events.moderation_status share these. */
export type ContentModerationStatus = 'active' | 'quarantined' | 'removed'

function refusal(reason: unknown): string {
  switch (reason) {
    case 'forbidden':
      return i18n._(msg`You do not have permission to change this.`)
    case 'not_found':
      return i18n._(msg`Not found. It may already be gone.`)
    default:
      return i18n._(msg`Could not change it.`)
  }
}

const DOMAIN: Record<ModeratedKind, string> = {
  project: 'projects',
  event: 'events',
  resource: 'resources',
}

/**
 * Suspend (quarantined) or restore (active) several items, one RPC each, so a
 * refusal on one is reported against that row and the rest still go through.
 * On a suspension with a reason, the owner gets a note (182) once the item is
 * hidden; a note that cannot be sent does not fail the row.
 */
export function useSetContentStatus(kind: ModeratedKind) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: ({
      ids,
      status,
      reason,
      onProgress,
    }: {
      ids: string[]
      status: ContentModerationStatus
      reason?: string
      onProgress?: SettleOptions['onProgress']
    }) =>
      settleEach(
        ids,
        async (id) => {
          const { data, error } = await (supabase as any).rpc('admin_set_content_status', {
            p_target_type: kind,
            p_target_id: id,
            p_status: status,
            p_reason: reason?.trim() || null,
          })
          if (error) throw error
          if (data?.ok !== true) throw new Error(refusal(data?.reason))
          if (status === 'quarantined' && reason?.trim() && data?.changed !== false) {
            await sendAdminNote(kind, id, reason)
          }
        },
        { onProgress }
      ),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: keys.all(DOMAIN[kind]) })
      queryClient.invalidateQueries({ queryKey: keys.all(`admin-${DOMAIN[kind]}`) })
      queryClient.invalidateQueries({ queryKey: keys.all('dashboard') })
    },
  })

  const setStatus = (
    ids: string[],
    status: ContentModerationStatus,
    reason?: string,
    onProgress?: SettleOptions['onProgress']
  ) => mutation.mutateAsync({ ids, status, reason, onProgress })

  return { setStatus, loading: mutation.isPending }
}

/**
 * The resource library's bulk delete, the shape BulkDeleteDialog expects. A
 * resource has no uploads table of its own; its file in resource-files stays
 * until a cleanup, as it did with the single delete this replaces.
 */
export function useBulkDeleteResources() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: ({ ids, onProgress }: { ids: string[]; onProgress?: SettleOptions['onProgress'] }) =>
      settleEach(
        ids,
        async (id) => {
          const { data, error } = await (supabase as any).from('resources').delete().eq('id', id).select('id')
          if (error) throw error
          if (!data?.length) {
            throw new Error(i18n._(msg`Not deleted. It may already be gone, or you may not be allowed to delete it.`))
          }
        },
        { onProgress }
      ),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('resources') })
    },
  })

  const deleteResources = (ids: string[], onProgress?: SettleOptions['onProgress']) =>
    mutation.mutateAsync({ ids, onProgress })

  return { deleteResources, loading: mutation.isPending }
}
