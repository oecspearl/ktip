import { describe, expect, it } from 'vitest'
import {
  EVENT_BLUEPRINTS,
  EVENT_TYPE_ORDER,
  blueprintFor,
  hasSetupStep,
  setupSteps,
} from './event-blueprints'
import { EVENT_TYPES, EVENT_TYPE_LABELS } from './constants'
import { EVENT_TYPE_ICONS } from './category-icons'
import type { EventType } from '../types'

const ALL_TYPES = Object.values(EVENT_TYPES) as EventType[]

describe('event blueprints', () => {
  it('covers every event type the database accepts, and no others', () => {
    expect(Object.keys(EVENT_BLUEPRINTS).sort()).toEqual([...ALL_TYPES].sort())
    expect([...EVENT_TYPE_ORDER].sort()).toEqual([...ALL_TYPES].sort())
  })

  it('lines up with the label and icon maps it deliberately does not restate', () => {
    for (const type of ALL_TYPES) {
      expect(EVENT_TYPE_LABELS[type], `label for ${type}`).toBeTruthy()
      expect(EVENT_TYPE_ICONS[type], `icon for ${type}`).toBeTruthy()
    }
  })

  it('gives every type a self-declared type field that matches its key', () => {
    for (const [key, blueprint] of Object.entries(EVENT_BLUEPRINTS)) {
      expect(blueprint.type).toBe(key)
    }
  })

  describe('the field matrix', () => {
    it('a challenge has no room, no seats and no end date — only a deadline', () => {
      const challenge = EVENT_BLUEPRINTS.challenge
      expect(challenge.format).toBe('virtual-only')
      expect(challenge.location).toBe('hidden')
      expect(challenge.capacity).toBe('hidden')
      expect(challenge.endDate).toBe('hidden')
      expect(challenge.submissionDeadline).toBe(true)
      // The submission deadline is the gate; a second one would confuse
      expect(challenge.registrationCloses).toBe(false)
    })

    it('a workshop must have seats', () => {
      expect(EVENT_BLUEPRINTS.workshop.capacity).toBe('required')
      expect(EVENT_BLUEPRINTS.workshop.capacityLabel).toBe('Seats')
    })

    it('only meetup leaves the end date optional', () => {
      const optional = ALL_TYPES.filter((t) => EVENT_BLUEPRINTS[t].endDate === 'optional')
      expect(optional).toEqual(['meetup'])
    })

    it('team size is asked of exactly the team-based types', () => {
      const teamBased = ALL_TYPES.filter((t) => EVENT_BLUEPRINTS[t].teamSize).sort()
      expect(teamBased).toEqual(['challenge', 'demo_day', 'hackathon'])
    })

    it('a submission deadline is asked wherever something gets submitted', () => {
      const submits = ALL_TYPES.filter((t) => EVENT_BLUEPRINTS[t].submissionDeadline).sort()
      expect(submits).toEqual(['challenge', 'demo_day', 'hackathon'])
    })

    it('every type that takes submissions also gets the criteria machinery', () => {
      for (const type of ALL_TYPES) {
        const blueprint = EVENT_BLUEPRINTS[type]
        if (blueprint.submissionDeadline) {
          expect(blueprint.onCreate.has_challenge, `has_challenge for ${type}`).toBe(true)
        }
      }
    })

    it('a hackathon is the only type that switches the venue on', () => {
      const venued = ALL_TYPES.filter((t) => EVENT_BLUEPRINTS[t].onCreate.has_venue)
      expect(venued).toEqual(['hackathon'])
    })

    it('only types with an audience offer a viewer registration', () => {
      const watchable = ALL_TYPES.filter((t) => EVENT_BLUEPRINTS[t].allowViewers)
      expect(watchable.sort()).toEqual(['conference', 'demo_day', 'hackathon'])
    })

    it('a type that turns spectators on can also be registered for as a viewer', () => {
      // spectators_enabled is what join_venue() consults; allowViewers is what
      // shows the choice. Setting the first without the second would seat a
      // registrant as a participant no matter what they meant.
      for (const type of ALL_TYPES) {
        const blueprint = EVENT_BLUEPRINTS[type]
        if (blueprint.onCreate.spectators_enabled) {
          expect(blueprint.allowViewers, `allowViewers for ${type}`).toBe(true)
        }
      }
    })

    it('a capacity that is shown has something to call itself', () => {
      for (const type of ALL_TYPES) {
        const blueprint = EVENT_BLUEPRINTS[type]
        if (blueprint.capacity !== 'hidden') {
          expect(blueprint.capacityLabel, `capacityLabel for ${type}`).toBeTruthy()
          expect(blueprint.capacityHelp, `capacityHelp for ${type}`).toBeTruthy()
        }
      }
    })

    it('a virtual-only type never asks for a location', () => {
      for (const type of ALL_TYPES) {
        const blueprint = EVENT_BLUEPRINTS[type]
        if (blueprint.format === 'virtual-only') {
          expect(blueprint.location, `location for ${type}`).toBe('hidden')
          expect(blueprint.defaultVirtual, `defaultVirtual for ${type}`).toBe(true)
        }
      }
    })
  })

  describe('step 2', () => {
    it('meetup is the only type that ends at the form', () => {
      const noSetup = ALL_TYPES.filter((t) => !hasSetupStep(t))
      expect(noSetup).toEqual(['meetup'])
    })

    it('every setup names at least one section to render', () => {
      for (const type of ALL_TYPES) {
        const { setup } = EVENT_BLUEPRINTS[type]
        if (setup) {
          expect(setup.sections.length, `sections for ${type}`).toBeGreaterThan(0)
          expect(setup.label, `label for ${type}`).toBeTruthy()
          expect(setup.blurb, `blurb for ${type}`).toBeTruthy()
        }
      }
    })

    it('the venue editor only appears for the type that has a venue', () => {
      for (const type of ALL_TYPES) {
        const { setup, onCreate } = EVENT_BLUEPRINTS[type]
        if (setup?.sections.includes('venue')) {
          expect(onCreate.has_venue, `${type} renders a venue it never turned on`).toBe(true)
        }
      }
    })

    it('a criteria editor only appears where has_challenge was set', () => {
      for (const type of ALL_TYPES) {
        const { setup, onCreate } = EVENT_BLUEPRINTS[type]
        const editsCriteria =
          setup?.sections.includes('challenge') || setup?.sections.includes('judging')
        if (editsCriteria) {
          expect(onCreate.has_challenge, `${type} edits criteria without has_challenge`).toBe(true)
        }
      }
    })

    it('gives two stepper labels when there is a step 2, one when there is not', () => {
      expect(setupSteps('meetup')).toEqual(['Event details'])
      expect(setupSteps('hackathon')).toEqual(['Event details', 'Design the rooms'])
    })
  })

  describe('blueprintFor', () => {
    it('returns the blueprint for a known type', () => {
      expect(blueprintFor('conference').type).toBe('conference')
    })

    it('falls back to meetup for anything it does not recognise', () => {
      // A row written before this file existed, or by something other than the form
      expect(blueprintFor('symposium').type).toBe('meetup')
      expect(blueprintFor(null).type).toBe('meetup')
      expect(blueprintFor(undefined).type).toBe('meetup')
    })

    it('does not claim an unknown type has a step 2', () => {
      expect(hasSetupStep('symposium')).toBe(false)
      expect(setupSteps(null)).toEqual(['Event details'])
    })
  })
})
