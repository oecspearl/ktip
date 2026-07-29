import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import type { BadgeDefinition, BadgeTier } from '../types'

/**
 * Admin writes for badge definitions and trophy artwork.
 *
 * Both go through SECURITY DEFINER RPCs that check has_permission('org:manage')
 * rather than writing the tables directly — badges and trophy_assets have no
 * client INSERT/UPDATE policy, deliberately, so that the only way anything is
 * awarded or defined is through code the server controls.
 */

export type BadgeDraft = Omit<BadgeDefinition, 'id' | 'created_at' | 'points'>

export function useAdminBadgeMutations() {
  const queryClient = useQueryClient()

  const upsertBadge = useMutation({
    mutationFn: async (draft: BadgeDraft) => {
      // points is intentionally absent: rarity_points(rarity) derives it
      // server-side so the rarity/points relationship cannot drift.
      const { data, error } = await (supabase as any).rpc('admin_upsert_badge', {
        p_slug: draft.slug,
        p_name: draft.name,
        p_description: draft.description,
        p_icon: draft.icon || 'award',
        p_color: draft.color || 'ocean',
        p_category: draft.category || 'community',
        p_rarity: draft.rarity || 'common',
        p_tier: draft.tier ?? null,
        p_tier_group: draft.tier_group ?? null,
        p_check_key: draft.check_key ?? null,
        p_check_value: draft.check_value ?? null,
        p_is_hidden: draft.is_hidden ?? false,
        p_sort_order: draft.sort_order ?? 0,
        p_trophy_type: draft.trophy_type ?? null,
        p_image_url: draft.image_url ?? null,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('badges') })
      // Definitions changed, so every member's progress and totals may have.
      queryClient.invalidateQueries({ queryKey: keys.all('achievements') })
    },
  })

  const upsertTrophyAsset = useMutation({
    mutationFn: async (params: {
      type: string
      tier: BadgeTier
      imageUrl: string | null
      altText: string
    }) => {
      const { data, error } = await (supabase as any).rpc('admin_upsert_trophy_asset', {
        p_type: params.type,
        p_tier: params.tier,
        p_image_url: params.imageUrl,
        p_alt_text: params.altText,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.list('trophy_assets') })
    },
  })

  return { upsertBadge, upsertTrophyAsset }
}
