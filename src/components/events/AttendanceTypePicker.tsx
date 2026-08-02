import { Users, Eye } from 'lucide-react'
import { ATTENDANCE_TYPE_BLURBS, ATTENDANCE_TYPE_LABELS } from '../../lib/constants'
import type { AttendanceType } from '../../types'

interface AttendanceTypePickerProps {
  value: AttendanceType
  onChange: (value: AttendanceType) => void
  disabled?: boolean
}

const OPTIONS: { value: AttendanceType; icon: typeof Users }[] = [
  { value: 'participant', icon: Users },
  { value: 'viewer', icon: Eye },
]

/**
 * How am I attending — competing, or watching?
 *
 * This used to be decided for you: join_venue() read an RSVP as "participant"
 * and there was no way to say otherwise, so the spectator role the venue is
 * built around was unreachable. The answer is written to
 * event_rsvps.attendance_type at registration and read back when you enter.
 *
 * Rendered as radio cards rather than a select because it is a two-way fork the
 * registrant should read before answering, not a field to skim past. Only
 * shown when the event actually has an audience — see `allowViewers` on the
 * blueprint and `spectators_enabled` on the event.
 */
export function AttendanceTypePicker({ value, onChange, disabled }: AttendanceTypePickerProps) {
  return (
    <fieldset className="mb-4" disabled={disabled}>
      <legend className="block text-sm font-medium text-ktip-sand-700 mb-2">
        How are you attending?
      </legend>

      <div className="space-y-2">
        {OPTIONS.map((option) => {
          const Icon = option.icon
          const selected = value === option.value

          return (
            <label
              key={option.value}
              className={[
                'flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors',
                selected
                  ? 'border-ktip-ocean-500 bg-ktip-ocean-50'
                  : 'border-ktip-sand-200 hover:border-ktip-sand-300',
                disabled ? 'opacity-60 cursor-not-allowed' : '',
              ].join(' ')}
            >
              <input
                type="radio"
                name="attendance_type"
                className="sr-only"
                value={option.value}
                checked={selected}
                onChange={() => onChange(option.value)}
                disabled={disabled}
              />
              <Icon
                size={18}
                className={selected ? 'text-ktip-ocean-600 mt-0.5' : 'text-ktip-sand-400 mt-0.5'}
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ktip-sand-800">
                  {ATTENDANCE_TYPE_LABELS[option.value]}
                </span>
                <span className="block text-xs text-ktip-sand-500 mt-0.5">
                  {ATTENDANCE_TYPE_BLURBS[option.value]}
                </span>
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
