/**
 * Central query-key factory. Convention:
 *   [domain, 'list', filters?]  — collections
 *   [domain, 'detail', id]      — single records
 *   [domain, sub, id?]          — sub-resources (comments, likes, schedule, …)
 *   [domain]                    — invalidation root for a whole domain
 */
export const keys = {
  all: (domain: string) => [domain] as const,
  list: (domain: string, filters?: unknown) =>
    filters === undefined ? ([domain, 'list'] as const) : ([domain, 'list', filters] as const),
  detail: (domain: string, id: string | number | undefined) => [domain, 'detail', id] as const,
  sub: (domain: string, sub: string, id?: string | number) =>
    id === undefined ? ([domain, sub] as const) : ([domain, sub, id] as const),
}
