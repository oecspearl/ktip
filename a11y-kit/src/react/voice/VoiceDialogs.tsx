import { useEffect, useId, useRef, type ReactNode } from 'react'
import { PHRASES } from '../../core/voice/phrases'
import { useA11yContext } from '../context'

/** A native modal dialog: focus trap, Escape and focus return come with it. */
function NativeDialog({
  title,
  onClose,
  children,
  className,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (typeof d.showModal === 'function') d.showModal()
    else d.setAttribute('open', '')
    d.addEventListener('close', onClose)
    return () => d.removeEventListener('close', onClose)
  }, [onClose])
  return (
    <dialog ref={ref} className={['ak-dialog', className].filter(Boolean).join(' ')} aria-labelledby={titleId} data-a11y-voice-ui>
      <div className="ak-panel-head">
        <h2 className="ak-panel-title" id={titleId}>
          {title}
        </h2>
      </div>
      <div className="ak-panel-body ak-dialog-body">{children}</div>
    </dialog>
  )
}

/**
 * Asked once per device, before the first listen. Says plainly who hears the
 * audio, because it is not this site.
 */
export function VoiceConsentDialog({ onAnswer }: { onAnswer: (yes: boolean) => void }) {
  const { messages: m } = useA11yContext()
  const answered = useRef(false)
  const answer = (yes: boolean) => {
    if (answered.current) return
    answered.current = true
    onAnswer(yes)
  }
  return (
    <NativeDialog title={m.voiceConsentTitle} onClose={() => answer(false)}>
      <p className="ak-dialog-text">{m.voiceConsentBody}</p>
      <p className="ak-hint">{m.voiceConsentMic}</p>
      <div className="ak-dialog-actions">
        <button type="button" className="ak-btn" onClick={() => answer(false)}>
          {m.voiceConsentNo}
        </button>
        <button type="button" className="ak-btn ak-btn-primary" onClick={() => answer(true)}>
          {m.voiceConsentYes}
        </button>
      </div>
    </NativeDialog>
  )
}

/** Examples in the page's own language, from the phrase table the parser uses. */
export function VoiceHelpDialog({ onClose, lang }: { onClose: () => void; lang: string }) {
  const { messages: m, options } = useA11yContext()
  const t = PHRASES[lang.toLowerCase().split('-')[0]] ?? PHRASES.en
  const page = options.routes[2]?.label ?? options.routes[0]?.label ?? 'help'
  const fill = (p: string, x: string) => `“${p.replace('{x}', x).replace('{n}', '3')}”`
  const rows: [string, string][] = [
    [m.voiceHelpPages, fill(t.navigate[0], page.toLowerCase())],
    [m.voiceHelpClick, fill(t.click[0], m.voiceHelpClickExample)],
    [m.voiceHelpNumbers, `${fill(t.showNumbers[0], '')}, ${fill(t.clickNumber[0], '')}`],
    [m.voiceHelpScroll, `${fill(t.scrollDown[0], '')}, ${fill(t.top[0], '')}`],
    [m.voiceHelpRead, `${fill(t.readPage[0], '')}, ${fill(t.pause[0], '')}, ${fill(t.stop[0], '')}`],
    [m.voiceHelpText, `${fill(t.textUp[0], '')}, ${fill(t.textDown[0], '')}`],
    [m.voiceHelpSearch, fill(t.search[0], m.voiceHelpSearchExample)],
    [m.voiceHelpBack, fill(t.back[0], '')],
    [m.voiceHelpSleep, fill(t.sleep[0], '')],
  ]
  return (
    <NativeDialog title={m.voiceHelpTitle} onClose={onClose}>
      <p className="ak-hint">{m.voiceHelpIntro}</p>
      <table className="ak-keys ak-voice-help">
        <tbody>
          {rows.map(([what, say]) => (
            <tr key={what}>
              <th scope="row">{what}</th>
              <td lang={lang}>{say}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ak-dialog-actions">
        <form method="dialog">
          <button className="ak-btn ak-btn-primary">{m.close}</button>
        </form>
      </div>
    </NativeDialog>
  )
}
