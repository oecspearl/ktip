import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'

/**
 * The 3-year legal archive (migration 187), for /admin/legal-archive.
 *
 * Read-only apart from the legal hold. RLS limits every read to audit:view
 * holders, so a member who reaches these queries gets an empty list, not an
 * error.
 */

const DOMAIN = 'legal-archive'

/** Rows shown per search. The export has its own, higher cap. */
export const LEGAL_ARCHIVE_PAGE = 200
export const LEGAL_ARCHIVE_EXPORT_CAP = 5000

export interface LegalArchiveRow {
  id: string
  entity_type: string
  entity_id: string
  owner_id: string | null
  storage_paths: { bucket: string; path: string }[]
  deleted_at: string
  deleted_by: string | null
  reason: string | null
  legal_hold: boolean
  hold_reason: string | null
  hold_changed_by: string | null
  hold_changed_at: string | null
  purge_after: string
}

export interface LegalArchiveFullRow extends LegalArchiveRow {
  snapshot: Record<string, unknown>
}

export interface LegalArchiveFilters {
  entityType?: string
  entityId?: string
  ownerId?: string
  /** yyyy-mm-dd, inclusive, local time. */
  from?: string
  /** yyyy-mm-dd, inclusive, local time. */
  to?: string
  heldOnly?: boolean
}

const LIST_COLUMNS =
  'id, entity_type, entity_id, owner_id, storage_paths, deleted_at, deleted_by, reason, legal_hold, hold_reason, hold_changed_by, hold_changed_at, purge_after'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** PostgREST rejects a malformed uuid filter with a 400, so the page checks first. */
export function isUuid(value: string): boolean {
  return UUID.test(value.trim())
}

function startOfDay(day: string): string | null {
  const d = new Date(`${day}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function startOfNextDay(day: string): string | null {
  const d = new Date(`${day}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  d.setDate(d.getDate() + 1)
  return d.toISOString()
}

function applyFilters(request: any, filters: LegalArchiveFilters) {
  let q = request
  if (filters.entityType) q = q.eq('entity_type', filters.entityType)
  if (filters.entityId?.trim()) q = q.eq('entity_id', filters.entityId.trim())
  if (filters.ownerId && isUuid(filters.ownerId)) q = q.eq('owner_id', filters.ownerId.trim())
  const from = filters.from ? startOfDay(filters.from) : null
  if (from) q = q.gte('deleted_at', from)
  const to = filters.to ? startOfNextDay(filters.to) : null
  if (to) q = q.lt('deleted_at', to)
  if (filters.heldOnly) q = q.eq('legal_hold', true)
  return q.order('deleted_at', { ascending: false })
}

export function useLegalArchive(filters: LegalArchiveFilters) {
  const query = useQuery({
    queryKey: keys.list(DOMAIN, filters),
    queryFn: async (): Promise<LegalArchiveRow[]> => {
      const { data, error } = await applyFilters(
        (supabase as any).from('legal_archive').select(LIST_COLUMNS),
        filters
      ).limit(LEGAL_ARCHIVE_PAGE)
      if (error) throw error
      return (data as LegalArchiveRow[]) || []
    },
  })

  return { rows: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

/** One row with its snapshot, fetched when the viewer opens it. */
export function useLegalArchiveEntry(id: string | null) {
  const query = useQuery({
    queryKey: keys.detail(DOMAIN, id ?? undefined),
    enabled: !!id,
    queryFn: async (): Promise<LegalArchiveFullRow | null> => {
      const { data, error } = await (supabase as any)
        .from('legal_archive')
        .select('*')
        .eq('id', id)
        .maybeSingle()
      if (error) throw error
      return (data as LegalArchiveFullRow) ?? null
    },
  })

  return { entry: query.data, loading: query.isPending && !!id, error: query.error }
}

/** Every matching row with its snapshot, for the JSON download. */
export async function fetchLegalArchiveExport(
  filters: LegalArchiveFilters
): Promise<LegalArchiveFullRow[]> {
  const { data, error } = await applyFilters(
    (supabase as any).from('legal_archive').select('*'),
    filters
  ).limit(LEGAL_ARCHIVE_EXPORT_CAP)
  if (error) throw error
  return (data as LegalArchiveFullRow[]) || []
}

export function useSetLegalHold() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (params: { id: string; hold: boolean; reason?: string }) => {
      const { error } = await (supabase as any).rpc('set_legal_hold', {
        p_id: params.id,
        p_hold: params.hold,
        p_reason: params.reason?.trim() || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all(DOMAIN) })
    },
  })

  return { setLegalHold: mutation.mutateAsync, loading: mutation.isPending }
}
