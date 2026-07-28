import {
  differenceInCalendarDays,
  eachMonthOfInterval,
  endOfMonth,
  max as maxDate,
  min as minDate,
  startOfMonth,
  subMonths,
} from 'date-fns'
import type {
  GrantApplication,
  GrantApplicationEvent,
  Project,
  ProjectPhase,
  ProjectPhaseEvent,
} from '../types'
import { PHASE_LABELS } from './constants'

export interface TimelineStage {
  key: string
  label: string
  reachedAt: string | null
}

export interface TimelineItem {
  id: string
  kind: 'grant_application' | 'project'
  title: string
  href: string
  startAt: string
  endAt: string | null
  currentKey: string
  currentIndex: number
  isTerminal: boolean
  isRejected: boolean
  stages: TimelineStage[]
}

type AppWithEvents = GrantApplication & { events?: GrantApplicationEvent[] }
type ProjectWithEvents = Project & { events?: ProjectPhaseEvent[] }

function sortEvents<T extends { created_at: string }>(events: T[] | undefined): T[] {
  return [...(events ?? [])].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )
}

function firstEventAt(
  events: { created_at: string }[],
  match: (e: any) => boolean
): string | null {
  const hit = events.find(match)
  return hit ? hit.created_at : null
}

export function buildGrantAppItem(app: AppWithEvents): TimelineItem {
  const events = sortEvents(app.events)
  const decided = app.status === 'approved' || app.status === 'rejected'
  const isRejected = app.status === 'rejected'

  const stages: TimelineStage[] = []
  const hasDraft = app.status === 'draft' || events.some((e) => e.status === 'draft')
  if (hasDraft) {
    stages.push({
      key: 'draft',
      label: 'Draft',
      reachedAt: firstEventAt(events, (e) => e.status === 'draft') ?? app.created_at,
    })
  }
  stages.push({
    key: 'pending',
    label: 'Applied',
    reachedAt:
      firstEventAt(events, (e) => e.status === 'pending') ??
      (hasDraft ? null : app.created_at),
  })
  stages.push({
    key: 'under_review',
    label: 'Under Review',
    reachedAt: firstEventAt(events, (e) => e.status === 'under_review'),
  })
  stages.push({
    key: 'decision',
    label: decided ? (isRejected ? 'Rejected' : 'Approved') : 'Decision',
    reachedAt: decided
      ? (firstEventAt(events, (e) => e.status === app.status) ?? app.updated_at)
      : null,
  })

  const currentIndex = decided
    ? stages.length - 1
    : Math.max(
        0,
        stages.findIndex((s) => s.key === app.status)
      )

  const startAt = events[0]?.created_at ?? app.created_at
  const endAt = decided ? (stages[stages.length - 1].reachedAt ?? app.updated_at) : null

  return {
    id: `app-${app.id}`,
    kind: 'grant_application',
    title: app.grant?.title ?? 'Grant Application',
    href: `/grants/${app.grant_id}`,
    startAt,
    endAt,
    currentKey: app.status,
    currentIndex,
    isTerminal: decided,
    isRejected,
    stages,
  }
}

const PHASE_ORDER: ProjectPhase[] = ['concept', 'prototype', 'funding', 'launch']

export function buildProjectItem(project: ProjectWithEvents): TimelineItem {
  const events = sortEvents(project.events)
  const currentIndex = Math.max(0, PHASE_ORDER.indexOf(project.phase))
  const isLaunched = project.phase === 'launch'

  const stages: TimelineStage[] = PHASE_ORDER.map((phase, i) => ({
    key: phase,
    label: PHASE_LABELS[phase] ?? phase,
    reachedAt:
      i <= currentIndex
        ? (firstEventAt(events, (e) => e.phase === phase) ??
          (phase === 'concept' ? project.created_at : null))
        : null,
  }))

  const startAt = events[0]?.created_at ?? project.created_at
  const endAt = isLaunched
    ? (stages[stages.length - 1].reachedAt ?? project.updated_at)
    : null

  return {
    id: `project-${project.id}`,
    kind: 'project',
    title: project.title,
    href: `/projects/${project.id}`,
    startAt,
    endAt,
    currentKey: project.phase,
    currentIndex,
    isTerminal: isLaunched,
    isRejected: false,
    stages,
  }
}

export function buildTimelineItems(
  apps: AppWithEvents[],
  projects: ProjectWithEvents[]
): TimelineItem[] {
  return [...apps.map(buildGrantAppItem), ...projects.map(buildProjectItem)].sort(
    (a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime()
  )
}

export interface MonthRange {
  months: Date[]
  rangeStart: Date
  rangeEnd: Date
}

export function computeMonthRange(items: TimelineItem[], today: Date = new Date()): MonthRange {
  const starts = items.map((i) => new Date(i.startAt))
  const ends = items.map((i) => (i.endAt ? new Date(i.endAt) : today))

  let rangeStart = startOfMonth(starts.length ? minDate(starts) : today)
  const earliestAllowed = startOfMonth(subMonths(today, 12))
  if (rangeStart < earliestAllowed) rangeStart = earliestAllowed

  let rangeEnd = endOfMonth(maxDate([...ends, today]))

  // Guarantee at least 3 months so sparse data still reads as a timeline
  if (eachMonthOfInterval({ start: rangeStart, end: rangeEnd }).length < 3) {
    rangeStart = startOfMonth(subMonths(rangeEnd, 2))
  }

  return {
    months: eachMonthOfInterval({ start: rangeStart, end: rangeEnd }),
    rangeStart,
    rangeEnd,
  }
}

export interface BarPosition {
  leftPct: number
  widthPct: number
}

const MIN_WIDTH_PCT = 1.5

export function positionFor(
  item: TimelineItem,
  rangeStart: Date,
  rangeEnd: Date,
  today: Date = new Date()
): BarPosition {
  const totalDays = Math.max(1, differenceInCalendarDays(rangeEnd, rangeStart))
  const start = maxDate([new Date(item.startAt), rangeStart])
  const end = minDate([item.endAt ? new Date(item.endAt) : today, rangeEnd])

  const leftPct = Math.min(
    100 - MIN_WIDTH_PCT,
    Math.max(0, (differenceInCalendarDays(start, rangeStart) / totalDays) * 100)
  )
  const rawWidth = (Math.max(0, differenceInCalendarDays(end, start)) / totalDays) * 100
  const widthPct = Math.min(100 - leftPct, Math.max(MIN_WIDTH_PCT, rawWidth))

  return { leftPct, widthPct }
}

export function positionForDate(
  date: Date,
  rangeStart: Date,
  rangeEnd: Date
): number {
  const totalDays = Math.max(1, differenceInCalendarDays(rangeEnd, rangeStart))
  return Math.min(100, Math.max(0, (differenceInCalendarDays(date, rangeStart) / totalDays) * 100))
}
