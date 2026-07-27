import { For, Show, createEffect } from 'solid-js'
import { Terminal, Trash2, AlertTriangle, XCircle, Info, Clock } from 'lucide-solid'
import type { ConsoleMessage, ExecutionResult } from '../../lib/code-sandbox-utils'

interface OutputPanelProps {
  messages: () => ConsoleMessage[]
  result: () => ExecutionResult | null
  running: () => boolean
  darkMode: () => boolean
  onClear: () => void
}

const typeStyles: Record<string, { bg: string; text: string; darkBg: string; darkText: string }> = {
  log: { bg: '', text: 'text-ktip-sand-800', darkBg: '', darkText: 'text-gray-300' },
  warn: { bg: 'bg-amber-50/60', text: 'text-amber-800', darkBg: 'bg-amber-900/20', darkText: 'text-amber-300' },
  error: { bg: 'bg-red-50/60', text: 'text-red-800', darkBg: 'bg-red-900/20', darkText: 'text-red-300' },
  info: { bg: 'bg-blue-50/60', text: 'text-blue-800', darkBg: 'bg-blue-900/20', darkText: 'text-blue-300' },
}

const typeIcons: Record<string, any> = {
  log: Terminal,
  warn: AlertTriangle,
  error: XCircle,
  info: Info,
}

export function OutputPanel(props: OutputPanelProps) {
  let scrollRef!: HTMLDivElement

  // Auto-scroll to bottom on new messages
  createEffect(() => {
    props.messages().length // track reactively
    if (scrollRef) {
      scrollRef.scrollTop = scrollRef.scrollHeight
    }
  })

  const dark = () => props.darkMode()

  return (
    <div class={`flex flex-col border-t ${dark() ? 'border-gray-700 bg-[#1e1e1e]' : 'border-ktip-sand-200 bg-ktip-sand-50/30'}`}>
      {/* Header */}
      <div class={`flex items-center justify-between px-3 py-2 border-b ${dark() ? 'border-gray-700' : 'border-ktip-sand-200'}`}>
        <div class="flex items-center gap-2">
          <Terminal size={14} class={dark() ? 'text-gray-400' : 'text-ktip-sand-500'} />
          <span class={`text-xs font-medium ${dark() ? 'text-gray-400' : 'text-ktip-sand-600'}`}>
            Console Output
          </span>
          <Show when={props.running()}>
            <div class="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          </Show>
          <Show when={props.result()}>
            <span class={`text-xs flex items-center gap-1 ${dark() ? 'text-gray-500' : 'text-ktip-sand-400'}`}>
              <Clock size={10} />
              {props.result()!.executionTime}ms
            </span>
          </Show>
        </div>
        <button
          type="button"
          onClick={props.onClear}
          class={`p-1 rounded ${dark() ? 'hover:bg-gray-700 text-gray-500' : 'hover:bg-ktip-sand-100 text-ktip-sand-400'} transition-colors`}
          title="Clear output"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef!}
        class="flex-1 overflow-auto font-mono text-xs p-2 space-y-0.5"
        style={{ "max-height": "250px", "min-height": "120px" }}
      >
        <Show
          when={props.messages().length > 0 || props.result()?.error}
          fallback={
            <div class={`flex items-center justify-center h-full py-8 ${dark() ? 'text-gray-600' : 'text-ktip-sand-400'}`}>
              <span>Run your code to see output here</span>
            </div>
          }
        >
          <For each={props.messages()}>
            {(msg) => {
              const style = typeStyles[msg.type] || typeStyles.log
              const Icon = typeIcons[msg.type] || Terminal
              return (
                <div class={`flex items-start gap-2 px-2 py-1 rounded ${dark() ? style.darkBg : style.bg}`}>
                  <Icon size={12} class={`mt-0.5 shrink-0 ${dark() ? style.darkText : style.text}`} />
                  <span class={dark() ? style.darkText : style.text}>
                    {msg.content.join(' ')}
                  </span>
                </div>
              )
            }}
          </For>

          {/* Execution error */}
          <Show when={props.result()?.error}>
            <div class={`flex items-start gap-2 px-2 py-1 rounded ${dark() ? 'bg-red-900/20' : 'bg-red-50/60'}`}>
              <XCircle size={12} class={`mt-0.5 shrink-0 ${dark() ? 'text-red-400' : 'text-red-600'}`} />
              <div>
                <span class={`font-medium ${dark() ? 'text-red-400' : 'text-red-700'}`}>
                  {props.result()!.error!.message}
                </span>
                <Show when={props.result()!.error!.stack}>
                  <pre class={`mt-1 text-[10px] whitespace-pre-wrap ${dark() ? 'text-red-500/70' : 'text-red-500/80'}`}>
                    {props.result()!.error!.stack}
                  </pre>
                </Show>
              </div>
            </div>
          </Show>
        </Show>
      </div>
    </div>
  )
}
