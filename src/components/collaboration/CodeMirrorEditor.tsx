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
  language: Language
  darkMode: boolean
  fontSize?: 'small' | 'medium' | 'large'
  onValueChange?: (value: string) => void
  onMetricsChange?: (metrics: EditorMetrics) => void
  height?: string
}

const fontSizeMap = { small: '12px', medium: '14px', large: '16px' }

function fontSizeTheme(size: 'small' | 'medium' | 'large'): Extension {
  return EditorView.theme({ '&': { fontSize: fontSizeMap[size] } })
}

export function CodeMirrorEditor({
  language,
  darkMode,
  fontSize = 'medium',
  onValueChange,
  onMetricsChange,
  height,
}: CodeMirrorEditorProps) {
  const [code, setCode] = useState('')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Load saved/default code on mount and whenever the language changes
  // (mirrors the original onMount load + reactive language-switch reload).
  useEffect(() => {
    const saved = loadCode(language)
    setCode(saved || defaultCode[language])
  }, [language])

  const handleChange = (value: string) => {
    setCode(value)
    onValueChange?.(value)

    // Debounced save to localStorage
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveCode(language, value)
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
    () => [languageExtensions[language](), EditorView.lineWrapping, fontSizeTheme(fontSize)],
    [language, fontSize]
  )

  return (
    <div className={`w-full overflow-auto ${darkMode ? 'bg-[#282c34]' : 'bg-white'}`}>
      <CodeMirror
        value={code}
        onChange={handleChange}
        onUpdate={handleUpdate}
        theme={darkMode ? oneDark : 'light'}
        extensions={extensions}
        height={height || 'calc(100vh - 16rem)'}
      />
    </div>
  )
}
