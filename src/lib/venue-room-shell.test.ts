import { describe, expect, it } from 'vitest'
import { planRoomShell } from './venue-room-shell'
import type { RoomSectionId } from './venue-room-sections'

const all = (plan: ReturnType<typeof planRoomShell>) => [
  ...plan.band,
  ...(plan.call ? [plan.call] : []),
  ...(plan.tool ? [plan.tool] : []),
  ...plan.shelf,
  ...plan.dock,
]

describe('planRoomShell', () => {
  it('puts chat in the dock in every kind of room', () => {
    for (const kind of ['main_hall', 'networking', 'help_desk', 'team', 'breakout'] as const) {
      const plan = planRoomShell(kind, ['av_placeholder', 'chat', 'occupants'])
      expect(plan.dock[0], kind).toBe('chat')
      expect(plan.shelf, kind).not.toContain('chat')
    }
  })

  it('gives a Homebase its workspace as the tool', () => {
    const plan = planRoomShell('team', ['host_controls', 'av_placeholder', 'team_workspace', 'chat', 'occupants', 'objectives'])
    expect(plan).toEqual({
      band: ['host_controls'],
      call: 'av_placeholder',
      tool: 'team_workspace',
      shelf: ['objectives'],
      dock: ['chat', 'occupants'],
    })
  })

  it('adds one room tab: mentors at the help desk, judges in judging', () => {
    expect(planRoomShell('help_desk', ['chat', 'occupants', 'mentors_on_duty', 'faq']).dock).toEqual([
      'chat',
      'mentors_on_duty',
      'occupants',
    ])
    expect(planRoomShell('judging', ['av_placeholder', 'judges_present', 'judging_console']).dock).toEqual(['judges_present'])
  })

  it('places every visible section exactly once', () => {
    const visible: RoomSectionId[] = [
      'sponsor_hero',
      'host_controls',
      'av_placeholder',
      'reactions',
      'chat',
      'challenge_brief',
      'hand_queue',
      'occupants',
      'countdown',
      'announcements',
    ]
    const placed = all(planRoomShell('main_hall', visible))
    expect([...placed].sort()).toEqual([...visible].sort())
  })

  it('leaves the tool empty when nothing fits, and has no dock without chat or people', () => {
    const plan = planRoomShell('breakout', ['focus_timer'])
    expect(plan.tool).toBe('focus_timer')
    expect(planRoomShell('breakout', ['rules']).tool).toBeNull()
    expect(planRoomShell('breakout', ['rules']).dock).toEqual([])
  })
})
