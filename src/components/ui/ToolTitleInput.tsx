/**
 * The editable document title that sits inside a PageHero. Rendered inside an
 * <h1>, so it inherits the hero's display font and size rather than setting
 * its own.
 */
interface ToolTitleInputProps {
  value: string
  onChange: (value: string) => void
  /** Fired on blur and on Enter — the moment to persist the new title. */
  onCommit?: () => void
  readOnly?: boolean
  placeholder?: string
}

export function ToolTitleInput({
  value,
  onChange,
  onCommit,
  readOnly = false,
  placeholder = 'Untitled',
}: ToolTitleInputProps) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => onCommit?.()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          e.currentTarget.blur()
        }
      }}
      readOnly={readOnly}
      aria-label="Title"
      placeholder={placeholder}
      className="font-display font-bold text-white bg-transparent border-none focus:outline-none w-full placeholder-white/40 read-only:cursor-default"
    />
  )
}
