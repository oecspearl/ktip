import { ShieldCheck } from 'lucide-react'
import { SELECTABLE_ROLES } from '../../lib/constants'

/**
 * Shared "I am a..." role grid used by the signup and onboarding wizards.
 *
 * Student and Faculty carry a badge because they behave differently: they are
 * granted by a school, not chosen. Selecting one does not write the role — it
 * routes into verification. The badge is here rather than only in the copy
 * below the grid so the difference is visible at the moment of choosing.
 */
export function RolePicker({
  value,
  onChange,
  error,
}: {
  value: string
  onChange: (value: string) => void
  error?: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-ktip-sand-700 mb-2">
        I am a... <span className="text-red-500">*</span>
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {SELECTABLE_ROLES.map((role) => (
          <button
            key={role.value}
            type="button"
            onClick={() => onChange(role.value)}
            className={`px-3 py-2.5 rounded-xl border-2 text-left transition-all ${
              value === role.value
                ? 'border-ktip-ocean-500 bg-ktip-ocean-50'
                : 'border-ktip-sand-200 hover:border-ktip-ocean-300'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-sm text-ktip-sand-900">{role.label}</span>
              {role.requiresVerification && (
                <ShieldCheck
                  size={13}
                  className="text-ktip-ocean-500 flex-shrink-0"
                  aria-label="Approved by your school"
                />
              )}
            </div>
            <div className="text-xs text-ktip-sand-600 mt-0.5">{role.description}</div>
          </button>
        ))}
      </div>

      <p className="mt-2 flex items-start gap-1.5 text-xs text-ktip-sand-500">
        <ShieldCheck size={13} className="mt-0.5 flex-shrink-0 text-ktip-ocean-500" aria-hidden="true" />
        <span>
          Marked roles are confirmed by your school or university. You can still choose one — we
          will take you through verification.
        </span>
      </p>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  )
}
