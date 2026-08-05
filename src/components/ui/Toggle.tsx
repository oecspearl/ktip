import { cn } from '../../lib/utils'

interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  /** Accessible name. Rendered only as aria-label — Toggle draws the visible one. */
  label: string
  disabled?: boolean
  className?: string
}

/**
 * The bare switch, in the same soft-UI language as Button.
 *
 * The track is a well pressed INTO the surface (inset pair) and the knob is
 * lifted OUT of it (raised pair) — one light source, two directions, which is
 * what makes the control read as a physical thing rather than as a coloured
 * pill. Colour carries the state: the track tints green when on.
 *
 * Split out of Toggle because two admin screens needed the control without the
 * label row around it and had hand-rolled their own instead.
 */
export function Switch({ checked, onChange, label, disabled, className }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={cn(
        // The track paints the surface it sits on so the inset shadow reads as
        // a well in that surface — same --neu-surface contract as Button.
        'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full p-1',
        'shadow-neu-sm-inset transition-colors duration-200',
        'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ktip-sand-700',
        'motion-reduce:transition-none',
        checked ? 'bg-ktip-tropical-500' : 'bg-[var(--neu-surface)]',
        disabled && 'cursor-not-allowed opacity-60',
        className
      )}
    >
      <span
        className={cn(
          // Knob: raised, and light enough to hold its highlight on the green
          // track as well as on the grey one.
          'inline-block h-5 w-5 rounded-full bg-ktip-sand-50 shadow-neu-sm',
          'transform transition-transform duration-200 motion-reduce:transition-none',
          checked ? 'translate-x-5' : 'translate-x-0'
        )}
      />
    </button>
  )
}

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
      <Switch checked={checked} onChange={onChange} label={label} disabled={disabled} />
    </label>
  )
}
