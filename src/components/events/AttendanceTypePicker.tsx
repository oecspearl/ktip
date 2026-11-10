import { Users, Eye } from 'lucide-react'
import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'
import { ATTENDANCE_TYPE_LABELS } from '../../lib/constants'
import type { AttendanceType } from '../../types'
import { Trans, useLingui } from '@lingui/react/macro'

// Keyed by whether the event has a challenge: "join a team and submit" is what
// taking part means at a hackathon, not at a conference.
const BLURBS: Record<'challenge' | 'general', Record<AttendanceType, MessageDescriptor>> = {
  challenge: {
    participant: msg`Join a team and build something to submit. Uses one of the participant places.`,
    viewer: msg`Watch the rooms and follow along. No team, no submission.`,
  },
  general: {
    participant: msg`Join in. Ask questions in the sessions and meet the other attendees.`,
    viewer: msg`Watch and listen from the audience.`,
  },
}

interface AttendanceTypePickerProps {
  value: AttendanceType
  onChange: (value: AttendanceType) => void
  disabled?: boolean
  /** Picks the blurbs: taking part at a hackathon is not taking part at a conference */
  hasChallenge?: boolean
  /** An option that cannot be chosen, with the reason shown in place of its blurb */
  unavailable?: Partial<Record<AttendanceType, string>>
  /** The dialog title already asks the question */
  hideLegend?: boolean
}

const OPTIONS: { value: AttendanceType; icon: typeof Users }[] = [
  { value: 'participant', icon: Users },
  { value: 'viewer', icon: Eye },
]

/**
 * How am I attending — taking part, or spectating?
 *
 * This used to be decided for you: join_venue() read an RSVP as "participant"
 * and there was no way to say otherwise, so the spectator role the venue is
 * built around was unreachable. The answer is written to
 * event_rsvps.attendance_type at registration and read back when you enter.
 *
 * Rendered as radio cards rather than a select because it is a two-way fork the
 * registrant should read before answering, not a field to skim past. Asked in
 * AttendanceChoiceDialog, after "Request to attend" is pressed, on event types
 * whose blueprint has `allowViewers`.
 */
export function AttendanceTypePicker({
  value,
  onChange,
  disabled,
  hasChallenge = false,
  unavailable,
  hideLegend,
}: AttendanceTypePickerProps) {
  const { i18n } = useLingui()
  const blurbs = BLURBS[hasChallenge ? 'challenge' : 'general']

  return (
    <fieldset className="mb-4" disabled={disabled}>
      <legend className={hideLegend ? 'sr-only' : 'block text-sm font-medium text-ktip-sand-700 mb-2'}>
        <Trans>How are you attending?</Trans>
      </legend>

      <div className="space-y-2">
        {OPTIONS.map((option) => {
          const Icon = option.icon
          const selected = value === option.value
          const reason = unavailable?.[option.value]
          const off = disabled || !!reason

          return (
            <label
              key={option.value}
              className={[
                'flex items-start gap-3 p-3 rounded-xl border transition-colors',
                selected
                  ? 'border-ktip-ocean-500 bg-ktip-ocean-50'
                  : 'border-ktip-sand-200 hover:border-ktip-sand-300',
                off ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
              ].join(' ')}
            >
              <input
                type="radio"
                name="attendance_type"
                className="sr-only"
                value={option.value}
                checked={selected}
                onChange={() => onChange(option.value)}
                disabled={off}
              />
              <Icon
                size={18}
                className={selected ? 'text-ktip-ocean-600 mt-0.5 shrink-0' : 'text-ktip-sand-400 mt-0.5 shrink-0'}
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ktip-sand-800">
                  {i18n._(ATTENDANCE_TYPE_LABELS[option.value])}
                </span>
                <span className="block text-xs text-ktip-sand-500 mt-0.5">
                  {reason ?? i18n._(blurbs[option.value])}
                </span>
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
