import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import type { KpiReportRow, ReportPeriodKind } from '../lib/kpi-report-schema'

/**
 * The periodic reports (migration 147) as the console reads and edits them.
 *
 * Reads and edits go straight through the table under RLS: org:manage can see
 * every report and edit a draft. The two things a session cannot do on its
 * own — create a report and publish one — go through api/admin routes, which
 * run the same pipeline the cron does and record who published.
 */

export type KpiReportSummary = Pick<
  KpiReportRow,
  | 'id'
  | 'period_kind'
  | 'period_start'
  | 'period_end'
  | 'status'
  | 'model'
  | 'prompt_version'
  | 'generated_at'
  | 'published_at'
  | 'sent_at'
>

const LIST_COLUMNS =
  'id,period_kind,period_start,period_end,status,model,prompt_version,generated_at,published_at,sent_at'

async function authHeader(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Not signed in')
  return `Bearer ${token}`
}

async function postAdmin<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: await authHeader() },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((json as { error?: string }).error || `Request failed (${res.status})`)
  return json as T
}

export function useKpiReportList() {
  const query = useQuery({
    queryKey: keys.list('kpi-reports'),
    queryFn: async (): Promise<KpiReportSummary[]> => {
      const { data, error } = await (supabase as any)
        .from('kpi_reports')
        .select(LIST_COLUMNS)
        .order('period_start', { ascending: false })
        .limit(60)
      if (error) throw error
      return (data as KpiReportSummary[]) || []
    },
    staleTime: 60 * 1000,
  })
  return { reports: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

export function useKpiReport(id: string | null) {
  const query = useQuery({
    queryKey: keys.detail('kpi-reports', id ?? undefined),
    enabled: Boolean(id),
    queryFn: async (): Promise<KpiReportRow> => {
      const { data, error } = await (supabase as any).from('kpi_reports').select('*').eq('id', id).single()
      if (error) throw error
      return data as KpiReportRow
    },
  })
  return { report: query.data, loading: query.isPending && Boolean(id), error: query.error, refetch: query.refetch }
}

/** The parts an administrator edits before publishing. */
export type KpiReportPatch = Partial<
  Pick<KpiReportRow, 'summary_md' | 'sections' | 'suggested_actions' | 'at_risk' | 'data_quality_notes' | 'highlights'>
>

export function useUpdateKpiReport() {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: KpiReportPatch }) => {
      const { data, error } = await (supabase as any)
        .from('kpi_reports')
        .update(patch)
        .eq('id', id)
        .eq('status', 'draft')
        .select('*')
        .single()
      if (error) throw error
      return data as KpiReportRow
    },
    onSuccess: (row) => {
      queryClient.setQueryData(keys.detail('kpi-reports', row.id), row)
      queryClient.invalidateQueries({ queryKey: keys.all('kpi-reports') })
    },
  })
  return { save: mutation.mutateAsync, saving: mutation.isPending, error: mutation.error }
}

export interface GenerateResult {
  report: KpiReportRow
  model: string | null
  model_error: string | null
  dropped_keys: string[]
}

export function useGenerateKpiReport() {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (input: { kind: ReportPeriodKind; start: string }) =>
      postAdmin<GenerateResult>('/api/admin/report-generate', input),
    onSuccess: (result) => {
      queryClient.setQueryData(keys.detail('kpi-reports', result.report.id), result.report)
      queryClient.invalidateQueries({ queryKey: keys.all('kpi-reports') })
    },
  })
  return { generate: mutation.mutateAsync, generating: mutation.isPending, error: mutation.error }
}

export interface PublishResult {
  report: KpiReportRow
  sent: { sent: boolean; to: string[]; reason?: string } | null
}

export function usePublishKpiReport() {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (input: { id: string; send: boolean }) => postAdmin<PublishResult>('/api/admin/report-publish', input),
    onSuccess: (result) => {
      queryClient.setQueryData(keys.detail('kpi-reports', result.report.id), result.report)
      queryClient.invalidateQueries({ queryKey: keys.all('kpi-reports') })
    },
  })
  return { publish: mutation.mutateAsync, publishing: mutation.isPending, error: mutation.error }
}

export interface ReportRecipient {
  email: string
  label: string | null
  kinds: ReportPeriodKind[]
  created_at: string
}

export function useReportRecipients() {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: keys.list('kpi-report-recipients'),
    queryFn: async (): Promise<ReportRecipient[]> => {
      const { data, error } = await (supabase as any)
        .from('kpi_report_recipients')
        .select('email,label,kinds,created_at')
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data as ReportRecipient[]) || []
    },
    staleTime: 5 * 60 * 1000,
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: keys.all('kpi-report-recipients') })

  const add = useMutation({
    mutationFn: async (input: { email: string; label?: string; kinds: ReportPeriodKind[] }) => {
      const { data: auth } = await supabase.auth.getUser()
      const { error } = await (supabase as any).from('kpi_report_recipients').insert({
        email: input.email.trim().toLowerCase(),
        label: input.label?.trim() || null,
        kinds: input.kinds,
        added_by: auth.user?.id ?? null,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: async (email: string) => {
      const { error } = await (supabase as any).from('kpi_report_recipients').delete().eq('email', email)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return {
    recipients: query.data,
    loading: query.isPending,
    error: query.error,
    add: add.mutateAsync,
    remove: remove.mutateAsync,
    busy: add.isPending || remove.isPending,
  }
}
