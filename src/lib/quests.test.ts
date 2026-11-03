import { describe, expect, it } from 'vitest'
import { rankLeaderboard } from './quests'

describe('rankLeaderboard', () => {
  it('adds quest and milestone points and ranks by the total', () => {
    const out = rankLeaderboard([
      { team_id: 'a', team_name: 'Alpha', quest_points: 20, milestone_points: 10 },
      { team_id: 'b', team_name: 'Breadfruit', quest_points: 50, milestone_points: 0 },
    ])
    expect(out.map((r) => [r.team_id, r.total])).toEqual([
      ['b', 50],
      ['a', 30],
    ])
  })

  it('breaks ties by name so the order is stable', () => {
    const out = rankLeaderboard([
      { team_id: 'z', team_name: 'Zebra', quest_points: 10, milestone_points: 0 },
      { team_id: 'a', team_name: 'Alpha', quest_points: 0, milestone_points: 10 },
    ])
    expect(out.map((r) => r.team_id)).toEqual(['a', 'z'])
  })

  it('treats missing points as zero', () => {
    const out = rankLeaderboard([{ team_id: 'a', team_name: 'Alpha', quest_points: null as any, milestone_points: 5 }])
    expect(out[0].total).toBe(5)
  })
})
