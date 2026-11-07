/**
 * The free tiers the venue runs on, and how close each one is to its cap.
 *
 * The organisation uses free plans first and pays only when it has to. The
 * Organiser Ops panel reads this module to draw one meter per tier, fed by the
 * usage ledger (migration 193). Everything here is pure; the numbers below are
 * the published free allowances as of November 2026.
 *
 * OVERRIDING A LIMIT
 * ------------------
 * Plans change, and a paid upgrade raises a cap. Each tier names a Vite env
 * variable (`envKey`). Set it to a positive number in Vercel and the meter uses
 * that instead, with no code change. Anything else (unset, zero, text) keeps
 * the default.
 *
 * OpenRouter has no meter: it is billed per use with no free cap. When
 * TRANSLATION_PROVIDER is openrouter, the translator meter shows characters
 * that are being paid for rather than spent from Azure's allowance.
 */

import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'

export type FreeTierId =
  | 'livekit_concurrent'
  | 'livekit_minutes'
  | 'translator_chars'
  | 'speech_translation_seconds'
  | 'tts_chars'

export type FreeTierUnit = 'people' | 'chars' | 'seconds'

export interface FreeTier {
  id: FreeTierId
  /** Plan name, shown under the meter. Not translated: it is a product name. */
  plan: string
  label: MessageDescriptor
  note: MessageDescriptor
  limit: number
  unit: FreeTierUnit
  /** 'concurrent' is a ceiling at any moment; 'month' resets on the 1st (UTC). */
  period: 'concurrent' | 'month'
  envKey: string
}

export const FREE_TIERS: readonly FreeTier[] = [
  {
    id: 'livekit_concurrent',
    plan: 'LiveKit Cloud Build',
    label: msg`People in calls now`,
    note: msg`The Build plan allows 100 people in calls at the same time, across every room. It also caps video sent out at 50 GB a month, which only the LiveKit dashboard can show.`,
    limit: 100,
    unit: 'people',
    period: 'concurrent',
    envKey: 'VITE_FREE_TIER_LIVEKIT_CONCURRENT',
  },
  {
    // Every call shares this: venue rooms, coffee tables and the calls started
    // from /collaborate/video (202). One person for one minute is one minute.
    id: 'livekit_minutes',
    plan: 'LiveKit Cloud Build',
    label: msg`Call time this month`,
    note: msg`The Build plan includes 5,000 participant minutes a month. Ten people on a call for an hour use 600.`,
    limit: 5_000 * 60,
    unit: 'seconds',
    period: 'month',
    envKey: 'VITE_FREE_TIER_LIVEKIT_SECONDS',
  },
  {
    id: 'translator_chars',
    plan: 'Azure Translator F0',
    label: msg`Translated characters this month`,
    note: msg`Counts every translation on the site. Only cache misses use the allowance.`,
    limit: 2_000_000,
    unit: 'chars',
    period: 'month',
    envKey: 'VITE_FREE_TIER_TRANSLATOR_CHARS',
  },
  {
    id: 'speech_translation_seconds',
    plan: 'Azure Speech F0',
    label: msg`Speech translation this month`,
    note: msg`Five audio hours a month. Captions use the browser's own speech service for now, so this stays at zero.`,
    limit: 5 * 60 * 60,
    unit: 'seconds',
    period: 'month',
    envKey: 'VITE_FREE_TIER_SPEECH_SECONDS',
  },
  {
    id: 'tts_chars',
    plan: 'Azure Speech F0',
    label: msg`Neural voice characters this month`,
    note: msg`Half a million characters a month. Nothing reads aloud through Azure yet.`,
    limit: 500_000,
    unit: 'chars',
    period: 'month',
    envKey: 'VITE_FREE_TIER_TTS_CHARS',
  },
]

/** At or above this share of the cap a meter turns amber. */
export const WARN_AT = 0.7

export type MeterStatus = 'ok' | 'warn' | 'over'

/**
 * The tiers with any env overrides applied. `env` is injectable for tests;
 * in the app it is Vite's import.meta.env.
 */
export function resolveFreeTiers(
  env: Record<string, unknown> = import.meta.env as Record<string, unknown>
): FreeTier[] {
  return FREE_TIERS.map((tier) => {
    const raw = env[tier.envKey]
    const override = typeof raw === 'string' || typeof raw === 'number' ? Number(raw) : NaN
    return Number.isFinite(override) && override > 0 ? { ...tier, limit: override } : { ...tier }
  })
}

/** Share of the cap used, as a percentage. Not clamped: 130 means 30% over. */
export function percentUsed(used: number, limit: number): number {
  if (!Number.isFinite(used) || used <= 0) return 0
  if (!Number.isFinite(limit) || limit <= 0) return 0
  return (used / limit) * 100
}

/** ok below 70%, warn from 70%, over once the cap is reached. */
export function meterStatus(used: number, limit: number): MeterStatus {
  const percent = percentUsed(used, limit)
  if (percent >= 100) return 'over'
  if (percent >= WARN_AT * 100) return 'warn'
  return 'ok'
}

export interface MeterReading {
  tier: FreeTier
  used: number
  percent: number
  status: MeterStatus
}

export function readMeter(tier: FreeTier, used: number | null | undefined): MeterReading {
  const value = typeof used === 'number' && Number.isFinite(used) && used > 0 ? used : 0
  return {
    tier,
    used: value,
    percent: percentUsed(value, tier.limit),
    status: meterStatus(value, tier.limit),
  }
}

/** What venue_usage_meters() returns (migration 193). */
export interface UsageMeters {
  month_start: string
  kinds: Record<string, { all_events: number | null; this_event: number | null }>
  site_translate_chars: number | null
  team_file_bytes: number
  calls_now: number
}

function kindTotal(meters: UsageMeters, kind: string): number {
  return Number(meters.kinds?.[kind]?.all_events ?? 0) || 0
}

/**
 * How much of each tier is used, from the meters RPC.
 *
 * The translator reads the site-wide ledger (097) when it is there, because
 * the allowance is spent by every page on the site, not only by the venue.
 * Without it, the venue's own chat and caption characters are the floor.
 */
export function usageForTier(id: FreeTierId, meters: UsageMeters): number {
  switch (id) {
    case 'livekit_concurrent':
      return Number(meters.calls_now) || 0
    case 'livekit_minutes':
      return kindTotal(meters, 'call_seconds')
    case 'translator_chars': {
      const venue = kindTotal(meters, 'translate_chars') + kindTotal(meters, 'caption_chars')
      const site = Number(meters.site_translate_chars)
      return Number.isFinite(site) && site > venue ? site : venue
    }
    case 'speech_translation_seconds':
      return kindTotal(meters, 'speech_seconds')
    case 'tts_chars':
      return kindTotal(meters, 'tts_chars')
  }
}
