import { useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { useLingui } from '@lingui/react/macro'

export interface ProfileTab<K extends string> {
  key: K
  label: string
}

/**
 * The segmented control under the hero: a black pill slides to the active
 * tab. A real tablist — arrow keys, Home and End move between tabs, and only
 * the active tab is in the tab order — with one panel whose content
 * re-animates on every change (keyed by the caller).
 */
export function ProfileTabs<K extends string>({
  tabs,
  active,
  onChange,
  status,
  idBase,
  children,
}: {
  tabs: ProfileTab<K>[]
  active: K
  onChange: (key: K) => void
  /** Right of the tabs on wide screens — where they are, when they joined. */
  status?: ReactNode
  idBase: string
  children: ReactNode
}) {
  const { t } = useLingui()
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const index = Math.max(0, tabs.findIndex((tab) => tab.key === active))

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const last = tabs.length - 1
    const next =
      e.key === 'ArrowRight'
        ? index === last
          ? 0
          : index + 1
        : e.key === 'ArrowLeft'
          ? index === 0
            ? last
            : index - 1
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : null
    if (next === null) return
    e.preventDefault()
    onChange(tabs[next].key)
    refs.current[next]?.focus()
  }

  return (
    <>
      <div className="pf-tabrow">
        <div className="pf-tabs-scroll">
          <div
            className="pf-tabs"
            role="tablist"
            aria-label={t`Profile sections`}
            style={{ '--i': index, '--n': tabs.length } as CSSProperties}
          >
            <span className="pf-ind" aria-hidden="true" />
            {tabs.map((tab, i) => (
              <button
                key={tab.key}
                ref={(el) => {
                  refs.current[i] = el
                }}
                type="button"
                role="tab"
                id={`${idBase}-tab-${tab.key}`}
                aria-controls={`${idBase}-panel`}
                aria-selected={tab.key === active}
                tabIndex={tab.key === active ? 0 : -1}
                className="pf-tab"
                onClick={() => onChange(tab.key)}
                onKeyDown={onKeyDown}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        {status && <p className="pf-status">{status}</p>}
      </div>
      <div
        className="pf-panel"
        role="tabpanel"
        id={`${idBase}-panel`}
        aria-labelledby={`${idBase}-tab-${active}`}
        key={active}
      >
        {children}
      </div>
    </>
  )
}
