import { useState } from 'react'
import { Input } from './Input'
import { INDUSTRIES, INDUSTRY_OTHER } from '../../lib/constants'
import { Trans, useLingui } from '@lingui/react/macro'

interface IndustrySelectProps {
  value: string
  onChange: (value: string) => void
  label?: string
}

// Curated industry dropdown with an "Other" free-text escape hatch.
// A stored value outside the curated list selects "Other" and fills
// the text input.
export function IndustrySelect({ value, onChange, label = 'Industry' }: IndustrySelectProps) {
    const { t } = useLingui()
  const isCurated = value === '' || (INDUSTRIES as readonly string[]).includes(value)
  const [otherMode, setOtherMode] = useState(!isCurated)

  const handleSelect = (selected: string) => {
    if (selected === INDUSTRY_OTHER) {
      setOtherMode(true)
      onChange('')
    } else {
      setOtherMode(false)
      onChange(selected)
    }
  }

  return (
    <div className="flex flex-col gap-1.5 w-full">
      <label className="text-sm font-medium text-ktip-sand-700">{label}</label>
      <select
        value={otherMode ? INDUSTRY_OTHER : value}
        onChange={(e) => handleSelect(e.target.value)}
        className="w-full border border-ktip-sand-200 rounded-xl px-4 py-3 bg-ktip-sand-50/50 transition-all focus:outline-none focus:ring-2 focus:border-ktip-ocean-500 focus:ring-ktip-ocean-500/20 focus:bg-ktip-cream"
      >
        <option value=""><Trans>Select an industry</Trans></option>
        {[...INDUSTRIES].map((industry) => (
          <option key={industry} value={industry}>{industry}</option>
        ))}
        <option value={INDUSTRY_OTHER}>{INDUSTRY_OTHER}</option>
      </select>
      {otherMode && (
        <Input
          type="text"
          placeholder={t`Enter your industry`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          fullWidth
        />
      )}
    </div>
  )
}
