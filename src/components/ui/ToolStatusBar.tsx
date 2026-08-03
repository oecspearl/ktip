import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'
import type { ToolSaveStatus } from '../../hooks/useToolAutoSave'
import { useLingui } from '@lingui/react/macro'
import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'

/**
 * Footer strip shared by every collaboration tool. `left` carries the
 * tool-specific metrics (Ln/Col for code, word count for documents, shape
 * count for whiteboards); `right` carries the save state, so all three panels
 * report progress in the same place, in the same words.
 */
interface ToolStatusBarProps {
  left?: ReactNode
  right?: ReactNode
  className?: string
}

export function ToolStatusBar({ left, right, className }: ToolStatusBarProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 px-3 py-1.5 text-xs select-none',
        'bg-ktip-sand-50 border-t border-ktip-sand-200 text-ktip-sand-500',
        className
      )}
    >
      <div className="flex items-center gap-4 min-w-0">{left}</div>
      <div className="flex items-center gap-3 shrink-0">{right}</div>
    </div>
  )
}

/** A single metric, e.g. `Words 1,204`. */
export function StatusMetric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <span className="whitespace-nowrap">
      {label} <span className="text-ktip-sand-700 font-medium">{value}</span>
    </span>
  )
}

// `msg`, not `t`: this table is built once at import, before a language has been
// chosen. `t` here would freeze whatever locale happened to be active then — the
// classic Lingui bug. The descriptors stay inert until `i18n._()` resolves them
// inside the component below, which re-runs on every language change.
const statusCopy: Record<ToolSaveStatus, { label: MessageDescriptor; dot: string; text: string }> = {
  idle: { label: msg`Up to date`, dot: 'bg-ktip-sand-300', text: 'text-ktip-sand-500' },
  unsaved: { label: msg`Unsaved changes`, dot: 'bg-ktip-sand-400', text: 'text-ktip-sand-600' },
  saving: { label: msg`Saving…`, dot: 'bg-ktip-sun-500 animate-pulse', text: 'text-ktip-sun-600' },
  saved: { label: msg`Saved`, dot: 'bg-ktip-tropical-500', text: 'text-ktip-tropical-700' },
  error: { label: msg`Save failed`, dot: 'bg-red-500', text: 'text-red-600' },
}

interface SaveIndicatorProps {
  status: ToolSaveStatus
  /** Appended as `Saved · 12:04` once a save has landed. */
  lastSavedAt?: Date | null
  className?: string
}

export function SaveIndicator({ status, lastSavedAt, className }: SaveIndicatorProps) {
  const { i18n } = useLingui()
  const copy = statusCopy[status]
  const stamp =
    lastSavedAt && status === 'saved'
      ? lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : null

  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap', copy.text, className)}>
      <span className={cn('inline-block w-2 h-2 rounded-full shrink-0', copy.dot)} aria-hidden />
      {i18n._(copy.label)}
      {stamp && <span className="text-ktip-sand-400">· {stamp}</span>}
    </span>
  )
}
