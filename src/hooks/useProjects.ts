import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { escapeIlike, sanitizeTag } from '../lib/utils'
import { keys } from '../queries/keys'
import { homepageFirst, rankRows, type ContentSort } from '../lib/personalization'
import { usePersonalizationActive } from './usePersonalization'
import { useAchievementTrigger } from '../contexts/AchievementContext'
import { listEntityUploadPaths, removeEntityUploads } from '../lib/entity-uploads'
import { isUuid } from '../lib/slug'
import { settleEach, splitReturned, type SettleOptions } from '../lib/bulk'
import { i18n } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import type { DetailEntry, Project, ProjectComment } from '../types'
import { PROFILE_CHIP } from '../lib/profile-columns'

export function useProjects(filters?: {
  category?: string
  phase?: string
  search?: string
  /** Matched against the `hashtags` column — projects' tag field. */
  tags?: string[]
  sort?: ContentSort
  /** Homepage only: opted-in and admin-starred projects lead (migration 160). */
  featuredFirst?: boolean
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

  const fetchProjects = async (): Promise<Project[]> => {
    let query = supabase
      .from('projects')
      .select(`
        *,
        owner:profiles!owner_id(${PROFILE_CHIP})
      `)
      .eq('is_public', true)

    // Leading in the candidate set too, so the row cap below can never cut an
    // opted-in project the homepage would have shown first.
    if (filters?.featuredFirst) {
      query = query
        .order('feature_on_homepage', { ascending: false })
        .order('is_featured', { ascending: false })
    }
    query = query.order('created_at', { ascending: false })

    if (filters?.category) {
      query = query.eq('category', filters.category)
    }

    if (filters?.phase) {
      query = query.eq('phase', filters.phase as any)
    }

    // "any of" — AND semantics would empty the list on the second chip click
    if (tags?.length) {
      query = query.overlaps('hashtags', tags)
    }

    if (filters?.search) {
      const sanitized = escapeIlike(filters.search)
      if (sanitized) {
        query = query.or(
          `title.ilike.%${sanitized}%,summary.ilike.%${sanitized}%,description.ilike.%${sanitized}%,tags_text.ilike.%${sanitized}%`
        )
      }
    }

    // Two-stage retrieval: this query generates candidates, the ranker
    // re-orders them. A wider net under "For You" so the ranking has more
    // than one page to choose from.
    query = query.limit(sort === 'for_you' ? 150 : 50)

    const { data, error } = await query

    if (error) throw error
    const rows = (data as any[]) || []

    const ordered = sort === 'for_you' ? await rankRows('project', rows) : rows
    // After the ranker, which reorders everything: it ranks within each half.
    return filters?.featuredFirst ? homepageFirst(ordered) : ordered
  }

  const query = useQuery({
    queryKey: keys.list('projects', normalized),
    queryFn: fetchProjects,
    // The second round trip is only worth paying for once a minute.
    staleTime: sort === 'for_you' ? 60_000 : undefined,
  })

  return {
    projects: query.data,
    loading: query.isPending,
    error: query.error,
    refetch: query.refetch,
  }
}

/** Admin moderation view: all projects (public + private), no cap. */
export function useAdminProjects() {
  const fetchAllProjects = async (): Promise<Project[]> => {
    const { data, error } = await supabase
      .from('projects')
      .select(`
        *,
        owner:profiles!owner_id(${PROFILE_CHIP})
      `)
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data as any[]) || []
  }

  const query = useQuery({
    queryKey: keys.list('admin-projects'),
    queryFn: fetchAllProjects,
  })

  return { projects: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

// useFeaturedProjects() lived here and was imported by nothing. `is_featured`
// now earns its keep as a +15 contribution in the personalization ranker
// (migration 061) rather than as a separate unused query.

/** Accepts either a uuid or a slug — see src/lib/slug.ts. */
export function useProject(id: string | undefined) {
  const fetchProject = async (projectId: string): Promise<Project | null> => {
    const { data, error } = await supabase
      .from('projects')
      .select(`
        *,
        owner:profiles!owner_id(${PROFILE_CHIP})
      `)
      .eq(isUuid(projectId) ? 'id' : 'slug', projectId)
      .single()

    if (error) throw error
    return data as any
  }

  const query = useQuery({
    queryKey: keys.detail('projects', id),
    queryFn: () => fetchProject(id as string),
    enabled: !!id,
  })

  return { project: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

export function useCreateProject() {
  const queryClient = useQueryClient()
  const triggerCheck = useAchievementTrigger()

  const mutation = useMutation({
    mutationFn: async (projectData: {
      title: string
      summary?: string | null
      description?: string
      category?: string
      phase?: string
      hashtags?: string[]
      is_public?: boolean
      feature_on_homepage?: boolean
      details?: DetailEntry[]
      video_url?: string | null
      owner_id: string
    }) => {
      const { data, error } = await supabase
        .from('projects')
        .insert({
          ...projectData,
          phase: (projectData.phase || 'concept') as any,
          is_public: projectData.is_public ?? true,
          hashtags: projectData.hashtags || [],
        } as any)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('projects') })
      queryClient.invalidateQueries({ queryKey: keys.all('dashboard') })
      // Cheap and debounced. Not required for correctness — the achievement
      // engine re-derives everything on its own poll — but it is what makes
      // the unlock appear the moment you finish, rather than a minute later.
      triggerCheck()
    },
  })

  return { createProject: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}

export function useUpdateProject() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async ({
      projectId,
      updates,
    }: {
      projectId: string
      updates: Partial<Project>
    }) => {
      const { data, error } = await supabase
        .from('projects')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', projectId)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('projects') })
      queryClient.invalidateQueries({ queryKey: keys.all('dashboard') })
    },
  })

  const updateProject = (projectId: string, updates: Partial<Project>) =>
    mutation.mutateAsync({ projectId, updates })

  return { updateProject, loading: mutation.isPending, error: mutation.error }
}

