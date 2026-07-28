import { useEffect, useRef, type ComponentType } from 'react'
import { Terminal, Trash2, AlertTriangle, XCircle, Info, Clock } from 'lucide-react'
import type { ConsoleMessage, ExecutionResult } from '../../lib/code-sandbox-utils'

interface OutputPanelProps {
  messages: ConsoleMessage[]
  result: ExecutionResult | null
  running: boolean
  darkMode: boolean
  onClear: () => void
}

const typeStyles: Record<string, { bg: string; text: string; darkBg: string; darkText: string }> = {
  log: { bg: '', text: 'text-ktip-sand-800', darkBg: '', darkText: 'text-gray-300' },
  warn: { bg: 'bg-ktip-sun-50/60', text: 'text-ktip-sun-800', darkBg: 'bg-ktip-sun-900/20', darkText: 'text-ktip-sun-300' },
  error: { bg: 'bg-red-50/60', text: 'text-red-800', darkBg: 'bg-red-900/20', darkText: 'text-red-300' },
  info: { bg: 'bg-ktip-ocean-50/60', text: 'text-ktip-ocean-800', darkBg: 'bg-ktip-ocean-900/20', darkText: 'text-ktip-ocean-300' },
}

const typeIcons: Record<string, ComponentType<{ size?: number; className?: string }>> = {
  log: Terminal,
  warn: AlertTriangle,
  error: XCircle,
  info: Info,
}

export function OutputPanel({ messages, result, running, darkMode, onClear }: OutputPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const dark = darkMode

  return (
    <div className={`flex flex-col border-t ${dark ? 'border-gray-700 bg-[#1e1e1e]' : 'border-ktip-sand-200 bg-ktip-sand-50/30'}`}>
      {/* Header */}
      <div className={`flex items-center justify-between px-3 py-2 border-b ${dark ? 'border-gray-700' : 'border-ktip-sand-200'}`}>
        <div className="flex items-center gap-2">
          <Terminal size={14} className={dark ? 'text-gray-400' : 'text-ktip-sand-500'} />
          <span className={`text-xs font-medium ${dark ? 'text-gray-400' : 'text-ktip-sand-600'}`}>
            Console Output
          </span>
          {running && <div className="w-2 h-2 rounded-full bg-ktip-sun-500 animate-pulse" />}
          {result && (
            <span className={`text-xs flex items-center gap-1 ${dark ? 'text-gray-500' : 'text-ktip-sand-400'}`}>
              <Clock size={10} />
              {result.executionTime}ms
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClear}
          className={`p-1 rounded ${dark ? 'hover:bg-gray-700 text-gray-500' : 'hover:bg-ktip-sand-100 text-ktip-sand-400'} transition-colors`}
          title="Clear output"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto font-mono text-xs p-2 space-y-0.5"
        style={{ maxHeight: '250px', minHeight: '120px' }}
      >
        {messages.length > 0 || result?.error ? (
          <>
            {messages.map((msg) => {
              const style = typeStyles[msg.type] || typeStyles.log
              const Icon = typeIcons[msg.type] || Terminal
              return (
                <div key={msg.id} className={`flex items-start gap-2 px-2 py-1 rounded ${dark ? style.darkBg : style.bg}`}>
                  <Icon size={12} className={`mt-0.5 shrink-0 ${dark ? style.darkText : style.text}`} />
                  <span className={dark ? style.darkText : style.text}>
                    {msg.content.join(' ')}
                  </span>
                </div>
              )
            })}

            {/* Execution error */}
            {result?.error && (
              <div className={`flex items-start gap-2 px-2 py-1 rounded ${dark ? 'bg-red-900/20' : 'bg-red-50/60'}`}>
                <XCircle size={12} className={`mt-0.5 shrink-0 ${dark ? 'text-red-400' : 'text-red-600'}`} />
                <div>
                  <span className={`font-medium ${dark ? 'text-red-400' : 'text-red-700'}`}>
                    {result.error.message}
                  </span>
                  {result.error.stack && (
                    <pre className={`mt-1 text-[10px] whitespace-pre-wrap ${dark ? 'text-red-500/70' : 'text-red-500/80'}`}>
                      {result.error.stack}
                    </pre>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className={`flex items-center justify-center h-full py-8 ${dark ? 'text-gray-600' : 'text-ktip-sand-400'}`}>
            <span>Run your code to see output here</span>
          </div>
        )}
      </div>
    </div>
  )
}
