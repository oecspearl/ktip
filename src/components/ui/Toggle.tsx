interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
  disabled?: boolean
}

/**
 * Row-shaped switch used by the settings tabs. Lived inside PreferencesTab
 * until the Personalization tab needed the same control.
 */
export function Toggle({ checked, onChange, label, description, disabled }: ToggleProps) {
  return (
    <label
      className={`flex items-center justify-between py-3 group ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      }`}
    >
      <div className="flex-1 mr-4">
        <div className="text-sm font-medium text-ktip-sand-800 group-hover:text-ktip-sand-900">
          {label}
        </div>
        {description && (
          <div className="text-xs text-ktip-sand-500 mt-0.5">{description}</div>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          checked ? 'bg-ktip-ocean-500' : 'bg-ktip-sand-300'
        } ${disabled ? 'cursor-not-allowed' : ''}`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </label>
  )
}