export function useDeleteProject() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (projectId: string) => {
      // Enumerate the uploads first — after the row is gone the RPC's ownership
      // check has nothing to check against. See lib/entity-uploads.ts on why
      // the blobs cannot be removed by the migration 077 trigger.
      const uploadPaths = await listEntityUploadPaths('project', projectId)

      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', projectId)

      if (error) throw error

      // The trigger reaped the rows; this clears the objects they pointed at.
      await removeEntityUploads(uploadPaths)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('projects') })
      queryClient.invalidateQueries({ queryKey: keys.all('entity-documents') })
    },
  })

  return { deleteProject: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}

/**
 * The dashboard's bulk delete — useDeleteProject's three steps once per
 * project. See useBulkDeleteEvents for why it is not one `.in()` delete and
 * why the `.select('id')` is there.
 */
export function useBulkDeleteProjects() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: ({ ids, onProgress }: { ids: string[]; onProgress?: SettleOptions['onProgress'] }) =>
      settleEach(
        ids,
        async (projectId) => {
          const uploadPaths = await listEntityUploadPaths('project', projectId)
          const { data, error } = await supabase.from('projects').delete().eq('id', projectId).select('id')
          if (error) throw error
          if (!data?.length) {
            throw new Error(i18n._(msg`Not deleted. It may already be gone, or you no longer own it.`))
          }
          await removeEntityUploads(uploadPaths)
        },
        { onProgress }
      ),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('projects') })
      queryClient.invalidateQueries({ queryKey: keys.all('entity-documents') })
      queryClient.invalidateQueries({ queryKey: keys.sub('profiles', 'projects') })
      queryClient.invalidateQueries({ queryKey: keys.sub('profiles', 'owned-projects') })
      queryClient.invalidateQueries({ queryKey: keys.all('dashboard') })
    },
  })

  const deleteProjects = (ids: string[], onProgress?: SettleOptions['onProgress']) =>
    mutation.mutateAsync({ ids, onProgress })

  return { deleteProjects, loading: mutation.isPending }
}

/**
 * Make several projects public or private. Going private also withdraws the
 * homepage opt-in (160), the same pairing EditProjectPage writes on save, so a
 * project made public again later does not reappear on the homepage unasked.
 */
export function useBulkSetProjectVisibility() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async ({ ids, isPublic }: { ids: string[]; isPublic: boolean }) => {
      const { data, error } = await supabase
        .from('projects')
        .update({
          is_public: isPublic,
          ...(isPublic ? {} : { feature_on_homepage: false }),
          updated_at: new Date().toISOString(),
        } as any)
        .in('id', ids)
        .select('id')
      if (error) throw error
      return splitReturned(ids, data, i18n._(msg`Not changed. You may no longer own it.`))
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('projects') })
      queryClient.invalidateQueries({ queryKey: keys.sub('profiles', 'projects') })
      queryClient.invalidateQueries({ queryKey: keys.sub('profiles', 'owned-projects') })
      queryClient.invalidateQueries({ queryKey: keys.all('dashboard') })
    },
  })

  const setVisibility = (ids: string[], isPublic: boolean) => mutation.mutateAsync({ ids, isPublic })

  return { setVisibility, loading: mutation.isPending }
}

