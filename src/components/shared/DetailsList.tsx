import type { DetailEntry } from '../../types'

interface DetailsListProps {
  details?: DetailEntry[] | null
  /** 'dark' renders white-on-dark text for hero overlays */
  tone?: 'light' | 'dark'
  /** Cap top-level entries shown (hero has limited space) */
  max?: number
  compact?: boolean
}

export function DetailsList({ details, tone = 'light', max, compact = false }: DetailsListProps) {
  if (!details || details.length === 0) return null

  const shown = max ? details.slice(0, max) : details

  const groupLabel = tone === 'dark' ? 'font-semibold text-white' : 'font-semibold text-ktip-sand-900'
  const itemLabel = tone === 'dark' ? 'font-medium text-white/90' : 'font-medium text-ktip-sand-700'
  const itemValue = tone === 'dark' ? 'text-white/70' : 'text-gray-700'
  const border = tone === 'dark' ? 'border-white/20' : 'border-ktip-sand-100'
  const textSize = compact ? 'text-sm' : 'text-base'

  return (
    <ul className={compact ? 'space-y-2' : 'space-y-3'}>
      {shown.map((entry) =>
        entry.items ? (
          <li key={entry.id}>
            {entry.label && (
              <p className={`${groupLabel} ${textSize} mb-1`}>{entry.label}</p>
            )}
            <ul className={`pl-4 border-l-2 ${border} ${compact ? 'space-y-1' : 'space-y-1.5'}`}>
              {entry.items.map((item) => (
                <li key={item.id} className={`flex gap-2 ${textSize} leading-relaxed`}>
                  {item.label && (
                    <span className={`${itemLabel} shrink-0`}>{item.label}:</span>
                  )}
                  <span className={itemValue}>{item.value}</span>
                </li>
              ))}
            </ul>
          </li>
        ) : (
          <li key={entry.id} className={`flex gap-2 ${textSize} leading-relaxed`}>
            {entry.label && (
              <span className={`${itemLabel} shrink-0`}>{entry.label}:</span>
            )}
            <span className={itemValue}>{entry.value}</span>
          </li>
        )
      )}
    </ul>
  )
}
