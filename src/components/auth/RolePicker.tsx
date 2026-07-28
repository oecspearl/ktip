import { SELECTABLE_ROLES } from '../../lib/constants'

// Shared "I am a..." role grid used by the signup and onboarding wizards.
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
            <div className="font-medium text-sm text-ktip-sand-900">{role.label}</div>
            <div className="text-xs text-ktip-sand-600 mt-0.5">{role.description}</div>
          </button>
        ))}
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  )
}
