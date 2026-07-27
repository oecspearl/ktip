import { Show } from 'solid-js'
import { Eye, X, RefreshCw } from 'lucide-solid'
import type { Language } from './CodeMirrorEditor'

interface PreviewPanelProps {
  code: () => string
  language: () => Language
  darkMode: () => boolean
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

export function PreviewPanel(props: PreviewPanelProps) {
  let iframeRef!: HTMLIFrameElement
  const dark = () => props.darkMode()

  const srcdoc = () => {
    const lang = props.language()
    const src = props.code()
    if (lang === 'html') return src
    if (lang === 'css') return wrapCss(src)
    return ''
  }

  const reload = () => {
    if (iframeRef) {
      // Force re-render by toggling srcdoc
      const content = srcdoc()
      iframeRef.srcdoc = ''
      requestAnimationFrame(() => {
        iframeRef.srcdoc = content
      })
    }
  }

  return (
    <div class={`flex flex-col border-t ${dark() ? 'border-gray-700 bg-[#1e1e1e]' : 'border-ktip-sand-200 bg-white'}`}>
      {/* Header */}
      <div class={`flex items-center justify-between px-3 py-2 border-b ${dark() ? 'border-gray-700' : 'border-ktip-sand-200'}`}>
        <div class="flex items-center gap-2">
          <Eye size={14} class={dark() ? 'text-gray-400' : 'text-ktip-sand-500'} />
          <span class={`text-xs font-medium ${dark() ? 'text-gray-400' : 'text-ktip-sand-600'}`}>
            Preview
          </span>
          <Show when={props.language() === 'css'}>
            <span class={`text-xs ${dark() ? 'text-gray-600' : 'text-ktip-sand-400'}`}>
              (sample HTML)
            </span>
          </Show>
        </div>
        <div class="flex items-center gap-1">
          <button
            type="button"
            onClick={reload}
            class={`p-1 rounded ${dark() ? 'hover:bg-gray-700 text-gray-500' : 'hover:bg-ktip-sand-100 text-ktip-sand-400'} transition-colors`}
            title="Refresh preview"
          >
            <RefreshCw size={12} />
          </button>
          <button
            type="button"
            onClick={props.onClose}
            class={`p-1 rounded ${dark() ? 'hover:bg-gray-700 text-gray-500' : 'hover:bg-ktip-sand-100 text-ktip-sand-400'} transition-colors`}
            title="Close preview"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Iframe */}
      <iframe
        ref={iframeRef!}
        srcdoc={srcdoc()}
        sandbox="allow-scripts"
        class="w-full bg-white"
        style={{ height: '280px', border: 'none' }}
        title="HTML Preview"
      />
    </div>
  )
}
