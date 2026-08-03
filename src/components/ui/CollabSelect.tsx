import { X, Plus } from 'lucide-react'
import { COLLABORATION_OPTIONS, COLLAB_EXCLUSIVE_VALUE } from '../../lib/constants'
import { useLingui } from '@lingui/react/macro'
import { resolveCopy } from '../../i18n/copy'

interface CollabSelectProps {
  values: string[]
  onChange: (values: string[]) => void
}

// Multi-select for "Openness to Collaborate". Picking "Not Currently
// Seeking" is exclusive: it clears every other option (and vice versa).
export function CollabSelect({ values, onChange }: CollabSelectProps) {
  const { i18n } = useLingui()
  const toggle = (value: string) => {
    if (values.includes(value)) {
      onChange(values.filter((v) => v !== value))
    } else if (value === COLLAB_EXCLUSIVE_VALUE) {
      onChange([COLLAB_EXCLUSIVE_VALUE])
    } else {
      onChange([...values.filter((v) => v !== COLLAB_EXCLUSIVE_VALUE), value])
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {COLLABORATION_OPTIONS.map((option) => {
        const isSelected = values.includes(option.value)
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => toggle(option.value)}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full border-2 text-sm font-medium transition-all ${
              isSelected
                ? 'border-ktip-ocean-500 bg-ktip-ocean-50 text-ktip-ocean-700'
                : 'border-ktip-sand-200 text-ktip-sand-600 hover:border-ktip-ocean-300'
            }`}
          >
            {isSelected ? <X size={14} /> : <Plus size={14} />}
            {resolveCopy(i18n, option.label)}
          </button>
        )
      })}
    </div>
  )
}
