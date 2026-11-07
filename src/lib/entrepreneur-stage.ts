import type { I18n } from '@lingui/core'
import { ENTREPRENEUR_STAGES, ROLE_LABELS, USER_ROLES, type EntrepreneurStage } from './constants'
import { resolveCopy } from '../i18n/copy'

const BY_VALUE = new Map<string, (typeof ENTREPRENEUR_STAGES)[number]>(
  ENTREPRENEUR_STAGES.map((s) => [s.value, s])
)

export function isEntrepreneurStage(value: unknown): value is EntrepreneurStage {
  return typeof value === 'string' && BY_VALUE.has(value)
}

/** The stage's label in the active language, or null for no or unknown stage. */
export function entrepreneurStageLabel(i18n: I18n, stage: string | null | undefined): string | null {
  const entry = stage ? BY_VALUE.get(stage) : undefined
  return entry ? resolveCopy(i18n, entry.label) : null
}

/** The stage's definition in the active language, or null. */
export function entrepreneurStageDescription(i18n: I18n, stage: string | null | undefined): string | null {
  const entry = stage ? BY_VALUE.get(stage) : undefined
  return entry ? resolveCopy(i18n, entry.description) : null
}

/**
 * A role's label, with the stage after it for the entrepreneur role:
 * "Entrepreneur · Export-Ready". Every other role, and an entrepreneur with no
 * stage yet, reads exactly as before.
 */
export function roleLabelWithStage(
  i18n: I18n,
  role: string,
  stage: string | null | undefined,
): string {
  const label = resolveCopy(i18n, ROLE_LABELS[role] ?? role)
  if (role !== USER_ROLES.ENTREPRENEUR) return label
  const stageLabel = entrepreneurStageLabel(i18n, stage)
  return stageLabel ? `${label} · ${stageLabel}` : label
}
