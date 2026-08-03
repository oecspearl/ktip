import { useRef } from 'react'
import { Eye, X, RefreshCw } from 'lucide-react'
import type { Language } from './CodeMirrorEditor'
import { Trans, useLingui } from '@lingui/react/macro'

interface PreviewPanelProps {
  code: string
  language: Language
  onClose: () => void
}

/** Sample copy shown inside the CSS preview iframe — translated at the call
 * site (a plain string builder has no hook access) and passed in. */
interface CssPreviewCopy {
  title: string
  paragraph: string
  items: [string, string, string]
  button: string
  link: string
}

function wrapCss(css: string, copy: CssPreviewCopy): string {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>${css}</style></head>
<body><h1>${copy.title}</h1><p>${copy.paragraph}</p>
<ul><li>${copy.items[0]}</li><li>${copy.items[1]}</li><li>${copy.items[2]}</li></ul>
<button>${copy.button}</button>
<a href="#">${copy.link}</a></body></html>`
}

export function PreviewPanel({ code, language, onClose }: PreviewPanelProps) {
    const { t } = useLingui()
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const srcdoc =
    language === 'html'
      ? code
      : language === 'css'
        ? wrapCss(code, {
            title: t`Preview`,
            paragraph: t`This is a paragraph of text to demonstrate your CSS styles.`,
            items: [t`List item one`, t`List item two`, t`List item three`],
            button: t`A Button`,
            link: t`A Link`,
          })
        : ''

  const reload = () => {
    const iframe = iframeRef.current
    if (iframe) {
      // Force re-render by toggling srcdoc
      iframe.srcdoc = ''
      requestAnimationFrame(() => {
        iframe.srcdoc = srcdoc
      })
    }
  }

  return (
    <div className="flex flex-col border-t border-ktip-sand-200 bg-ktip-cream">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-ktip-sand-200">
        <div className="flex items-center gap-2">
          <Eye size={14} className="text-ktip-sand-500" />
          <span className="text-xs font-medium text-ktip-sand-600"><Trans>Preview</Trans></span>
          {language === 'css' && <span className="text-xs text-ktip-sand-400"><Trans>(sample HTML)</Trans></span>}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={reload}
            className="p-1 rounded hover:bg-ktip-sand-100 text-ktip-sand-400 transition-colors"
            title={t`Refresh preview`}
          >
            <RefreshCw size={12} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-ktip-sand-100 text-ktip-sand-400 transition-colors"
            title={t`Close preview`}
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Iframe — always white; it renders the user's own page, not app chrome. */}
      <iframe
        ref={iframeRef}
        srcDoc={srcdoc}
        sandbox="allow-scripts"
        className="w-full bg-white"
        style={{ height: '280px', border: 'none' }}
        title={t`HTML Preview`}
      />
    </div>
  )
}
