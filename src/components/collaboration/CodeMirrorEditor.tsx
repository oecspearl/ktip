import { useEffect, useMemo, useRef, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { EditorView } from '@codemirror/view'
import type { ViewUpdate } from '@codemirror/view'
import type { Extension } from '@codemirror/state'
import { loadCode, saveCode } from '../../lib/code-sandbox-utils'
import { useThemeMode } from '../../hooks/useThemeMode'
import { defaultCode, type Language } from './code-templates'

// Re-exported so existing imports of the editor keep working. Anything that
// only needs the templates should import code-templates directly, or it pulls
// the editor in with them.
export { defaultCode, type Language }

export interface EditorMetrics {
  lineCount: number
  charCount: number
  cursorLine: number
  cursorCol: number
}

/**
 * One dynamic import per language pack, fetched when that language is first
 * shown.
 *
 * Imported statically, all six packs rode in this chunk whatever was being
 * edited — lang-html alone drags in the CSS and JavaScript parsers, and a
 * Python snippet needed none of it. A switch now costs one small fetch the
 * first time; the editor shows plain text for that moment, then highlights.
 */
const languageLoaders: Record<Language, () => Promise<Extension>> = {
  javascript: () =>
    import('@codemirror/lang-javascript').then((m) => m.javascript({ jsx: true, typescript: true })),
  python: () => import('@codemirror/lang-python').then((m) => m.python()),
  html: () => import('@codemirror/lang-html').then((m) => m.html()),
  css: () => import('@codemirror/lang-css').then((m) => m.css()),
  json: () => import('@codemirror/lang-json').then((m) => m.json()),
  markdown: () => import('@codemirror/lang-markdown').then((m) => m.markdown()),
}

/**
 * Packs already built, so switching back to a language is synchronous rather
 * than a flash of plain text while an already-settled promise resolves. An
 * extension is a value, not editor state, so one instance serves every editor.
 */
const loadedLanguages = new Map<Language, Extension>()

/**
 * The active language's extension, or null while its pack is on the wire.
 *
 * A failed import is not cached — the next switch to that language tries again
 * — and leaves the editor as plain text, which is still a working editor.
 */
function useLanguageExtension(language: Language): Extension | null {
  const [, setLoaded] = useState(0)

  useEffect(() => {
    if (loadedLanguages.has(language)) return
    let cancelled = false
    languageLoaders[language]()
      .then((extension) => {
        loadedLanguages.set(language, extension)
        // Only a re-render is needed: the value is read from the map below,
        // so a late arrival for a language no longer shown changes nothing.
        if (!cancelled) setLoaded((n) => n + 1)
      })
      .catch(() => {
        // Plain text until the next attempt.
      })
    return () => {
      cancelled = true
    }
  }, [language])

  return loadedLanguages.get(language) ?? null
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

  const languageExtension = useLanguageExtension(language)

  // Memoized so identical language/fontSize renders don't force CodeMirror to
  // reconfigure its extensions compartment on every unrelated re-render.
  const extensions = useMemo(
    () => [
      ...(languageExtension ? [languageExtension] : []),
      EditorView.lineWrapping,
      fontSizeTheme(fontSize),
      EditorView.editable.of(!readOnly),
    ],
    [languageExtension, fontSize, readOnly]
  )

  return (
    <div className="w-full overflow-auto bg-ktip-cream">
      <CodeMirror
        value={code}
        onChange={handleChange}
        onUpdate={handleUpdate}
        // 'dark' is the library's own One Dark. @uiw/react-codemirror imports
        // @codemirror/theme-one-dark itself for exactly this option, so the
        // theme ships with the editor whatever this file does; importing it
        // here too only added a second reference to the same module.
        theme={darkMode ? 'dark' : 'light'}
        extensions={extensions}
        readOnly={readOnly}
        height={height || 'calc(100svh - 16rem)'}
      />
    </div>
  )
}