// Like / Unlike hooks
export function useProjectLike(projectId: string | undefined, userId: string | undefined) {
  const queryClient = useQueryClient()

  const checkLike = async (pid: string, uid: string): Promise<boolean> => {
    const { data, error } = await supabase
      .from('project_likes')
      .select('id')
      .eq('project_id', pid)
      .eq('user_id', uid)
      .maybeSingle()
    if (error) throw error
    return !!data
  }

  const getLikeCount = async (pid: string): Promise<number> => {
    const { count, error } = await supabase
      .from('project_likes')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', pid)
    if (error) throw error
    return count || 0
  }

  const likedQuery = useQuery({
    queryKey: keys.sub('projects', 'liked', projectId ? `${projectId}:${userId}` : undefined),
    queryFn: () => checkLike(projectId as string, userId as string),
    enabled: !!projectId && !!userId,
  })

  const countQuery = useQuery({
    queryKey: keys.sub('projects', 'like-count', projectId),
    queryFn: () => getLikeCount(projectId as string),
    enabled: !!projectId,
  })

  const likedKey = keys.sub('projects', 'liked', projectId ? `${projectId}:${userId}` : undefined)
  const countKey = keys.sub('projects', 'like-count', projectId)

  const toggleMutation = useMutation({
    mutationFn: async (nextLiked: boolean) => {
      if (!projectId || !userId) throw new Error('projectId and userId are required')
      if (nextLiked) {
        const { error } = await supabase
          .from('project_likes')
          .insert({ project_id: projectId, user_id: userId })
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('project_likes')
          .delete()
          .eq('project_id', projectId)
          .eq('user_id', userId)
        if (error) throw error
      }
      return nextLiked
    },
    onMutate: async (nextLiked: boolean) => {
      await queryClient.cancelQueries({ queryKey: likedKey })
      await queryClient.cancelQueries({ queryKey: countKey })

      const previousLiked = queryClient.getQueryData<boolean>(likedKey)
      const previousCount = queryClient.getQueryData<number>(countKey)

      queryClient.setQueryData<boolean>(likedKey, nextLiked)
      queryClient.setQueryData<number>(countKey, (old) => {
        const base = old ?? 0
        return nextLiked ? base + 1 : Math.max(0, base - 1)
      })

      return { previousLiked, previousCount }
    },
    onError: (_err, _nextLiked, context) => {
      if (context?.previousLiked !== undefined) {
        queryClient.setQueryData(likedKey, context.previousLiked)
      }
      if (context?.previousCount !== undefined) {
        queryClient.setQueryData(countKey, context.previousCount)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: likedKey })
      queryClient.invalidateQueries({ queryKey: countKey })
    },
  })

  const likeProject = async (pid: string, uid: string) => {
    void pid
    void uid
    await toggleMutation.mutateAsync(true)
  }

  const unlikeProject = async (pid: string, uid: string) => {
    void pid
    void uid
    await toggleMutation.mutateAsync(false)
  }

  return {
    liked: likedQuery.data,
    likeCount: countQuery.data,
    likeProject,
    unlikeProject,
    checkLike,
    getLikeCount,
    loading: toggleMutation.isPending,
    error: toggleMutation.error,
  }
}

