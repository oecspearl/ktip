import { Plus, FolderPlus, X, ChevronUp, ChevronDown } from 'lucide-react'
import type { DetailEntry, DetailItem } from '../../types'
import { Trans, useLingui } from '@lingui/react/macro'

interface DetailsEditorProps {
  value: DetailEntry[]
  onChange: (value: DetailEntry[]) => void
}

const inputClass =
  'w-full px-3 py-2 border border-ktip-sand-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500 transition-colors'

const iconButtonClass =
  'p-1.5 text-ktip-sand-400 hover:text-ktip-sand-700 hover:bg-ktip-sand-100 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed'

const addButtonClass =
  'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-ktip-ocean-600 border border-ktip-ocean-200 rounded-lg hover:bg-ktip-ocean-50 transition-colors'

/** Trims labels/values, drops empty items, drops groups left with no label and no items. */
export function cleanDetails(entries: DetailEntry[]): DetailEntry[] {
  return entries
    .map((entry) => {
      if (entry.items) {
        const items = entry.items
          .map((item) => ({ ...item, label: item.label.trim(), value: item.value.trim() }))
          .filter((item) => item.label || item.value)
        return { ...entry, label: entry.label.trim(), items }
      }
      return { ...entry, label: entry.label.trim(), value: (entry.value || '').trim() }
    })
    .filter((entry) => (entry.items ? entry.label || entry.items.length > 0 : entry.label || entry.value))
}

function move<T>(arr: T[], from: number, to: number): T[] {
  const next = [...arr]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

export function DetailsEditor({ value, onChange }: DetailsEditorProps) {
    const { t } = useLingui()
  const updateEntry = (id: string, patch: Partial<DetailEntry>) =>
    onChange(value.map((e) => (e.id === id ? { ...e, ...patch } : e)))

  const removeEntry = (id: string) => onChange(value.filter((e) => e.id !== id))

  const moveEntry = (index: number, dir: -1 | 1) => onChange(move(value, index, index + dir))

  const addField = () =>
    onChange([...value, { id: crypto.randomUUID(), label: '', value: '' }])

  const addGroup = () =>
    onChange([
      ...value,
      { id: crypto.randomUUID(), label: '', items: [{ id: crypto.randomUUID(), label: '', value: '' }] },
    ])

  const updateItem = (entry: DetailEntry, itemId: string, patch: Partial<DetailItem>) =>
    updateEntry(entry.id, {
      items: (entry.items || []).map((i) => (i.id === itemId ? { ...i, ...patch } : i)),
    })

  const removeItem = (entry: DetailEntry, itemId: string) =>
    updateEntry(entry.id, { items: (entry.items || []).filter((i) => i.id !== itemId) })

  const moveItem = (entry: DetailEntry, index: number, dir: -1 | 1) =>
    updateEntry(entry.id, { items: move(entry.items || [], index, index + dir) })

  const addItem = (entry: DetailEntry) =>
    updateEntry(entry.id, {
      items: [...(entry.items || []), { id: crypto.randomUUID(), label: '', value: '' }],
    })

  return (
    <div className="space-y-3">
      {value.map((entry, index) => (
        <div
          key={entry.id}
          className={
            entry.items
              ? 'border border-ktip-sand-200 rounded-xl p-3 space-y-2'
              : 'flex items-center gap-2'
          }
        >
          {entry.items ? (
            <>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={entry.label}
                  onChange={(e) => updateEntry(entry.id, { label: e.currentTarget.value })}
                  placeholder={t`Group name (e.g. Funding)`}
                  className={`${inputClass} font-medium`}
                />
                <button type="button" onClick={() => moveEntry(index, -1)} disabled={index === 0} className={iconButtonClass} title={t`Move up`}>
                  <ChevronUp size={16} />
                </button>
                <button type="button" onClick={() => moveEntry(index, 1)} disabled={index === value.length - 1} className={iconButtonClass} title={t`Move down`}>
                  <ChevronDown size={16} />
                </button>
                <button type="button" onClick={() => removeEntry(entry.id)} className={iconButtonClass} title={t`Remove group`}>
                  <X size={16} />
                </button>
              </div>
              <div className="pl-4 border-l-2 border-ktip-sand-100 space-y-2">
                {entry.items.map((item, itemIndex) => (
                  <div key={item.id} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={item.label}
                      onChange={(e) => updateItem(entry, item.id, { label: e.currentTarget.value })}
                      placeholder={t`Label`}
                      className={inputClass}
                    />
                    <input
                      type="text"
                      value={item.value}
                      onChange={(e) => updateItem(entry, item.id, { value: e.currentTarget.value })}
                      placeholder={t`Value`}
                      className={inputClass}
                    />
                    <button type="button" onClick={() => moveItem(entry, itemIndex, -1)} disabled={itemIndex === 0} className={iconButtonClass} title={t`Move up`}>
                      <ChevronUp size={16} />
                    </button>
                    <button type="button" onClick={() => moveItem(entry, itemIndex, 1)} disabled={itemIndex === (entry.items?.length || 0) - 1} className={iconButtonClass} title={t`Move down`}>
                      <ChevronDown size={16} />
                    </button>
                    <button type="button" onClick={() => removeItem(entry, item.id)} className={iconButtonClass} title={t`Remove item`}>
                      <X size={16} />
                    </button>
                  </div>
                ))}
                <button type="button" onClick={() => addItem(entry)} className={addButtonClass}>
                  <Plus size={14} />
                  <Trans>Add item</Trans>
                </button>
              </div>
            </>
          ) : (
            <>
              <input
                type="text"
                value={entry.label}
                onChange={(e) => updateEntry(entry.id, { label: e.currentTarget.value })}
                placeholder={t`Label`}
                className={inputClass}
              />
              <input
                type="text"
                value={entry.value || ''}
                onChange={(e) => updateEntry(entry.id, { value: e.currentTarget.value })}
                placeholder={t`Value`}
                className={inputClass}
              />
              <button type="button" onClick={() => moveEntry(index, -1)} disabled={index === 0} className={iconButtonClass} title={t`Move up`}>
                <ChevronUp size={16} />
              </button>
              <button type="button" onClick={() => moveEntry(index, 1)} disabled={index === value.length - 1} className={iconButtonClass} title={t`Move down`}>
                <ChevronDown size={16} />
              </button>
              <button type="button" onClick={() => removeEntry(entry.id)} className={iconButtonClass} title={t`Remove field`}>
                <X size={16} />
              </button>
            </>
          )}
        </div>
      ))}

      <div className="flex gap-2">
        <button type="button" onClick={addField} className={addButtonClass}>
          <Plus size={14} />
          <Trans>Add field</Trans>
        </button>
        <button type="button" onClick={addGroup} className={addButtonClass}>
          <FolderPlus size={14} />
          <Trans>Add group</Trans>
        </button>
      </div>
    </div>
  )
}
