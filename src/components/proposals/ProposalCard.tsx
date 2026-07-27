import { A } from '@solidjs/router'
import { PROPOSAL_TYPE_LABELS, PROPOSAL_TYPE_COLORS, PROPOSAL_STATUS_LABELS, PROPOSAL_STATUS_COLORS } from '../../lib/constants'
import { PROPOSAL_STEPS } from '../../lib/proposal-templates'
import { Clock, FileText } from 'lucide-solid'
import type { Proposal } from '../../types'

interface ProposalCardProps {
  proposal: Proposal
}

export function ProposalCard(props: ProposalCardProps) {
  const p = () => props.proposal
  const typeLabel = () => PROPOSAL_TYPE_LABELS[p().type] || p().type
  const typeColor = () => PROPOSAL_TYPE_COLORS[p().type] || ''
  const statusLabel = () => PROPOSAL_STATUS_LABELS[p().status] || p().status
  const statusColor = () => PROPOSAL_STATUS_COLORS[p().status] || ''
  const totalSteps = () => PROPOSAL_STEPS[p().type].length + 1
  const progress = () => p().status === 'completed' ? 100 : Math.round((p().current_step / totalSteps()) * 100)

  const timeAgo = () => {
    const diff = Date.now() - new Date(p().updated_at).getTime()
    const minutes = Math.floor(diff / 60000)
    if (minutes < 1) return 'Just now'
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 30) return `${days}d ago`
    return new Date(p().updated_at).toLocaleDateString()
  }

  return (
    <A
      href={`/proposals/${p().id}`}
      class="flex items-center gap-4 border-b border-gray-200 py-5 group"
    >
      {/* Icon */}
      <div class="w-9 h-9 bg-ktip-ocean-50 rounded-lg flex items-center justify-center shrink-0">
        <FileText size={18} class="text-ktip-ocean-600" />
      </div>

      {/* Content */}
      <div class="flex-1 min-w-0">
        <h3 class="font-semibold text-ktip-sand-900 group-hover:text-ktip-ocean-600 transition-colors line-clamp-1 mb-1">
          {p().title}
        </h3>

        <div class="flex flex-wrap items-center gap-2">
          <span class={`px-2 py-0.5 rounded-full text-xs font-medium border ${typeColor()}`}>
            {typeLabel()}
          </span>
          <span class={`px-2 py-0.5 rounded-full text-xs font-medium border ${statusColor()}`}>
            {statusLabel()}
          </span>

          {/* Progress for drafts */}
          {p().status === 'draft' && (
            <div class="flex items-center gap-2">
              <div class="w-20 bg-ktip-sand-100 rounded-full h-1.5">
                <div
                  class="bg-ktip-ocean-500 h-1.5 rounded-full transition-all"
                  style={{ width: `${progress()}%` }}
                />
              </div>
              <span class="text-xs text-ktip-sand-400">{progress()}%</span>
            </div>
          )}
        </div>
      </div>

      {/* Timestamp */}
      <div class="flex items-center gap-1 text-xs text-ktip-sand-400 shrink-0">
        <Clock size={12} />
        <span>{timeAgo()}</span>
      </div>
    </A>
  )
}
