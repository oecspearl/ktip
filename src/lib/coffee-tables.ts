/**
 * Coffee tables (migration 200): ten minutes of video with three or four people
 * from other teams. Never one-to-one, every table listed for the whole room,
 * and organisers may drop in. The server decides everything; this file only
 * reads its answer.
 */

export interface CoffeePerson {
  user_id: string
  name: string | null
  avatar_url: string | null
  team: string | null
}

export interface CoffeeTable {
  id: string
  ends_at: string
  people: CoffeePerson[]
}

export interface CoffeeState {
  canJoin: boolean
  isHost: boolean
  waiting: number
  inQueue: boolean
  myTableId: string | null
  tables: CoffeeTable[]
}

export const EMPTY_COFFEE: CoffeeState = {
  canJoin: false,
  isHost: false,
  waiting: 0,
  inQueue: false,
  myTableId: null,
  tables: [],
}

function asPeople(raw: unknown): CoffeePerson[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object' && typeof (p as any).user_id === 'string')
    .map((p) => ({
      user_id: p.user_id as string,
      name: typeof p.name === 'string' ? p.name : null,
      avatar_url: typeof p.avatar_url === 'string' ? p.avatar_url : null,
      team: typeof p.team === 'string' ? p.team : null,
    }))
}

/** coffee_state() as the panel needs it. Anything malformed reads as empty. */
export function parseCoffeeState(raw: unknown): CoffeeState {
  if (!raw || typeof raw !== 'object') return EMPTY_COFFEE
  const r = raw as Record<string, unknown>
  const tables = Array.isArray(r.tables)
    ? r.tables
        .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object' && typeof (t as any).id === 'string')
        .map((t) => ({
          id: t.id as string,
          ends_at: typeof t.ends_at === 'string' ? t.ends_at : '',
          people: asPeople(t.people),
        }))
    : []
  return {
    canJoin: r.can_join === true,
    isHost: r.is_host === true,
    waiting: Math.max(0, Math.trunc(Number(r.waiting) || 0)),
    inQueue: r.in_queue === true,
    myTableId: typeof r.my_table === 'string' ? r.my_table : null,
    tables,
  }
}

/** Whole minutes left at a table, rounded up; 0 once it has ended. */
export function minutesLeft(endsAt: string, now: number): number {
  const end = Date.parse(endsAt)
  if (!Number.isFinite(end) || end <= now) return 0
  return Math.ceil((end - now) / 60_000)
}
