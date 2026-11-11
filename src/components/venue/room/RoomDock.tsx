import { useEffect, useState, type ReactNode } from 'react'
import { LayoutList, MessageSquare, PanelRightClose, PanelRightOpen, Users } from 'lucide-react'
import { useLingui } from '@lingui/react/macro'
import { cn } from '../../../lib/utils'

export interface DockTab {
  id: string
  label: string
  /** How many are in the tab (people, raised hands), shown after the label. */
  count?: number
  node: ReactNode
}

const iconFor = (id: string) =>
  id === 'chat' ? MessageSquare : id === 'occupants' ? Users : LayoutList

const tabKey = (roomId: string) => `ktip.room.dock.${roomId}`

function readTab(roomId: string): string | null {
  try {
    return localStorage.getItem(tabKey(roomId))
  } catch {
    return null
  }
}

/**
 * The column on the right of every room: Chat, People and one tab that belongs
 * to this kind of room. The same place in every room, so nobody hunts for chat.
 *
 * Every panel stays mounted while hidden, so chat keeps listening and keeps its
 * scroll position when you look at People and come back.
 *
 * Panels draw their own card and title elsewhere; inside a tab both would be
 * repeated, so the tab strips them (`data-panel-head` marks a panel's title).
 */
export function RoomDock({
  roomId,
  tabs,
  collapsed,
  onCollapsedChange,
}: {
  roomId: string
  tabs: DockTab[]
  /** Folded to a thin rail on desktop (2026-11-10 decision). Phones always show it. */
  collapsed: boolean
  onCollapsedChange: (collapsed: boolean) => void
}) {
  const { t } = useLingui()
  const [current, setCurrent] = useState<string>(() => readTab(roomId) ?? tabs[0]?.id ?? '')

  useEffect(() => {
    setCurrent(readTab(roomId) ?? tabs[0]?.id ?? '')
    // Only when the room changes; a new tab list in the same room keeps the choice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId])

  const active = tabs.some((tab) => tab.id === current) ? current : tabs[0]?.id
  const choose = (id: string) => {
    setCurrent(id)
    try {
      localStorage.setItem(tabKey(roomId), id)
    } catch {
      // Blocked storage: the choice lasts for this visit.
    }
  }

  if (tabs.length === 0) return null

  return (
    <>
      {collapsed && (
        <aside
          aria-label={t`Room panel`}
          className="hidden flex-col items-center gap-2 rounded-surface border border-ktip-sand-100 bg-ktip-cream py-2 shadow-card lg:sticky lg:top-[calc(var(--nav-h)+1rem)] lg:flex"
        >
          <button
            type="button"
            onClick={() => onCollapsedChange(false)}
            aria-label={t`Show the side panel`}
            title={t`Show the side panel`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-control text-ktip-sand-600 hover:bg-ktip-sand-100 hover:text-ktip-sand-900"
          >
            <PanelRightOpen size={17} aria-hidden="true" />
          </button>
          {tabs.map((tab) => {
            const Icon = iconFor(tab.id)
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  choose(tab.id)
                  onCollapsedChange(false)
                }}
                aria-label={tab.label}
                title={tab.label}
                className="inline-flex h-9 w-9 items-center justify-center rounded-control text-ktip-sand-600 hover:bg-ktip-sand-100 hover:text-ktip-sand-900"
              >
                <Icon size={17} aria-hidden="true" />
              </button>
            )
          })}
        </aside>
      )}

      <aside
        aria-label={t`Room panel`}
        className={cn(
          'flex h-[32rem] min-h-0 flex-col overflow-hidden rounded-surface border border-ktip-sand-100 bg-ktip-cream shadow-card lg:sticky lg:top-[calc(var(--nav-h)+1rem)] lg:h-[min(48rem,calc(100svh-var(--nav-h)-2rem))]',
          collapsed && 'lg:hidden'
        )}
      >
        <div role="tablist" aria-label={t`Room panel`} className="flex items-center gap-1 border-b border-ktip-sand-100 bg-ktip-sand-50 p-1.5">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`dock-tab-${tab.id}`}
              aria-selected={tab.id === active}
              aria-controls={`dock-panel-${tab.id}`}
              onClick={() => choose(tab.id)}
              className="flex h-8.5 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-control px-2 text-micro font-extrabold text-ktip-sand-600 transition-colors hover:text-ktip-sand-900 aria-selected:bg-ktip-cream aria-selected:text-ktip-sand-900 aria-selected:shadow-card"
            >
              <span className="min-w-0 truncate">{tab.label}</span>
              {tab.count !== undefined && (
                <span className="shrink-0 font-semibold tabular-nums text-ktip-sand-400">{tab.count}</span>
              )}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onCollapsedChange(true)}
            aria-label={t`Hide the side panel`}
            title={t`Hide the side panel`}
            className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-control text-ktip-sand-500 hover:bg-ktip-sand-100 hover:text-ktip-sand-900 lg:inline-flex"
          >
            <PanelRightClose size={16} aria-hidden="true" />
          </button>
        </div>
        {tabs.map((tab) => (
          <div
            key={tab.id}
            role="tabpanel"
            id={`dock-panel-${tab.id}`}
            aria-labelledby={`dock-tab-${tab.id}`}
            hidden={tab.id !== active}
            // Chat and People arrive inside a tutorial wrapper, so the card to
            // flatten is one level further down for those two.
            className="min-h-0 flex-1 overflow-hidden [&>*]:h-full [&>*]:rounded-none [&>*]:border-0 [&>*]:shadow-none [&>[data-tutorial]>*]:h-full [&>[data-tutorial]>*]:rounded-none [&>[data-tutorial]>*]:border-0 [&>[data-tutorial]>*]:shadow-none [&_[data-panel-head]]:hidden"
          >
            {tab.node}
          </div>
        ))}
      </aside>
    </>
  )
}
