import { createSignal, Show } from 'solid-js'
import { Copy, Download, Printer, Check } from 'lucide-solid'
import {
  generateProposalMarkdown,
  downloadProposalAsMarkdown,
  copyProposalToClipboard,
  printProposal,
} from '../../lib/proposal-templates'
import type { ProposalType } from '../../types'

interface ProposalExportActionsProps {
  type: ProposalType
  title: string
  data: Record<string, any>
}

export function ProposalExportActions(props: ProposalExportActionsProps) {
  const [copied, setCopied] = createSignal(false)

  const getMarkdown = () => generateProposalMarkdown(props.type, props.title, props.data)

  const handleCopy = async () => {
    const success = await copyProposalToClipboard(getMarkdown())
    if (success) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleDownload = () => {
    downloadProposalAsMarkdown(props.title, getMarkdown())
  }

  return (
    <div class="flex items-center gap-2 flex-wrap">
      <button
        type="button"
        onClick={handleCopy}
        class="inline-flex items-center gap-2 px-4 py-2 border border-ktip-sand-200 rounded-xl text-sm font-medium text-ktip-sand-700 hover:bg-ktip-sand-50 transition-colors"
      >
        <Show when={copied()} fallback={<Copy size={16} />}>
          <Check size={16} class="text-green-500" />
        </Show>
        {copied() ? 'Copied!' : 'Copy Markdown'}
      </button>

      <button
        type="button"
        onClick={handleDownload}
        class="inline-flex items-center gap-2 px-4 py-2 border border-ktip-sand-200 rounded-xl text-sm font-medium text-ktip-sand-700 hover:bg-ktip-sand-50 transition-colors"
      >
        <Download size={16} />
        Download .md
      </button>

      <button
        type="button"
        onClick={printProposal}
        class="inline-flex items-center gap-2 px-4 py-2 border border-ktip-sand-200 rounded-xl text-sm font-medium text-ktip-sand-700 hover:bg-ktip-sand-50 transition-colors"
      >
        <Printer size={16} />
        Print / PDF
      </button>
    </div>
  )
}
