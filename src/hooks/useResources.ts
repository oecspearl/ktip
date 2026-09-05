import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { escapeIlike, sanitizeTag } from '../lib/utils'
import { keys } from '../queries/keys'
import { rankRows, type ContentSort } from '../lib/personalization'
import { usePersonalizationActive } from './usePersonalization'
import { isUuid } from '../lib/slug'
import {
  RESOURCE_FILES_BUCKET,
  buildResourceStoragePath,
  removeResourceUploads,
  signResourceFileUrl,
} from '../lib/resource-uploads'
import type { Resource } from '../types'

export function useResources(filters?: {
  type?: string
  category?: string
  search?: string
  climateAction?: boolean
  tags?: string[]
  sort?: ContentSort
}) {
  // Sorted so ['ai','climate'] and ['climate','ai'] share one cache entry.
  const tags = filters?.tags?.length
    ? [...filters.tags].map(sanitizeTag).filter(Boolean).sort()
    : undefined

  // "For You" only survives if the ranker can actually do something. The uid
  // enters the cache key only in that case, so signed-out and non-personalized
  // readers keep sharing the one cache entry they always did.
  const { active, uid } = usePersonalizationActive()
  const sort: ContentSort = filters?.sort === 'for_you' && active ? 'for_you' : 'newest'
  const normalized = { ...filters, tags, sort, uid: sort === 'for_you' ? uid : undefined }

  const fetchResources = async (): Promise<Resource[]> => {
    // approval_status is stated here as well as enforced by RLS: a
    // resource:manage holder reads every row through 116's FOR ALL policy, so
    // without this line a reviewer would see pending submissions mixed into the
    // public grid and nobody else would.
    let query = (supabase as any)
      .from('resources')
      .select('*, author:profiles(*)')
      .eq('is_published', true)
      .eq('approval_status', 'approved')
      .order('created_at', { ascending: false })

    if (filters?.type) {
      query = query.eq('resource_type', filters.type)
    }

    if (filters?.category) {
      query = query.eq('category', filters.category)
    }

    if (filters?.climateAction) {
      query = query.eq('is_climate_action', true)
    }

    // "any of" — AND semantics would empty the list on the second chip click
    if (tags?.length) {
      query = query.overlaps('tags', tags)
    }

    if (filters?.search) {
      const sanitized = escapeIlike(filters.search)
      if (sanitized) {
        query = query.or(
          `title.ilike.%${sanitized}%,summary.ilike.%${sanitized}%,description.ilike.%${sanitized}%,tags_text.ilike.%${sanitized}%`
        )
      }
    }

    // Unbounded until now. The ranker caps the ids it will score, and an
    // unbounded list would blow past that on a large corpus.
    query = query.limit(200)

    const { data, error } = await query

    if (error) throw error
    const rows = (data as any[]) || []

    return sort === 'for_you' ? rankRows('resource', rows) : rows
  }

  const query = useQuery({
    queryKey: keys.list('resources', normalized),
    queryFn: fetchResources,
    // The second round trip is only worth paying for once a minute.
    staleTime: sort === 'for_you' ? 60_000 : undefined,
  })

  return { resources: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

/** Accepts either a uuid or a slug — see src/lib/slug.ts. */
export function useResource(id: string | undefined) {
  const fetchResource = async (resourceId: string): Promise<Resource | null> => {
    const { data, error } = await (supabase as any)
      .from('resources')
      .select('*, author:profiles(*)')
      .eq(isUuid(resourceId) ? 'id' : 'slug', resourceId)
      .single()

    if (error) throw error
    return data as any
  }

  const query = useQuery({
    queryKey: keys.detail('resources', id),
    queryFn: () => fetchResource(id as string),
    enabled: !!id,
  })

  return { resource: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

export function useAdminResources() {
  const fetchResources = async (): Promise<Resource[]> => {
    const { data, error } = await (supabase as any)
      .from('resources')
      .select('*, author:profiles(*)')
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data as any[]) || []
  }

  const query = useQuery({
    queryKey: keys.list('resources', 'admin'),
    queryFn: fetchResources,
  })

  return { resources: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

export function useCreateResource() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (resourceData: {
      title: string
      description?: string
      summary?: string | null
      content?: string
      resource_type: string
      category?: string
      tags?: string[]
      download_url?: string
      thumbnail_url?: string
      is_climate_action?: boolean
      is_published?: boolean
    }) => {
      const { data, error } = await (supabase as any)
        .from('resources')
        .insert(resourceData)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('resources') })
    },
  })

  return { createResource: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}

export function useUpdateResource() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async ({
      resourceId,
      updates,
    }: {
      resourceId: string
      updates: Record<string, any>
    }) => {
      const { data, error } = await (supabase as any)
        .from('resources')
        .update(updates)
        .eq('id', resourceId)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('resources') })
    },
  })

  const updateResource = (resourceId: string, updates: Record<string, any>) =>
    mutation.mutateAsync({ resourceId, updates })

  return { updateResource, loading: mutation.isPending, error: mutation.error }
}

/**
 * A member's own contributions, in every state.
 *
 * Reads through 135's "Authors can view own resources" policy, which is
 * deliberately unqualified — a rejected submission has to stay visible to the
 * person who wrote it, or the rejection notification links to nothing.
 */
