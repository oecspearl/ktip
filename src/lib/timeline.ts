import type {
  GrantApplication,
  GrantApplicationEvent,
  Project,
  ProjectPhase,
  ProjectPhaseEvent,
} from '../types'
import { PHASE_LABELS } from './constants'
import { entityPath } from './slug'
import { msg } from '@lingui/core/macro'
import type { Copy } from '../i18n/copy'

export interface TimelineStage {
  key: string
  /** A mix: our own stages arrive as `msg` descriptors, PHASE_LABELS (from
   *  lib/constants, harvested) arrives as plain source strings. Both resolve
   *  through resolveCopy(i18n, …) at the render site. */
  label: Copy
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
      label: msg`Draft`,
      reachedAt: firstEventAt(events, (e) => e.status === 'draft') ?? app.created_at,
    })
  }
  stages.push({
    key: 'pending',
    label: msg`Applied`,
    reachedAt:
      firstEventAt(events, (e) => e.status === 'pending') ??
      (hasDraft ? null : app.created_at),
  })
  stages.push({
    key: 'under_review',
    label: msg`Under Review`,
    reachedAt: firstEventAt(events, (e) => e.status === 'under_review'),
  })
  stages.push({
    key: 'decision',
    label: decided ? (isRejected ? msg`Not accepted` : msg`Approved`) : msg`Decision`,
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
    href: `/grants/${app.grant?.slug || app.grant_id}`,
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
    href: entityPath('project', project),
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
