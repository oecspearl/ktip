import { useState } from 'react'
import { X, Plus } from 'lucide-react'
import { Button } from './Button'

interface TagInputProps {
  values: string[]
  onChange: (values: string[]) => void
  suggestions?: readonly string[]
  max?: number
  placeholder?: string
  label?: string
  description?: string
}

export function TagInput({
  values,
  onChange,
  suggestions = [],
  max = 20,
  placeholder = 'Type and press Enter...',
  label,
  description,
}: TagInputProps) {
  const [input, setInput] = useState('')

  const addTag = (raw: string) => {
    const val = raw.trim()
    if (val && !values.includes(val) && values.length < max) {
      onChange([...values, val])
      setInput('')
    }
  }

  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-ktip-sand-700 mb-1.5">{label}</label>
      )}
      {description && <p className="text-sm text-ktip-sand-600 mb-3">{description}</p>}

      {values.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {values.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium bg-ktip-ocean-50 text-ktip-ocean-700 border border-ktip-ocean-200"
            >
              {tag}
              <button
                type="button"
                onClick={() => onChange(values.filter((t) => t !== tag))}
                className="ml-0.5 hover:text-red-600 transition-colors"
                aria-label={`Remove ${tag}`}
              >
                <X size={14} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addTag(input)
            }
          }}
          placeholder={placeholder}
          className="flex-1 border border-ktip-sand-200 rounded-xl px-4 py-2.5 bg-ktip-sand-50/50 transition-all focus:outline-none focus:ring-2 focus:border-ktip-ocean-500 focus:ring-ktip-ocean-500/20 focus:bg-ktip-cream text-sm"
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          icon={<Plus size={14} />}
          onClick={() => addTag(input)}
        >
          Add
        </Button>
      </div>

      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions
            .filter((s) => !values.includes(s))
            .slice(0, 12)
            .map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => addTag(suggestion)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border border-ktip-sand-200 text-ktip-sand-600 hover:border-ktip-ocean-300 hover:text-ktip-ocean-700 hover:bg-ktip-ocean-50 transition-all"
              >
                <Plus size={12} />
                {suggestion}
              </button>
            ))}
        </div>
      )}
    </div>
  )
}
