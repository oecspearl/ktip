import type { Language } from '../components/collaboration/CodeMirrorEditor'
import { msg } from '@lingui/core/macro'
// Not a component — the singleton is the same instance LanguageProvider activates.
import { i18n } from '@lingui/core'

// --- Types ---

export interface ConsoleMessage {
  id: number
  type: 'log' | 'warn' | 'error' | 'info'
  content: string[]
  timestamp: number
}

export interface ExecutionResult {
  success: boolean
  messages: ConsoleMessage[]
  error?: { message: string; stack?: string }
  executionTime: number
}

// --- JavaScript Execution (sandboxed iframe) ---

// Static iframe HTML — user code is NOT embedded here. Instead, the iframe
// listens for a 'execute' postMessage containing the code, then evals it.
// This avoids issues with special characters (backticks, </script>, etc.)
// breaking the HTML when interpolated into a template literal.
const SANDBOX_HTML = [
  '<!DOCTYPE html><html><head><meta charset="UTF-8">',
  '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'">',
  '</head><body><script>',
  '(function(){',
  "['log','warn','error','info'].forEach(function(m){",
  'var orig=console[m];',
  'console[m]=function(){',
  'var args=Array.prototype.slice.call(arguments).map(function(a){',
  "try{return typeof a==='object'?JSON.stringify(a,null,2):String(a)}",
  'catch(e){return String(a)}',
  '});',
  "window.parent.postMessage({type:'console',method:m,args:args,timestamp:Date.now()},'*');",
  'orig.apply(console,arguments);',
  '};',
  '});',
  "window.addEventListener('message',function(e){",
  "if(e.data&&e.data.type==='execute'){",
  'try{(0,eval)(e.data.code);}',
  "catch(err){window.parent.postMessage({type:'error',message:err.message,stack:err.stack,timestamp:Date.now()},'*');}",
  "window.parent.postMessage({type:'complete',timestamp:Date.now()},'*');",
  '}',
  '});',
  "window.parent.postMessage({type:'ready'},'*');",
  '})();',
  '</' + 'script></body></html>',
].join('\n')

export function executeJavaScript(code: string): Promise<ExecutionResult> {
  return new Promise((resolve) => {
    const startTime = Date.now()
    const messages: ConsoleMessage[] = []
    let messageId = 0
    let error: ExecutionResult['error'] | undefined
    let resolved = false

    const iframe = document.createElement('iframe')
    iframe.sandbox.add('allow-scripts')
    iframe.style.display = 'none'
    iframe.srcdoc = SANDBOX_HTML

    const cleanup = () => {
      window.removeEventListener('message', handler)
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
    }

    const finish = () => {
      if (resolved) return
      resolved = true
      cleanup()
      resolve({
        success: !error,
        messages,
        error,
        executionTime: Date.now() - startTime,
      })
    }

    const handler = (event: MessageEvent) => {
      const data = event.data
      if (!data || typeof data !== 'object' || !data.type) return
      if (data.type === 'ready') {
        // Iframe boilerplate loaded — send user code for execution
        iframe.contentWindow?.postMessage({ type: 'execute', code }, '*')
      } else if (data.type === 'console') {
        messages.push({
          id: messageId++,
          type: data.method,
          content: data.args,
          timestamp: data.timestamp,
        })
      } else if (data.type === 'error') {
        error = { message: data.message, stack: data.stack }
      } else if (data.type === 'complete') {
        finish()
      }
    }

    window.addEventListener('message', handler)

    // 5-second timeout for infinite loops
    setTimeout(() => {
      if (!resolved) {
        error = { message: i18n._(msg`Execution timeout (5s limit)`) }
        finish()
      }
    }, 5000)

    document.body.appendChild(iframe)
  })
}

// --- localStorage Persistence ---

const STORAGE_PREFIX = 'ktip_sandbox_'

export function saveCode(language: Language, code: string): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${language}`, code)
  } catch { /* quota exceeded or unavailable */ }
}

export function loadCode(language: Language): string | null {
  try {
    return localStorage.getItem(`${STORAGE_PREFIX}${language}`)
  } catch {
    return null
  }
}

export function clearCode(language: Language): void {
  try {
    localStorage.removeItem(`${STORAGE_PREFIX}${language}`)
  } catch { /* ignore */ }
}

// --- File Download ---

const FILE_EXTENSIONS: Record<Language, string> = {
  javascript: 'js',
  python: 'py',
  html: 'html',
  css: 'css',
  json: 'json',
  markdown: 'md',
}

const MIME_TYPES: Record<Language, string> = {
  javascript: 'text/javascript',
  python: 'text/x-python',
  html: 'text/html',
  css: 'text/css',
  json: 'application/json',
  markdown: 'text/markdown',
}

export function downloadCodeAsFile(code: string, language: Language): void {
  const ext = FILE_EXTENSIONS[language]
  const mime = MIME_TYPES[language]
  const blob = new Blob([code], { type: mime })
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = `code.${ext}`
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)

  setTimeout(() => URL.revokeObjectURL(url), 100)
}

export function getFileExtension(language: Language): string {
  return FILE_EXTENSIONS[language]
}
