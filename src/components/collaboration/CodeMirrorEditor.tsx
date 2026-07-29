import { useEffect, useMemo, useRef, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { EditorView } from '@codemirror/view'
import type { ViewUpdate } from '@codemirror/view'
import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { oneDark } from '@codemirror/theme-one-dark'
import type { Extension } from '@codemirror/state'
import { loadCode, saveCode } from '../../lib/code-sandbox-utils'
import { useThemeMode } from '../../hooks/useThemeMode'

export type Language = 'javascript' | 'python' | 'html' | 'css' | 'json' | 'markdown'

export interface EditorMetrics {
  lineCount: number
  charCount: number
  cursorLine: number
  cursorCol: number
}

const languageExtensions: Record<Language, () => Extension> = {
  javascript: () => javascript({ jsx: true, typescript: true }),
  python: () => python(),
  html: () => html(),
  css: () => css(),
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
  background: linear-gradient(135deg, #041E42, #97D700);
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
  language: Language
  /** Controlled content. When omitted the editor falls back to its local draft. */
  value?: string
  fontSize?: 'small' | 'medium' | 'large'
  onValueChange?: (value: string) => void
  onMetricsChange?: (metrics: EditorMetrics) => void
  height?: string
  readOnly?: boolean
  /** Seeds an uncontrolled editor from localStorage. Off for DB-backed snippets. */
  useLocalDraft?: boolean
}

const fontSizeMap = { small: '12px', medium: '14px', large: '16px' }

function fontSizeTheme(size: 'small' | 'medium' | 'large'): Extension {
  return EditorView.theme({ '&': { fontSize: fontSizeMap[size] } })
}

export function CodeMirrorEditor({
  language,
  value,
  fontSize = 'medium',
  onValueChange,
  onMetricsChange,
  height,
  readOnly = false,
  useLocalDraft = false,
}: CodeMirrorEditorProps) {
  const [darkMode] = useThemeMode()
  const [localCode, setLocalCode] = useState('')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const controlled = value !== undefined
  const code = controlled ? value : localCode

  // Uncontrolled mode only: seed from the localStorage draft (or the language
  // template) on mount and on every language switch.
  useEffect(() => {
    if (controlled || !useLocalDraft) return
    const saved = loadCode(language)
    setLocalCode(saved || defaultCode[language])
  }, [language, controlled, useLocalDraft])

  const handleChange = (next: string) => {
    if (!controlled) setLocalCode(next)
    onValueChange?.(next)

    if (!useLocalDraft) return
    // Debounced save to localStorage
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveCode(language, next)
    }, 1000)
  }

  const handleUpdate = (viewUpdate: ViewUpdate) => {
    if (viewUpdate.docChanged || viewUpdate.selectionSet) {
      const doc = viewUpdate.state.doc
      const sel = viewUpdate.state.selection.main
      const line = doc.lineAt(sel.head)
      onMetricsChange?.({
        lineCount: doc.lines,
        charCount: doc.length,
        cursorLine: line.number,
        cursorCol: sel.head - line.from + 1,
      })
    }
  }

  // Memoized so identical language/fontSize renders don't force CodeMirror to
  // reconfigure its extensions compartment on every unrelated re-render.
  const extensions = useMemo(
    () => [
      languageExtensions[language](),
      EditorView.lineWrapping,
      fontSizeTheme(fontSize),
      EditorView.editable.of(!readOnly),
    ],
    [language, fontSize, readOnly]
  )

  return (
    <div className="w-full overflow-auto bg-ktip-cream">
      <CodeMirror
        value={code}
        onChange={handleChange}
        onUpdate={handleUpdate}
        theme={darkMode ? oneDark : 'light'}
        extensions={extensions}
        readOnly={readOnly}
        height={height || 'calc(100vh - 16rem)'}
      />
    </div>
  )
}
