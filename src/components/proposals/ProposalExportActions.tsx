import { useState } from 'react'
import { Copy, Download, Printer, Check } from 'lucide-react'
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

export function ProposalExportActions({ type, title, data }: ProposalExportActionsProps) {
  const [copied, setCopied] = useState(false)

  const getMarkdown = () => generateProposalMarkdown(type, title, data)

  const handleCopy = async () => {
    const success = await copyProposalToClipboard(getMarkdown())
    if (success) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleDownload = () => {
    downloadProposalAsMarkdown(title, getMarkdown())
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        type="button"
        onClick={handleCopy}
        className="inline-flex items-center gap-2 px-4 py-2 border border-ktip-sand-200 rounded-xl text-sm font-medium text-ktip-sand-700 hover:bg-ktip-sand-50 transition-colors"
      >
        {copied ? <Check size={16} className="text-ktip-tropical-500" /> : <Copy size={16} />}
        {copied ? 'Copied!' : 'Copy Markdown'}
      </button>

      <button
        type="button"
        onClick={handleDownload}
        className="inline-flex items-center gap-2 px-4 py-2 border border-ktip-sand-200 rounded-xl text-sm font-medium text-ktip-sand-700 hover:bg-ktip-sand-50 transition-colors"
      >
        <Download size={16} />
        Download .md
      </button>

      <button
        type="button"
        onClick={printProposal}
        className="inline-flex items-center gap-2 px-4 py-2 border border-ktip-sand-200 rounded-xl text-sm font-medium text-ktip-sand-700 hover:bg-ktip-sand-50 transition-colors"
      >
        <Printer size={16} />
        Print / PDF
      </button>
    </div>
  )
}
