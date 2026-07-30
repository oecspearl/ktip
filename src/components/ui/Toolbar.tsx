import type { ButtonHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

/**
 * Shared toolbar chrome for the collaboration tools (whiteboard, code sandbox,
 * document editor) and the grants rich-text field.
 *
 * Everything here is expressed in `ktip-*` tokens, which `html.dark` already
 * inverts (see index.css). That means no `dark:` variants and no hex literals —
 * a panel built from these primitives follows the app-wide theme toggle
 * (useThemeMode) for free, and all four toolbars stay visually identical.
 */

interface ToolbarProps {
  children: ReactNode
  className?: string
  /** Renders without the bottom divider — for a second toolbar row. */
  seamless?: boolean
}

export function Toolbar({ children, className, seamless = false }: ToolbarProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-1 px-2 py-1.5 bg-ktip-sand-50',
        !seamless && 'border-b border-ktip-sand-200',
        className
      )}
    >
      {children}
    </div>
  )
}

export type ToolbarButtonVariant = 'default' | 'primary' | 'accent' | 'danger'

interface ToolbarButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon?: ReactNode
  label?: ReactNode
  active?: boolean
  variant?: ToolbarButtonVariant
}

const variantClasses: Record<ToolbarButtonVariant, { idle: string; active: string }> = {
  default: {
    idle: 'text-ktip-sand-600 hover:bg-ktip-sand-100 hover:text-ktip-sand-900',
    active: 'bg-ktip-ocean-100 text-ktip-ocean-700 hover:bg-ktip-ocean-200',
  },
  primary: {
    // The ocean scale inverts under html.dark, so 600/700 turn pale there and
    // white text washes out. Pin a dark navy fill for the dark side.
    idle: 'bg-ktip-ocean-600 text-white hover:bg-ktip-ocean-700 dark:bg-ktip-ocean-200 dark:hover:bg-ktip-ocean-300',
    active: 'bg-ktip-ocean-700 text-white dark:bg-ktip-ocean-300',
  },
  accent: {
    idle: 'bg-ktip-sun-500 text-ktip-ink hover:bg-ktip-sun-600',
    active: 'bg-ktip-sun-600 text-ktip-ink',
  },
  danger: {
    idle: 'text-ktip-sand-600 hover:bg-red-50 hover:text-red-600',
    active: 'bg-red-50 text-red-600',
  },
}

export function ToolbarButton({
  icon,
  label,
  active = false,
  variant = 'default',
  disabled,
  className,
  type,
  ...rest
}: ToolbarButtonProps) {
  const tone = variantClasses[variant]
  return (
    <button
      type={type ?? 'button'}
      disabled={disabled}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md text-sm font-medium transition-colors shrink-0',
        label ? 'px-2.5 py-1.5' : 'p-1.5',
        disabled ? 'opacity-30 cursor-not-allowed' : active ? tone.active : tone.idle,
        className
      )}
      {...rest}
    >
      {icon}
      {label}
    </button>
  )
}

export function ToolbarSeparator({ className }: { className?: string }) {
  return <div className={cn('w-px h-5 bg-ktip-sand-200 mx-0.5 shrink-0', className)} aria-hidden />
}

/** Pushes everything after it to the far end of the toolbar. */
export function ToolbarSpacer() {
  return <div className="flex-1" aria-hidden />
}

/** Keeps a set of related controls from wrapping apart. */
export function ToolbarGroup({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex items-center gap-1', className)}>{children}</div>
}

export function ToolbarSelect({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'px-2.5 py-1.5 rounded-md text-sm bg-ktip-cream text-ktip-sand-800',
        'border border-ktip-sand-200 focus:border-ktip-ocean-500',
        'focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20',
        className
      )}
      {...rest}
    />
  )
}
