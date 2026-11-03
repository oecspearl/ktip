/** A team's row on the Quest Board (migration 196). */
export interface LeaderRow {
  team_id: string
  team_name: string
  quest_points: number
  milestone_points: number
  total: number
}

/** Rank teams by total points, ties broken by name so the order never jumps. */
export function rankLeaderboard(rows: Omit<LeaderRow, 'total'>[]): LeaderRow[] {
  return rows
    .map((r) => ({ ...r, total: (Number(r.quest_points) || 0) + (Number(r.milestone_points) || 0) }))
    .sort((a, b) => b.total - a.total || a.team_name.localeCompare(b.team_name))
}
