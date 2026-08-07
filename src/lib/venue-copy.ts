/**
 * The venue engine is one system with two front doors — a hackathon and a
 * conference run on the same rooms, presence and video. The handful of strings
 * that name the occasion ("the rooms your hackathon needs") live here, keyed by
 * event type, so the pages stay type-agnostic and the copy does not.
 *
 * Hackathon wording is the default: it is what every other venued type
 * (workshop, meetup with the venue toggled on) has always seen, and only
 * `conference` overrides it. All strings are static `msg` macros so Lingui can
 * extract them.
 */
import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'
import type { EventType } from '../types'

export type VenueCopyKey =
  /** PageHero subtitle on the venue setup page. */
  | 'setupSubtitle'
  /** The button from venue setup to the shared step-two page. */
  | 'continueLabel'

const DEFAULT_COPY: Record<VenueCopyKey, MessageDescriptor> = {
  setupSubtitle: msg`Drop the rooms your hackathon needs onto the floor, set who is allowed in each one, and add another level if you want the building to have one. Attendees walk this exact map.`,
  continueLabel: msg`The brief`,
}

const BY_TYPE: Partial<Record<EventType, Partial<Record<VenueCopyKey, MessageDescriptor>>>> = {
  conference: {
    setupSubtitle: msg`Drop the stage, sponsor booths and breakout rooms onto the floor, set who is allowed in each one, and add another level if you want the building to have one. Attendees walk this exact map.`,
    continueLabel: msg`The programme`,
  },
}

/** The string for this key, in this event type's vocabulary. */
export function venueCopy(
  eventType: string | null | undefined,
  key: VenueCopyKey
): MessageDescriptor {
  return BY_TYPE[eventType as EventType]?.[key] ?? DEFAULT_COPY[key]
}
