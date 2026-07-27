import { useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router'
import { ProposalPreview } from '../../components/proposals/ProposalPreview'
import { ProposalExportActions } from '../../components/proposals/ProposalExportActions'
import { ShareButton } from '../../components/proposals/ShareButton'
import { useProposal, useDeleteProposal } from '../../hooks/useProposals'
import { usePageTitle } from '../../hooks/usePageTitle'
import { PROPOSAL_TYPE_LABELS, PROPOSAL_TYPE_COLORS, PROPOSAL_STATUS_LABELS, PROPOSAL_STATUS_COLORS } from '../../lib/constants'
import { PROPOSAL_STEPS } from '../../lib/proposal-templates'
import { truncate } from '../../lib/utils'
import type { Proposal } from '../../types'
import {
  Pencil,
  Trash2,
  Loader2,
  ChevronRight,
} from 'lucide-react'

export default function ProposalDetailPage() {
  const params = useParams()
  const navigate = useNavigate()

  const proposalId = params.id as string | undefined
  const { proposal, loading } = useProposal(proposalId)
  const { deleteProposal, loading: deleting } = useDeleteProposal()

  usePageTitle(proposal?.title || 'Proposal')

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this proposal? This cannot be undone.')) return
    try {
      await deleteProposal(params.id as string)
      navigate('/proposals')
    } catch {
      // Error handled by hook
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={24} className="animate-spin text-ktip-ocean-500" />
      </div>
    )
  }

  if (!proposal) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">📄</span>
        </div>
        <h2 className="text-2xl font-display font-bold uppercase text-ktip-sand-900 mb-2">
          Proposal Not Found
        </h2>
        <p className="text-gray-500 mb-6">
          This proposal doesn't exist or you don't have access to it.
        </p>
        <Link
          to="/proposals"
          className="px-6 py-2.5 bg-ktip-ocean-600 text-white text-sm font-bold uppercase tracking-wider rounded-lg hover:bg-ktip-ocean-700 transition-colors inline-block"
        >
          Back to Proposals
        </Link>
      </div>
    )
  }

  return (
    <ProposalDetailContent
      key={proposal.id}
      proposal={proposal}
      onDelete={handleDelete}
      deleting={deleting}
    />
  )
}

interface ProposalDetailContentProps {
  proposal: Proposal
  onDelete: () => void
  deleting: boolean
}

function ProposalDetailContent({ proposal: p, onDelete, deleting }: ProposalDetailContentProps) {
  const [shareToken, setShareToken] = useState<string | null>(p.share_token ?? null)

  const totalSteps = PROPOSAL_STEPS[p.type].length + 1
  const typeLabel = PROPOSAL_TYPE_LABELS[p.type] || p.type
  const typeColor = PROPOSAL_TYPE_COLORS[p.type] || ''
  const statusLabel = PROPOSAL_STATUS_LABELS[p.status] || p.status
  const statusColor = PROPOSAL_STATUS_COLORS[p.status] || ''

  return (
    <>
      {/* === Dark Hero Header Band === */}
      <div className="bg-gray-800 min-h-[180px] flex items-center">
        <div className="container mx-auto px-4 py-10">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <p className="text-gray-400 text-sm uppercase tracking-widest mb-2">Proposal Detail</p>
              <h1 className="text-3xl md:text-4xl font-display font-bold text-white mb-3">
                {p.title}
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${typeColor}`}>
                  {typeLabel}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${statusColor}`}>
                  {statusLabel}
                </span>
                {p.status === 'draft' && (
                  <span className="text-sm text-gray-300">
                    Step {p.current_step + 1} of {totalSteps}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-4">
              {p.status === 'completed' && (
                <ShareButton
                  proposalId={p.id}
                  shareToken={shareToken}
                  onTokenChange={setShareToken}
                />
              )}
              {p.status === 'draft' && (
                <Link
                  to={`/proposals/new?draft=${p.id}`}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-ktip-ocean-600 text-white text-sm font-bold uppercase tracking-wider rounded-lg hover:bg-ktip-ocean-700 transition-colors"
                >
                  <Pencil size={14} />
                  Continue Editing
                </Link>
              )}
              <nav className="text-sm text-gray-400 hidden md:block" aria-label="Breadcrumb">
                <Link to="/" className="hover:text-white transition-colors">Home</Link>
                <span className="mx-1.5"><ChevronRight size={12} className="inline" /></span>
                <Link to="/proposals" className="hover:text-white transition-colors">Proposals</Link>
                <span className="mx-1.5"><ChevronRight size={12} className="inline" /></span>
                <span className="text-gray-300">{truncate(p.title, 30)}</span>
              </nav>
            </div>
          </div>
        </div>
      </div>

      {/* === Single-Column Content Area === */}
      <div className="bg-white py-12">
        <div className="max-w-4xl mx-auto px-4">
          {/* Export Actions */}
          <div className="mb-8 print:hidden">
            <ProposalExportActions
              type={p.type}
              title={p.title}
              data={p.proposal_data}
            />
          </div>

          {/* Delete Button */}
          <div className="flex justify-end mb-6 print:hidden">
            <button
              type="button"
              onClick={onDelete}
              disabled={deleting}
              className="inline-flex items-center gap-2 px-4 py-2 border border-red-200 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Delete
            </button>
          </div>

          {/* Preview */}
          <div>
            <ProposalPreview
              type={p.type}
              title={p.title}
              data={p.proposal_data}
            />
          </div>
        </div>
      </div>
    </>
  )
}