// Follow / Unfollow hooks (mirrors the like pattern)
export function useProjectFollow(projectId: string | undefined, userId: string | undefined) {
  const queryClient = useQueryClient()

  const checkFollow = async (pid: string, uid: string): Promise<boolean> => {
    const { data, error } = await (supabase as any)
      .from('project_follows')
      .select('id')
      .eq('project_id', pid)
      .eq('user_id', uid)
      .maybeSingle()
    if (error) throw error
    return !!data
  }

  const getFollowCount = async (pid: string): Promise<number> => {
    const { count, error } = await (supabase as any)
      .from('project_follows')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', pid)
    if (error) throw error
    return count || 0
  }

  const followedKey = keys.sub('projects', 'followed', projectId ? `${projectId}:${userId}` : undefined)
  const countKey = keys.sub('projects', 'follow-count', projectId)

  const followedQuery = useQuery({
    queryKey: followedKey,
    queryFn: () => checkFollow(projectId as string, userId as string),
    enabled: !!projectId && !!userId,
  })

  const countQuery = useQuery({
    queryKey: countKey,
    queryFn: () => getFollowCount(projectId as string),
    enabled: !!projectId,
  })

  const toggleMutation = useMutation({
    mutationFn: async (nextFollowed: boolean) => {
      if (!projectId || !userId) throw new Error('projectId and userId are required')
      if (nextFollowed) {
        const { error } = await (supabase as any)
          .from('project_follows')
          .insert({ project_id: projectId, user_id: userId })
        if (error) throw error
      } else {
        const { error } = await (supabase as any)
          .from('project_follows')
          .delete()
          .eq('project_id', projectId)
          .eq('user_id', userId)
        if (error) throw error
      }
      return nextFollowed
    },
    onMutate: async (nextFollowed: boolean) => {
      await queryClient.cancelQueries({ queryKey: followedKey })
      await queryClient.cancelQueries({ queryKey: countKey })

      const previousFollowed = queryClient.getQueryData<boolean>(followedKey)
      const previousCount = queryClient.getQueryData<number>(countKey)

      queryClient.setQueryData<boolean>(followedKey, nextFollowed)
      queryClient.setQueryData<number>(countKey, (old) => {
        const base = old ?? 0
        return nextFollowed ? base + 1 : Math.max(0, base - 1)
      })

      return { previousFollowed, previousCount }
    },
    onError: (_err, _nextFollowed, context) => {
      if (context?.previousFollowed !== undefined) {
        queryClient.setQueryData(followedKey, context.previousFollowed)
      }
      if (context?.previousCount !== undefined) {
        queryClient.setQueryData(countKey, context.previousCount)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: followedKey })
      queryClient.invalidateQueries({ queryKey: countKey })
    },
  })

  return {
    followed: followedQuery.data,
    followCount: countQuery.data,
    followProject: () => toggleMutation.mutateAsync(true),
    unfollowProject: () => toggleMutation.mutateAsync(false),
    loading: toggleMutation.isPending,
    error: toggleMutation.error,
  }
}

/**
 * Bump the project view counter once per browser session per project.
 * Uses the increment_project_view RPC (SECURITY DEFINER) so viewers
 * don't need UPDATE rights on projects.
 */
export function trackProjectView(projectId: string): void {
  const sessionKey = `ktip_viewed_${projectId}`
  try {
    if (sessionStorage.getItem(sessionKey)) return
    sessionStorage.setItem(sessionKey, '1')
  } catch {
    // sessionStorage unavailable — still count the view
  }
  void (supabase as any)
    .rpc('increment_project_view', { p_project_id: projectId })
    .then(
      () => {},
      () => {}
    )
}

// Comments hooks
export function useProjectComments(projectId: string | undefined) {
  const fetchComments = async (pid: string): Promise<ProjectComment[]> => {
    const { data, error } = await supabase
      .from('project_comments')
      .select(`*, author:profiles!user_id(${PROFILE_CHIP})`)
      .eq('project_id', pid)
      .order('created_at', { ascending: true })
    if (error) throw error
    return (data as any[]) || []
  }

  const query = useQuery({
    queryKey: keys.sub('projects', 'comments', projectId),
    queryFn: () => fetchComments(projectId as string),
    enabled: !!projectId,
  })

  return { comments: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

export function useCreateProjectComment() {
  const queryClient = useQueryClient()
  const triggerCheck = useAchievementTrigger()

  const mutation = useMutation({
    mutationFn: async (data: {
      project_id: string
      user_id: string
      content: string
    }) => {
      const { data: comment, error } = await supabase
        .from('project_comments')
        .insert(data)
        .select(`*, author:profiles!user_id(${PROFILE_CHIP})`)
        .single()
      if (error) throw error
      return comment
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: keys.sub('projects', 'comments', variables.project_id) })
      triggerCheck()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (commentId: string) => {
      const { error } = await supabase
        .from('project_comments')
        .delete()
        .eq('id', commentId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.sub('projects', 'comments') })
    },
  })

  return {
    createComment: mutation.mutateAsync,
    deleteComment: deleteMutation.mutateAsync,
    loading: mutation.isPending || deleteMutation.isPending,
    error: mutation.error || deleteMutation.error,
  }
}
