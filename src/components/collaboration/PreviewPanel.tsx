import { useRef } from 'react'
import { Eye, X, RefreshCw } from 'lucide-react'
import type { Language } from './CodeMirrorEditor'

interface PreviewPanelProps {
  code: string
  language: Language
  onClose: () => void
}

function wrapCss(css: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>${css}</style></head>
<body><h1>Preview</h1><p>This is a paragraph of text to demonstrate your CSS styles.</p>
<ul><li>List item one</li><li>List item two</li><li>List item three</li></ul>
<button>A Button</button>
<a href="#">A Link</a></body></html>`
}

export function PreviewPanel({ code, language, onClose }: PreviewPanelProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const srcdoc = language === 'html' ? code : language === 'css' ? wrapCss(code) : ''

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
          <span className="text-xs font-medium text-ktip-sand-600">Preview</span>
          {language === 'css' && <span className="text-xs text-ktip-sand-400">(sample HTML)</span>}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={reload}
            className="p-1 rounded hover:bg-ktip-sand-100 text-ktip-sand-400 transition-colors"
            title="Refresh preview"
          >
            <RefreshCw size={12} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-ktip-sand-100 text-ktip-sand-400 transition-colors"
            title="Close preview"
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
        title="HTML Preview"
      />
    </div>
  )
}