export function useMyResourceSubmissions(userId: string | undefined) {
  const query = useQuery({
    queryKey: keys.sub('resources', 'mine', userId),
    queryFn: async (): Promise<Resource[]> => {
      const { data, error } = await (supabase as any)
        .from('resources')
        .select('*, author:profiles(*)')
        .eq('author_id', userId as string)
        .order('created_at', { ascending: false })

      if (error) throw error
      return (data as any[]) || []
    },
    enabled: !!userId,
  })

  return { submissions: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

/**
 * The review queue.
 *
 * NO `status` FILTER, deliberately. 135 arms the moderation filter for this
 * table in `quarantine` mode, so a flagged submission is written with
 * `status = 'quarantined'` before anyone sees it. Filtering on status here would
 * hide exactly the submissions that most need a human, and the member would
 * wait forever on a queue their row was never in. The reviewer sees the badge
 * instead and decides.
 */
export function useResourceSubmissions() {
  const query = useQuery({
    queryKey: keys.list('resources', 'review-queue'),
    queryFn: async (): Promise<Resource[]> => {
      const { data, error } = await (supabase as any)
        .from('resources')
        .select('*, author:profiles(*)')
        .eq('approval_status', 'pending')
        .order('submitted_at', { ascending: true, nullsFirst: false })

      if (error) throw error
      return (data as any[]) || []
    },
  })

  return { submissions: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

/**
 * Upload the file, then write the row — and remove the object again if the row
 * does not land.
 *
 * Order matters and it is the same argument entity-uploads.ts makes in reverse:
 * the row is what makes an object reachable, so an orphaned object is a few
 * unreferenced bytes in a private bucket, while a row pointing at a file that
 * failed to upload is a download button that 404s for a reviewer.
 */
export function useSubmitResource() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (input: {
      authorId: string
      title: string
      summary?: string | null
      description?: string
      content?: string
      resource_type: string
      category?: string
      tags?: string[]
      download_url?: string | null
      thumbnail_url?: string | null
      is_climate_action?: boolean
      file?: File | null
    }) => {
      const { authorId, file, ...fields } = input

      let filePath: string | null = null
      if (file) {
        filePath = buildResourceStoragePath({ authorId, fileName: file.name })
        const { error: uploadError } = await supabase.storage
          .from(RESOURCE_FILES_BUCKET)
          .upload(filePath, file, { cacheControl: '3600', upsert: false })
        if (uploadError) throw uploadError
      }

      try {
        const { data, error } = await (supabase as any)
          .from('resources')
          .insert({
            ...fields,
            author_id: authorId,
            // Both are forced by 135's INSERT policy; sending them explicitly
            // means a mistake here fails in review rather than at the database
            // with an opaque RLS message.
            is_published: false,
            approval_status: 'pending',
            file_path: filePath,
            file_name: file?.name ?? null,
            file_size: file?.size ?? null,
            file_mime: file?.type || null,
          })
          .select()
          .single()

        if (error) throw error
        return data
      } catch (err) {
        await removeResourceUploads([filePath])
        throw err
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('resources') })
    },
  })

  return { submitResource: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}

/**
 * Approve or reject, through the RPC rather than an UPDATE.
 *
 * One call keeps approval_status, is_published and the submitter's notification
 * from drifting apart. The RPC answers `{ok: false, reason}` instead of raising
 * — the convention useAdminDashboard.ts already unwraps — so it is turned back
 * into a thrown Error here, where react-query can see it.
 */
export function useReviewResourceSubmission() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (input: {
      resourceId: string
      approve: boolean
      note?: string | null
      publish?: boolean
    }) => {
      const { data, error } = await (supabase as any).rpc('review_resource_submission', {
        p_resource: input.resourceId,
        p_approve: input.approve,
        p_note: input.note ?? null,
        p_publish: input.publish ?? true,
      })

      if (error) throw error
      if (!data?.ok) {
        throw new Error(
          data?.reason === 'forbidden'
            ? 'You do not have permission to review submissions.'
            : data?.reason === 'not_found'
              ? 'That submission no longer exists.'
              : data?.reason === 'already_decided'
                ? 'That submission has already been approved.'
                : 'Could not record the decision.'
        )
      }
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('resources') })
    },
  })

  return { reviewSubmission: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}

/**
 * A signed URL for a member-uploaded file. Null while loading, and null if the
 * signature is refused — the caller renders the download disabled rather than
 * offering a link that will fail.
 */
export function useResourceFileUrl(path: string | null | undefined) {
  const query = useQuery({
    queryKey: keys.sub('resources', 'file-url', path ?? undefined),
    queryFn: () => signResourceFileUrl(path as string),
    enabled: !!path,
    // Signed for an hour; refreshed comfortably inside that.
    staleTime: 45 * 60 * 1000,
  })

  return { url: query.data ?? null, loading: query.isPending }
}

export function useDeleteResource() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (resourceId: string) => {
      const { error } = await (supabase as any)
        .from('resources')
        .delete()
        .eq('id', resourceId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('resources') })
    },
  })

  return { deleteResource: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}
