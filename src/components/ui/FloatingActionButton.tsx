import { useEffect, useRef, useState, type ReactNode } from 'react'
import { MessageSquare, Moon, Sun, X } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useMessagingPanel } from '../../contexts/MessagingPanelContext'
import { useThemeMode } from '../../hooks/useThemeMode'
import { cn } from '../../lib/utils'

interface FabAction {
  id: string
  label: string
  icon: ReactNode
  onClick: () => void
  show?: boolean
}

/**
 * Expandable quick-actions cluster fixed to the bottom-right corner.
 * Collapsed: single round button with the KTIP logo. Expanded: sub-buttons
 * fan upward with a staggered spring; the main button turns grey with an X.
 * Add future actions by appending to the `actions` array below.
 * Note: this corner is also reserved by the (currently unmounted)
 * UATFeedbackButton — reposition one of them before mounting both.
 */
export function FloatingActionButton() {
  const auth = useAuth()
  const { togglePanel } = useMessagingPanel()
  const [dark, setDark] = useThemeMode()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const actions: FabAction[] = [
    {
      id: 'theme',
      label: dark ? 'Light mode' : 'Dark mode',
      icon: dark ? <Sun size={20} /> : <Moon size={20} />,
      // Stays open so the flip is visible
      onClick: () => setDark(!dark),
    },
    {
      id: 'messages',
      label: 'Messages',
      icon: <MessageSquare size={20} />,
      onClick: () => {
        togglePanel()
        setOpen(false)
      },
      show: !!auth.user,
    },
  ]

  const visible = actions.filter((a) => a.show !== false)

  return (
    <div
      ref={containerRef}
      data-fab
      className="fixed bottom-6 right-6 z-[9999] flex flex-col items-center gap-3"
    >
      {visible.map((action, index) => (
        <button
          key={action.id}
          onClick={action.onClick}
          aria-label={action.label}
          tabIndex={open ? 0 : -1}
          className={cn(
            'relative group w-14 h-14 rounded-xl flex items-center justify-center',
            'bg-ktip-cream/90 backdrop-blur-md border border-ktip-sand-200 text-ktip-sand-700 shadow-fab',
            'hover:text-ktip-ocean-600 hover:shadow-fab-hover',
            open
              ? 'opacity-100 translate-y-0 scale-100'
              : 'opacity-0 translate-y-4 scale-75 pointer-events-none'
          )}
          style={{
            transition:
              'transform 0.4s cubic-bezier(0.22,1,0.36,1), opacity 0.3s ease, color 0.2s ease, box-shadow 0.35s cubic-bezier(0.22,1,0.36,1)',
            transitionDelay: open ? `${0.03 + (visible.length - 1 - index) * 0.06}s` : '0s',
          }}
        >
          {action.icon}
          <span className="absolute right-full mr-3 top-1/2 -translate-y-1/2 whitespace-nowrap px-2.5 py-1.5 rounded-lg bg-ktip-ink text-white text-xs font-medium opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity">
            {action.label}
          </span>
        </button>
      ))}

      <button
        onClick={() => setOpen(!open)}
        aria-label="Quick actions"
        aria-expanded={open}
        className={cn(
          'w-16 h-16 rounded-2xl flex items-center justify-center shadow-fab',
          'transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
          open
            ? 'bg-gray-500 text-white shadow-fab-hover'
            : 'bg-ktip-cream border border-ktip-sand-200 hover:scale-105 hover:-translate-y-0.5 hover:shadow-fab-hover'
        )}
      >
        {open ? (
          <X size={24} />
        ) : (
          <img
            src="/KTIP%20LOGO.png"
            alt=""
            className="w-12 h-12 object-contain"
          />
        )}
      </button>
    </div>
  )
}
