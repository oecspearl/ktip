import { describe, expect, it } from 'vitest'
import { i18n } from '@lingui/core'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ENTREPRENEUR_STAGES, ENTREPRENEUR_STAGE_VALUES } from './constants'
import {
  entrepreneurStageDescription,
  entrepreneurStageLabel,
  isEntrepreneurStage,
  roleLabelWithStage,
} from './entrepreneur-stage'
import { signupSchema, signupStep1Schema, profileUpdateSchema } from './validation'

const base = {
  email: 'user@example.com',
  password: 'Password123!',
  confirm_password: 'Password123!',
  date_of_birth: '1995-06-15',
}

describe('entrepreneur stages', () => {
  it('lists the four stages in journey order', () => {
    expect(ENTREPRENEUR_STAGE_VALUES).toEqual(['aspiring', 'startup', 'export_ready', 'exporter'])
  })

  // The CHECK in 201 and the client list must never drift: a value the client
  // offers and the database refuses would fail every save that sends it.
  it('matches the CHECK list in migration 201', () => {
    const sql = readFileSync(
      resolve(__dirname, '../../supabase/migrations/201_entrepreneur_stage.sql'),
      'utf8',
    )
    const check = sql.match(/entrepreneur_stage IN \(([^)]*)\)/)
    expect(check).not.toBeNull()
    const values = [...check![1].matchAll(/'([^']+)'/g)].map((m) => m[1])
    expect(values).toEqual([...ENTREPRENEUR_STAGE_VALUES])
  })

  it('has a label and a definition for every stage', () => {
    for (const stage of ENTREPRENEUR_STAGES) {
      expect(entrepreneurStageLabel(i18n, stage.value)).toBeTruthy()
      expect(entrepreneurStageDescription(i18n, stage.value)).toBeTruthy()
    }
  })

  it('recognises only the four values', () => {
    expect(isEntrepreneurStage('export_ready')).toBe(true)
    expect(isEntrepreneurStage('tycoon')).toBe(false)
    expect(isEntrepreneurStage(null)).toBe(false)
    expect(entrepreneurStageLabel(i18n, 'tycoon')).toBeNull()
    expect(entrepreneurStageLabel(i18n, null)).toBeNull()
  })

  it('puts the stage after the entrepreneur role only', () => {
    expect(roleLabelWithStage(i18n, 'entrepreneur', 'export_ready')).toBe('Entrepreneur · Export-Ready')
    expect(roleLabelWithStage(i18n, 'entrepreneur', null)).toBe('Entrepreneur')
    expect(roleLabelWithStage(i18n, 'mentor', 'export_ready')).not.toContain('Export-Ready')
  })
})

describe('signup asks entrepreneurs their stage', () => {
  it('refuses an entrepreneur with no stage, on the stage field', () => {
    for (const schema of [signupSchema, signupStep1Schema]) {
      const result = schema.safeParse({ ...base, role: 'entrepreneur' })
      expect(result.success).toBe(false)
      expect(result.error?.issues.map((i) => i.path[0])).toContain('entrepreneur_stage')
    }
  })

  it('accepts an entrepreneur with a stage', () => {
    for (const schema of [signupSchema, signupStep1Schema]) {
      expect(schema.safeParse({ ...base, role: 'entrepreneur', entrepreneur_stage: 'startup' }).success).toBe(true)
    }
  })

  it('does not ask any other role', () => {
    expect(signupStep1Schema.safeParse({ ...base, role: 'mentor' }).success).toBe(true)
  })

  it('refuses a value outside the list', () => {
    const result = signupSchema.safeParse({ ...base, role: 'entrepreneur', entrepreneur_stage: 'tycoon' })
    expect(result.success).toBe(false)
  })

  it('validates the stage on a profile edit too', () => {
    expect(profileUpdateSchema.safeParse({ entrepreneur_stage: 'exporter' }).success).toBe(true)
    expect(profileUpdateSchema.safeParse({ entrepreneur_stage: 'tycoon' }).success).toBe(false)
  })
})
