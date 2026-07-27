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
  metrics: () => EditorMetrics
  language: () => Language
  darkMode: () => boolean
}

export function StatusBar(props: StatusBarProps) {
  const dark = () => props.darkMode()
  const m = () => props.metrics()

  return (
    <div
      class={`flex items-center justify-between px-4 py-1.5 text-xs font-mono border-t ${
        dark()
          ? 'bg-[#21252b] text-gray-500 border-gray-700'
          : 'bg-ktip-sand-50/50 text-ktip-sand-500 border-ktip-sand-200'
      }`}
    >
      <div class="flex items-center gap-4">
        <span>Ln {m().cursorLine}, Col {m().cursorCol}</span>
      </div>
      <div class="flex items-center gap-4">
        <span>{m().lineCount} lines</span>
        <span>{m().charCount} chars</span>
        <span class={dark() ? 'text-gray-400' : 'text-ktip-sand-600'}>
          {LANGUAGE_LABELS[props.language()]}
        </span>
      </div>
    </div>
  )
}
