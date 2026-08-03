import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { CodeMirrorEditor, defaultCode } from '../../components/collaboration/CodeMirrorEditor'
import type { Language, EditorMetrics } from '../../components/collaboration/CodeMirrorEditor'
import { OutputPanel } from '../../components/collaboration/OutputPanel'
import { PreviewPanel } from '../../components/collaboration/PreviewPanel'
import { ShareEntityModal } from '../../components/collaboration/ShareEntityModal'
import { usePageTitle } from '../../hooks/usePageTitle'
import { useThemeMode } from '../../hooks/useThemeMode'
import { useToolAutoSave } from '../../hooks/useToolAutoSave'
import {
  useSnippet,
  useSnippetPermission,
  useCreateSnippet,
  useUpdateSnippet,
} from '../../hooks/useSnippets'
import { useAuth } from '../../contexts/AuthContext'
import { executeJavaScript, downloadCodeAsFile } from '../../lib/code-sandbox-utils'
import type { ConsoleMessage, ExecutionResult } from '../../lib/code-sandbox-utils'
import { ToolPanelShell, ToolNotFound } from '../../components/ui/ToolPanelShell'
import { ToolTitleInput } from '../../components/ui/ToolTitleInput'
import { ToolStatusBar, StatusMetric, SaveIndicator } from '../../components/ui/ToolStatusBar'
import {
  Toolbar,
  ToolbarButton,
  ToolbarSelect,
  ToolbarSeparator,
  ToolbarSpacer,
} from '../../components/ui/Toolbar'
import { truncate } from '../../lib/utils'
import {
  Sun,
  Moon,
  Play,
  Eye,
  Copy,
  Download,
  RotateCcw,
  Type,
  Check,
  Save,
  Share2,
} from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'

const languages: { value: Language; label: MessageDescriptor }[] = [
  { value: 'javascript', label: msg`JavaScript / TypeScript` },
  { value: 'python', label: msg`Python` },
  { value: 'html', label: msg`HTML` },
  { value: 'css', label: msg`CSS` },
  { value: 'json', label: msg`JSON` },
  { value: 'markdown', label: msg`Markdown` },
]

const LANGUAGE_LABELS: Record<Language, string> = {
  javascript: 'JavaScript',
  python: 'Python',
  html: 'HTML',
  css: 'CSS',
  json: 'JSON',
  markdown: 'Markdown',
}

const fontSizes = ['small', 'medium', 'large'] as const
const fontSizeLabels: Record<string, string> = { small: 'S', medium: 'M', large: 'L' }

