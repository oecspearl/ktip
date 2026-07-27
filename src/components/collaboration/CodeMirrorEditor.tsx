import { createSignal, createEffect, on, onMount } from 'solid-js'
import { createCodeMirror } from 'solid-codemirror'
import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { oneDark } from '@codemirror/theme-one-dark'
import { autocompletion, closeBrackets } from '@codemirror/autocomplete'
import { defaultKeymap, indentWithTab, history, historyKeymap } from '@codemirror/commands'
import { bracketMatching, foldGutter, indentOnInput } from '@codemirror/language'
import {
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  EditorView,
} from '@codemirror/view'
import type { Extension } from '@codemirror/state'
import { loadCode, saveCode } from '../../lib/code-sandbox-utils'

export type Language = 'javascript' | 'python' | 'html' | 'css' | 'json' | 'markdown'

export interface EditorMetrics {
  lineCount: number
  charCount: number
  cursorLine: number
  cursorCol: number
}

const languageExtensions: Record<Language, () => Extension> = {
  javascript: () => javascript({ jsx: true, typescript: true }),
  python,
  html,
  css,
  json: () => json(),
  markdown: () => markdown(),
}

export const defaultCode: Record<Language, string> = {
  javascript: `// JavaScript / TypeScript
function greet(name) {
  console.log(\`Hello, \${name}!\`);
}

greet("Caribbean Innovator");
`,
  python: `# Python
def greet(name):
    print(f"Hello, {name}!")

greet("Caribbean Innovator")
`,
  html: `<!-- HTML -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>KTIP Project</title>
</head>
<body>
  <h1>Hello, Caribbean!</h1>
</body>
</html>
`,
  css: `/* CSS */
body {
  font-family: 'Inter', sans-serif;
  background: linear-gradient(135deg, #0066cc, #00cc99);
  color: white;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
}
`,
  json: `{
  "name": "KTIP Project",
  "version": "1.0.0",
  "description": "Caribbean innovation platform",
  "tags": ["education", "collaboration", "caribbean"]
}
`,
  markdown: `# Welcome to KTIP

## About
KTIP connects Caribbean innovators, educators, and students.

### Features
- Real-time collaboration
- Interactive code sandbox
- Project management
- Community forums

> Building the future of Caribbean innovation together!
`,
}

interface CodeMirrorEditorProps {
  language: () => Language
  darkMode: () => boolean
  fontSize?: () => 'small' | 'medium' | 'large'
  onValueChange?: (value: string) => void
  onMetricsChange?: (metrics: EditorMetrics) => void
  height?: string
}

const fontSizeMap = { small: '12px', medium: '14px', large: '16px' }

function fontSizeTheme(size: 'small' | 'medium' | 'large'): Extension {
  return EditorView.theme({ '&': { fontSize: fontSizeMap[size] } })
}

export function CodeMirrorEditor(props: CodeMirrorEditorProps) {
  const [code, setCode] = createSignal('')
  let saveTimer: ReturnType<typeof setTimeout> | undefined

  onMount(() => {
    const saved = loadCode(props.language())
    setCode(saved || defaultCode[props.language()])
  })

  const { ref, createExtension } = createCodeMirror({
    value: code(),
    onValueChange: (val) => {
      setCode(val)
      props.onValueChange?.(val)

      // Debounced save to localStorage
      clearTimeout(saveTimer)
      saveTimer = setTimeout(() => {
        saveCode(props.language(), val)
      }, 1000)
    },
  })

  // Base extensions
  createExtension(() => keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]))
  createExtension(() => lineNumbers())
  createExtension(() => highlightActiveLine())
  createExtension(() => highlightActiveLineGutter())
  createExtension(() => autocompletion())
  createExtension(() => closeBrackets())
  createExtension(() => bracketMatching())
  createExtension(() => foldGutter())
  createExtension(() => indentOnInput())
  createExtension(() => history())
  createExtension(() => EditorView.lineWrapping)

  // Editor metrics tracking
  createExtension(() =>
    EditorView.updateListener.of((update) => {
      if (update.docChanged || update.selectionSet) {
        const doc = update.state.doc
        const sel = update.state.selection.main
        const line = doc.lineAt(sel.head)
        props.onMetricsChange?.({
          lineCount: doc.lines,
          charCount: doc.length,
          cursorLine: line.number,
          cursorCol: sel.head - line.from + 1,
        })
      }
    })
  )

  // Reactive language
  const reconfigureLanguage = createExtension(languageExtensions[props.language()])
  createEffect(
    on(props.language, (lang) => {
      reconfigureLanguage(languageExtensions[lang]())
      const saved = loadCode(lang)
      setCode(saved || defaultCode[lang])
    }, { defer: true })
  )

  // Reactive dark mode
  const reconfigureTheme = createExtension(props.darkMode() ? oneDark : [])
  createEffect(
    on(props.darkMode, (dark) => {
      reconfigureTheme(dark ? oneDark : [])
    }, { defer: true })
  )

  // Reactive font size
  const reconfigureFontSize = createExtension(
    fontSizeTheme(props.fontSize?.() || 'medium')
  )
  createEffect(
    on(
      () => props.fontSize?.(),
      (size) => reconfigureFontSize(fontSizeTheme(size || 'medium')),
      { defer: true }
    )
  )

  return (
    <div
      ref={ref}
      class={`w-full overflow-auto ${props.darkMode() ? 'bg-[#282c34]' : 'bg-white'}`}
      style={{ height: props.height || 'calc(100vh - 16rem)' }}
    />
  )
}
