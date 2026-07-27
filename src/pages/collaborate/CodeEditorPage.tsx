import { useState } from 'react'
import { Link } from 'react-router'
import { CodeMirrorEditor, defaultCode } from '../../components/collaboration/CodeMirrorEditor'
import type { Language, EditorMetrics } from '../../components/collaboration/CodeMirrorEditor'
import { OutputPanel } from '../../components/collaboration/OutputPanel'
import { PreviewPanel } from '../../components/collaboration/PreviewPanel'
import { StatusBar } from '../../components/collaboration/StatusBar'
import { usePageTitle } from '../../hooks/usePageTitle'
import { executeJavaScript, downloadCodeAsFile, clearCode } from '../../lib/code-sandbox-utils'
import type { ConsoleMessage, ExecutionResult } from '../../lib/code-sandbox-utils'
import {
  ChevronRight,
  Sun,
  Moon,
  Play,
  Eye,
  Copy,
  Download,
  RotateCcw,
  Type,
  Check,
  ArrowLeft,
  Pen,
  FileText,
  Video,
} from 'lucide-react'

const languages: { value: Language; label: string }[] = [
  { value: 'javascript', label: 'JavaScript / TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'json', label: 'JSON' },
  { value: 'markdown', label: 'Markdown' },
]

const fontSizes = ['small', 'medium', 'large'] as const
const fontSizeLabels: Record<string, string> = {
  small: 'S',
  medium: 'M',
  large: 'L',
}

export default function CodeEditorPage() {
  usePageTitle('Code Sandbox')

  // Core state
  const [language, setLanguage] = useState<Language>('javascript')
  const [darkMode, setDarkMode] = useState(false)
  const [fontSize, setFontSize] = useState<'small' | 'medium' | 'large'>('medium')
  const [code, setCode] = useState('')

  // Execution state
  const [outputVisible, setOutputVisible] = useState(false)
  const [outputMessages, setOutputMessages] = useState<ConsoleMessage[]>([])
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null)
  const [running, setRunning] = useState(false)

  // Editor metrics
  const [metrics, setMetrics] = useState<EditorMetrics>({
    lineCount: 1,
    charCount: 0,
    cursorLine: 1,
    cursorCol: 1,
  })

  // Preview state (HTML/CSS)
  const [previewVisible, setPreviewVisible] = useState(false)

  // Toast state
  const [copied, setCopied] = useState(false)

  const hasPanel = outputVisible || previewVisible

  // --- Actions ---

  const handleRun = async () => {
    if (language !== 'javascript' || running) return
    setRunning(true)
    setOutputMessages([])
    setExecutionResult(null)
    setOutputVisible(true)

    const result = await executeJavaScript(code)
    setOutputMessages(result.messages)
    setExecutionResult(result)
    setRunning(false)
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback
      const textarea = document.createElement('textarea')
      textarea.value = code
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleDownload = () => {
    downloadCodeAsFile(code, language)
  }

  const handleReset = () => {
    clearCode(language)
    setCode(defaultCode[language])
  }

  const cycleFontSize = () => {
    const idx = fontSizes.indexOf(fontSize)
    setFontSize(fontSizes[(idx + 1) % fontSizes.length])
  }

  const handleClearOutput = () => {
    setOutputMessages([])
    setExecutionResult(null)
  }

  const dark = darkMode

  return (
    <>
      {/* Dark Hero Band */}
      <div className="bg-gray-800 min-h-[140px] flex items-center">
        <div className="max-w-5xl mx-auto px-4 w-full">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">
            Collaboration Tools
          </p>
          <h1 className="text-2xl font-bold text-white mb-2">Code Sandbox</h1>
          <nav className="flex items-center gap-1 text-sm text-gray-400">
            <Link to="/" className="hover:text-white transition-colors">Home</Link>
            <ChevronRight size={14} />
            <Link to="/collaborate" className="hover:text-white transition-colors">Collaborate</Link>
            <ChevronRight size={14} />
            <span className="text-gray-300">Code Sandbox</span>
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="bg-white py-8">
        <div className="max-w-5xl mx-auto px-4">
          {/* Back to hub + cross-links */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4 text-sm">
            <Link
              to="/collaborate"
              className="inline-flex items-center gap-1.5 text-ktip-sand-600 hover:text-ktip-ocean-600 transition-colors font-medium"
            >
              <ArrowLeft size={14} />
              Back to Collaborate Hub
            </Link>
            <span className="text-ktip-sand-300">|</span>
            <Link to="/collaborate/whiteboards" className="inline-flex items-center gap-1.5 text-ktip-sand-500 hover:text-ktip-ocean-600 transition-colors">
              <Pen size={14} />
              Whiteboards
            </Link>
            <Link to="/collaborate/documents" className="inline-flex items-center gap-1.5 text-ktip-sand-500 hover:text-ktip-ocean-600 transition-colors">
              <FileText size={14} />
              Documents
            </Link>
            <Link to="/collaborate/video" className="inline-flex items-center gap-1.5 text-ktip-sand-500 hover:text-ktip-ocean-600 transition-colors">
              <Video size={14} />
              Video
            </Link>
          </div>

          {/* Editor Container */}
          <div
            className={`border overflow-hidden ${
              dark ? 'border-gray-700 bg-[#282c34]' : 'border-gray-200 bg-white'
            }`}
          >
            {/* Toolbar */}
            <div
              className={`flex items-center gap-2 px-3 py-2 border-b flex-wrap ${
                dark
                  ? 'border-gray-700 bg-[#21252b]'
                  : 'border-ktip-sand-200 bg-ktip-sand-50/50'
              }`}
            >
              {/* Language Selector */}
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as Language)}
                className={`px-3 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 ${
                  dark
                    ? 'bg-[#2c313a] border-gray-600 text-gray-300 focus:border-amber-500 focus:ring-amber-500/20'
                    : 'bg-white border-ktip-sand-200 text-ktip-sand-800 focus:border-ktip-ocean-500 focus:ring-ktip-ocean-500/20'
                }`}
              >
                {languages.map((lang) => (
                  <option key={lang.value} value={lang.value}>{lang.label}</option>
                ))}
              </select>

              {/* Separator */}
              <div className={`w-px h-6 ${dark ? 'bg-gray-600' : 'bg-ktip-sand-200'}`} />

              {/* Run (JavaScript only) */}
              {language === 'javascript' && (
                <button
                  type="button"
                  onClick={handleRun}
                  disabled={running}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                    dark
                      ? 'bg-amber-600 hover:bg-amber-500 text-white'
                      : 'bg-amber-500 hover:bg-amber-600 text-white'
                  }`}
                  title="Run code (JavaScript only)"
                >
                  <Play size={14} className={running ? 'animate-pulse' : ''} />
                  {running ? 'Running...' : 'Run'}
                </button>
              )}

              {/* Preview (HTML/CSS) */}
              {(language === 'html' || language === 'css') && (
                <button
                  type="button"
                  onClick={() => setPreviewVisible(!previewVisible)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    previewVisible
                      ? dark
                        ? 'bg-ktip-ocean-600 text-white'
                        : 'bg-ktip-ocean-500 text-white'
                      : dark
                        ? 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                        : 'bg-ktip-sand-100 hover:bg-ktip-sand-200 text-ktip-sand-700'
                  }`}
                  title="Toggle live preview"
                >
                  <Eye size={14} />
                  Preview
                </button>
              )}

              {/* Copy */}
              <button
                type="button"
                onClick={handleCopy}
                className={`inline-flex items-center gap-1.5 p-2 rounded-lg text-sm transition-colors ${
                  dark
                    ? 'hover:bg-gray-700 text-gray-400'
                    : 'hover:bg-ktip-sand-100 text-ktip-sand-600'
                }`}
                title="Copy code"
              >
                {copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
              </button>

              {/* Download */}
              <button
                type="button"
                onClick={handleDownload}
                className={`p-2 rounded-lg text-sm transition-colors ${
                  dark
                    ? 'hover:bg-gray-700 text-gray-400'
                    : 'hover:bg-ktip-sand-100 text-ktip-sand-600'
                }`}
                title="Download file"
              >
                <Download size={16} />
              </button>

              {/* Reset */}
              <button
                type="button"
                onClick={handleReset}
                className={`p-2 rounded-lg text-sm transition-colors ${
                  dark
                    ? 'hover:bg-red-900/30 text-gray-400 hover:text-red-400'
                    : 'hover:bg-red-50 text-ktip-sand-600 hover:text-red-600'
                }`}
                title="Reset to default"
              >
                <RotateCcw size={16} />
              </button>

              {/* Separator */}
              <div className={`w-px h-6 ${dark ? 'bg-gray-600' : 'bg-ktip-sand-200'}`} />

              {/* Font Size */}
              <button
                type="button"
                onClick={cycleFontSize}
                className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-sm transition-colors ${
                  dark
                    ? 'hover:bg-gray-700 text-gray-400'
                    : 'hover:bg-ktip-sand-100 text-ktip-sand-600'
                }`}
                title={`Font size: ${fontSize}`}
              >
                <Type size={14} />
                <span className="text-xs font-medium">{fontSizeLabels[fontSize]}</span>
              </button>

              {/* Dark Mode Toggle */}
              <button
                type="button"
                onClick={() => setDarkMode(!darkMode)}
                className={`p-2 rounded-lg transition-colors ${
                  dark
                    ? 'hover:bg-gray-700 text-gray-400'
                    : 'hover:bg-ktip-sand-100 text-ktip-sand-600'
                }`}
                title={dark ? 'Light mode' : 'Dark mode'}
              >
                {dark ? <Sun size={16} /> : <Moon size={16} />}
              </button>
            </div>

            {/* Code Editor */}
            <CodeMirrorEditor
              language={language}
              darkMode={darkMode}
              fontSize={fontSize}
              onValueChange={setCode}
              onMetricsChange={setMetrics}
              height={hasPanel ? 'calc(100vh - 28rem)' : 'calc(100vh - 16rem)'}
            />

            {/* Output Panel (JavaScript only) */}
            {outputVisible && language === 'javascript' && (
              <OutputPanel
                messages={outputMessages}
                result={executionResult}
                running={running}
                darkMode={darkMode}
                onClear={handleClearOutput}
              />
            )}

            {/* Preview Panel (HTML/CSS) */}
            {previewVisible && (language === 'html' || language === 'css') && (
              <PreviewPanel
                code={code}
                language={language}
                darkMode={darkMode}
                onClose={() => setPreviewVisible(false)}
              />
            )}

            {/* Status Bar */}
            <StatusBar
              metrics={metrics}
              language={language}
              darkMode={darkMode}
            />
          </div>
        </div>
      </div>
    </>
  )
}
