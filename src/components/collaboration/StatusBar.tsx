import type { EditorMetrics, Language } from './CodeMirrorEditor'

const LANGUAGE_LABELS: Record<Language, string> = {
  javascript: 'JavaScript',
  python: 'Python',
  html: 'HTML',
  css: 'CSS',
  json: 'JSON',
  markdown: 'Markdown',
}

interface StatusBarProps {
  metrics: EditorMetrics
  language: Language
  darkMode: boolean
}

export function StatusBar({ metrics, language, darkMode }: StatusBarProps) {
  return (
    <div
      className={`flex items-center justify-between px-4 py-1.5 text-xs font-mono border-t ${
        darkMode
          ? 'bg-[#21252b] text-gray-500 border-gray-700'
          : 'bg-ktip-sand-50/50 text-ktip-sand-500 border-ktip-sand-200'
      }`}
    >
      <div className="flex items-center gap-4">
        <span>Ln {metrics.cursorLine}, Col {metrics.cursorCol}</span>
      </div>
      <div className="flex items-center gap-4">
        <span>{metrics.lineCount} lines</span>
        <span>{metrics.charCount} chars</span>
        <span className={darkMode ? 'text-gray-400' : 'text-ktip-sand-600'}>
          {LANGUAGE_LABELS[language]}
        </span>
      </div>
    </div>
  )
}
