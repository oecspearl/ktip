import { useEffect, useId, useMemo, useRef, type ReactNode } from 'react'
import { hasHandler } from '../core/events'
import { focusElement, headingsIn } from '../core/focus'
import { chordLabel, routeChord, type ShortcutAction } from '../core/shortcuts'
import { useA11yContext } from './context'
import { useA11ySettings } from './hooks'
import type { A11yTextKey } from './messages'

const PAGE_ACTIONS: [ShortcutAction, A11yTextKey][] = [
  ['main', 'actionMain'],
  ['nav', 'actionNav'],
  ['search', 'actionSearch'],
  ['nextHeading', 'actionNextHeading'],
  ['prevHeading', 'actionPrevHeading'],
  ['read', 'actionRead'],
  ['voice', 'actionVoice'],
]
const SETTING_ACTIONS: [ShortcutAction, A11yTextKey][] = [
  ['panel', 'actionPanel'],
  ['textUp', 'actionTextUp'],
  ['textDown', 'actionTextDown'],
  ['textReset', 'actionTextReset'],
  ['help', 'actionHelp'],
]

/**
 * Every shortcut, plus the current page's headings as a jump list. A native
 * modal <dialog>: the browser traps focus, closes on Escape and returns focus
 * to where it was, with nothing for the kit to get wrong.
 */
export function ShortcutsDialog({ onClose, available }: { onClose: () => void; available?: ShortcutAction[] }) {
  const { options, messages: m, store } = useA11yContext()
  const { shortcuts } = useA11ySettings(store)
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const mac = useMemo(() => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent), [])

  // Snapshot of the page behind, taken before the dialog covers it
  const headings = useMemo(() => {
    const main = document.querySelector(options.targets.main) ?? document
    return headingsIn(main).map((el) => ({ el, level: Number(el.tagName[1]), text: el.textContent?.trim() ?? '' }))
  }, [options.targets.main])

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (typeof dialog.showModal === 'function') dialog.showModal()
    else dialog.setAttribute('open', '')
    const close = () => onClose()
    dialog.addEventListener('close', close)
    return () => dialog.removeEventListener('close', close)
  }, [onClose])

  const shows = (a: ShortcutAction) =>
    (!available || available.includes(a)) &&
    (a !== 'search' || !!options.onSearch) &&
    // The reader and voice register themselves when they exist on this page
    ((a !== 'read' && a !== 'voice') || hasHandler(a))
  const row = (keys: string, label: string) => (
    <tr key={keys + label}>
      <th scope="row">
        <kbd>{keys}</kbd>
      </th>
      <td>{label}</td>
    </tr>
  )
  const table = (caption: string, rows: ReactNode[]) =>
    rows.length > 0 && (
      <table className="ak-keys">
        <caption>{caption}</caption>
        <tbody>{rows}</tbody>
      </table>
    )

  return (
    <dialog ref={ref} className="ak-dialog" aria-labelledby={titleId}>
      <div className="ak-panel-head">
        <h2 className="ak-panel-title" id={titleId}>
          {m.shortcutsTitle}
        </h2>
        <button type="button" className="ak-icon-btn" aria-label={m.close} onClick={() => ref.current?.close()}>
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <div className="ak-panel-body ak-dialog-body">
        <p className="ak-hint">{m.shortcutsIntro}</p>
        {table(
          m.groupPages,
          options.routes.filter((r) => r.digit).map((r) => row(chordLabel(routeChord(r.digit!), mac), r.label))
        )}
        {table(
          m.groupPage,
          PAGE_ACTIONS.filter(([a]) => shows(a)).map(([a, label]) => row(chordLabel(options.chords[a], mac), m[label]))
        )}
        {table(
          m.groupSettings,
          SETTING_ACTIONS.filter(([a]) => shows(a)).map(([a, label]) => row(chordLabel(options.chords[a], mac), m[label]))
        )}
        {shortcuts === 'all' &&
          table(m.groupSingle, [
            row('?', m.singleHelp),
            ...options.routes.filter((r) => r.seq).map((r) => row(`g ${r.seq}`, m.singleGo(r.label))),
          ])}
        {table(
          m.groupSite,
          options.extraShortcuts.map((s) => row(s.keys, s.label))
        )}

        <h3 className="ak-section-title">{m.headingsHere}</h3>
        {headings.length === 0 ? (
          <p className="ak-hint">{m.noHeadings}</p>
        ) : (
          <ul className="ak-jump">
            {headings.map((h, i) => (
              <li key={i} style={{ paddingInlineStart: `${(h.level - 1) * 0.75}rem` }}>
                <button
                  type="button"
                  className="ak-link-btn"
                  onClick={() => {
                    ref.current?.close()
                    // After the dialog hands focus back, so this one sticks
                    setTimeout(() => focusElement(h.el), 0)
                  }}
                >
                  {h.text}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </dialog>
  )
}