export default function CodeEditorPage() {
    const { t, i18n } = useLingui()
  const params = useParams()
  const navigate = useNavigate()
  const auth = useAuth()
  const isNew = !params.id

  const [darkMode, setDarkMode] = useThemeMode()

  // Core state
  const [snippetId, setSnippetId] = useState<string | undefined>(params.id)
  const [title, setTitle] = useState(t`Untitled Snippet`)
  const [language, setLanguage] = useState<Language>('javascript')
  const [code, setCode] = useState(defaultCode.javascript)
  const [fontSize, setFontSize] = useState<'small' | 'medium' | 'large'>('medium')
  const [contentLoaded, setContentLoaded] = useState(false)

  // Execution state
  const [outputVisible, setOutputVisible] = useState(false)
  const [outputMessages, setOutputMessages] = useState<ConsoleMessage[]>([])
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null)
  const [running, setRunning] = useState(false)
  const [previewVisible, setPreviewVisible] = useState(false)
  const [copied, setCopied] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)

  const [metrics, setMetrics] = useState<EditorMetrics>({
    lineCount: 1,
    charCount: 0,
    cursorLine: 1,
    cursorCol: 1,
  })

  // DB hooks
  const { snippet: dbSnippet, error: dbSnippetError } = useSnippet(params.id)
  const { permission: sharePermission } = useSnippetPermission(params.id)
  const { createSnippet } = useCreateSnippet()
  const { updateSnippet } = useUpdateSnippet()

  const isOwner = isNew
    ? true
    : !dbSnippet || !auth.user?.id
      ? true
      : dbSnippet.owner_id === auth.user.id
  const canEdit = isOwner || sharePermission === 'edit'

  usePageTitle(title || t`Code Sandbox`)

  useEffect(() => {
    if (dbSnippet && !contentLoaded) {
      setTitle(dbSnippet.title)
      setLanguage(dbSnippet.language as Language)
      setCode(dbSnippet.content || '')
      setSnippetId(dbSnippet.id)
      setContentLoaded(true)
    }
  }, [dbSnippet, contentLoaded])

  // Refs so the autosave closure always persists the latest editor state.
  const snippetIdRef = useRef(snippetId)
  const titleRef = useRef(title)
  const codeRef = useRef(code)
  const languageRef = useRef(language)
  snippetIdRef.current = snippetId
  titleRef.current = title
  codeRef.current = code
  languageRef.current = language

  const { status, lastSavedAt, schedule, saveNow } = useToolAutoSave({
    enabled: canEdit,
    save: async () => {
      const currentId = snippetIdRef.current
      if (currentId) {
        await updateSnippet(currentId, {
          title: titleRef.current,
          language: languageRef.current,
          content: codeRef.current,
        })
      } else {
        const created = await createSnippet({
          title: titleRef.current,
          language: languageRef.current,
          content: codeRef.current,
        })
        setSnippetId(created.id)
        snippetIdRef.current = created.id
        navigate(`/collaborate/code/${created.id}`, { replace: true })
      }
    },
  })

  const handleCodeChange = (next: string) => {
    setCode(next)
    schedule()
  }

  const handleLanguageChange = (next: Language) => {
    setLanguage(next)
    // Only seed a template into an untouched new snippet — never clobber
    // code the user (or the database) already has.
    if (isNew && !code.trim()) setCode(defaultCode[next])
    schedule()
  }

  const handleTitleCommit = () => {
    if (snippetId && canEdit) updateSnippet(snippetId, { title }).catch(() => {})
  }

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
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = code
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleReset = () => {
    setCode(defaultCode[language])
    schedule()
  }

  const cycleFontSize = () => {
    const idx = fontSizes.indexOf(fontSize)
    setFontSize(fontSizes[(idx + 1) % fontSizes.length])
  }

  const hasPanel = outputVisible || previewVisible
  const notFound = !isNew && !!dbSnippetError

  return (
    <>
      <ToolPanelShell
        tool="code"
        imageSeed="code"
        title={
          <ToolTitleInput
            value={title}
            onChange={setTitle}
            onCommit={handleTitleCommit}
            readOnly={!canEdit}
            placeholder={t`Untitled Snippet`}
          />
        }
        breadcrumb={[
          { label: t`Home`, href: '/' },
          { label: t`Collaborate`, href: '/collaborate' },
          { label: t`Code`, href: '/collaborate/snippets' },
          { label: truncate(title, 20) },
        ]}
        heroBadge={
          !isOwner && (
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${
                canEdit
                  ? 'bg-ktip-ocean-500/20 text-ktip-ocean-300 border-ktip-ocean-500/30'
                  : 'bg-ktip-sun-500/20 text-ktip-sun-300 border-ktip-sun-500/30'
              }`}
            >
              {canEdit ? t`Editor — Shared with you` : t`View Only — Shared with you`}
            </span>
          )
        }
        fallback={
          notFound ? (
            <ToolNotFound
              what={t`Snippet`}
              backHref="/collaborate/snippets"
              backLabel={t`Back to My Snippets`}
            />
          ) : undefined
        }
        toolbar={
          <Toolbar>
            <ToolbarSelect
              value={language}
              onChange={(e) => handleLanguageChange(e.target.value as Language)}
              disabled={!canEdit}
              aria-label={t`Language`}
            >
              {languages.map((lang) => (
                <option key={lang.value} value={lang.value}>
                  {i18n._(lang.label)}
                </option>
              ))}
            </ToolbarSelect>

            <ToolbarSeparator />

            {language === 'javascript' && (
              <ToolbarButton
                icon={<Play size={14} className={running ? 'animate-pulse' : ''} />}
                label={running ? t`Running…` : t`Run`}
                variant="accent"
                onClick={handleRun}
                disabled={running}
                title={t`Run code (JavaScript only)`}
              />
            )}

            {(language === 'html' || language === 'css') && (
              <ToolbarButton
                icon={<Eye size={14} />}
                label={t`Preview`}
                active={previewVisible}
                onClick={() => setPreviewVisible(!previewVisible)}
                title={t`Toggle live preview`}
              />
            )}

            <ToolbarButton
              icon={
                copied ? (
                  <Check size={16} className="text-ktip-tropical-700 dark:text-ktip-tropical-500" />
                ) : (
                  <Copy size={16} />
                )
              }
              onClick={handleCopy}
              title={t`Copy code`}
              aria-label={t`Copy code`}
            />
            <ToolbarButton
              icon={<Download size={16} />}
              onClick={() => downloadCodeAsFile(code, language)}
              title={t`Download file`}
              aria-label={t`Download file`}
            />
            <ToolbarButton
              icon={<RotateCcw size={16} />}
              variant="danger"
              onClick={handleReset}
              disabled={!canEdit}
              title={t`Reset to the language template`}
              aria-label={t`Reset code`}
            />

            <ToolbarSeparator />

            <ToolbarButton
              icon={<Type size={14} />}
              label={<span className="text-xs">{fontSizeLabels[fontSize]}</span>}
              onClick={cycleFontSize}
              title={t`Font size: ${fontSize}`}
            />
            <ToolbarButton
              icon={darkMode ? <Sun size={16} /> : <Moon size={16} />}
              onClick={() => setDarkMode(!darkMode)}
              title={darkMode ? t`Switch to light mode` : t`Switch to dark mode`}
              aria-label={t`Toggle theme`}
            />

            <ToolbarSpacer />

            <ToolbarButton
              icon={<Save size={14} />}
              label={t`Save`}
              onClick={() => void saveNow()}
              disabled={!canEdit}
              title={t`Save now (Ctrl+S)`}
            />
            {isOwner && (
              <ToolbarButton
                icon={<Share2 size={14} />}
                label={t`Invite`}
                variant="primary"
                onClick={async () => {
                  if (!snippetId) await saveNow()
                  setShareOpen(true)
                }}
                title={t`Invite collaborators`}
              />
            )}
          </Toolbar>
        }
        statusBar={
          <ToolStatusBar
            left={
              <>
                <StatusMetric
                  label={t`Ln`}
                  value={<Trans>{metrics.cursorLine}, Col {metrics.cursorCol}</Trans>}
                />
                <StatusMetric label={t`Lines`} value={metrics.lineCount} />
                <StatusMetric label={t`Chars`} value={metrics.charCount} />
              </>
            }
            right={
              <>
                <SaveIndicator status={status} lastSavedAt={lastSavedAt} />
                <span className="text-ktip-sand-300" aria-hidden>|</span>
                <span>{LANGUAGE_LABELS[language]}</span>
              </>
            }
          />
        }
      >
        <CodeMirrorEditor
          language={language}
          value={code}
          fontSize={fontSize}
          readOnly={!canEdit}
          onValueChange={handleCodeChange}
          onMetricsChange={setMetrics}
          height={hasPanel ? 'calc(100svh - 32rem)' : 'calc(100svh - 22rem)'}
        />

        {outputVisible && language === 'javascript' && (
          <OutputPanel
            messages={outputMessages}
            result={executionResult}
            running={running}
            onClear={() => {
              setOutputMessages([])
              setExecutionResult(null)
            }}
          />
        )}

        {previewVisible && (language === 'html' || language === 'css') && (
          <PreviewPanel
            code={code}
            language={language}
            onClose={() => setPreviewVisible(false)}
          />
        )}
      </ToolPanelShell>

      <ShareEntityModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        resourceType="snippet"
        resourceId={snippetId}
        resourceTitle={title}
      />
    </>
  )
}
