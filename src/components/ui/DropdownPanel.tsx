import type { HTMLAttributes, Ref } from 'react'
import { cn } from '../../lib/utils'
import { useDisclosureAnimation } from './useDisclosureAnimation'

interface DropdownPanelProps extends HTMLAttributes<HTMLDivElement> {
  open: boolean
  /** Blocks clicks and screen readers while the panel is on its way out. */
  inertWhenClosed?: boolean
  enterMs?: number
  exitMs?: number
  ref?: Ref<HTMLDivElement>
}

/**
 * Popover shell that animates in and out. Replaces the `{open && <div
 * className="animate-scale-in">}` pattern, which had no exit at all.
 *
 * Deliberately owns nothing else: positioning, outside-click and Escape stay
 * with each consumer, which already had them.
 */
export function DropdownPanel({
  open,
  inertWhenClosed = true,
  enterMs,
  exitMs,
  className,
  children,
  ref,
  ...rest
}: DropdownPanelProps) {
  const { mounted, state } = useDisclosureAnimation(open, { enterMs, exitMs })

  if (!mounted) return null

  return (
    <div
      ref={ref}
      data-state={state}
      inert={inertWhenClosed && state === 'closed' ? true : undefined}
      className={cn('dropdown-panel', className)}
      {...rest}
    >
      {children}
    </div>
  )
}
