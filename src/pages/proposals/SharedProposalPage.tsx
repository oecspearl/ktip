import { useParams } from 'react-router'
import { ProposalPreview } from '../../components/proposals/ProposalPreview'
import { ProposalExportActions } from '../../components/proposals/ProposalExportActions'
import { useSharedProposal } from '../../hooks/useShareProposal'
import { usePageTitle } from '../../hooks/usePageTitle'
import { PROPOSAL_TYPE_LABELS } from '../../lib/constants'
import { Loader2, FileText } from 'lucide-react'

export default function SharedProposalPage() {
  const params = useParams()
  const token = params.token as string | undefined
  const { proposal } = useSharedProposal(token)
  // query.data is undefined while loading, null when not found/error, or the Proposal once loaded
  const loading = proposal === undefined

  usePageTitle(proposal?.title || 'Shared Proposal')

  return (
    <div className="min-h-screen bg-ktip-canvas">
      {/* Dark header bar */}
      <header className="border-b border-gray-700 bg-gray-800">
        <div className="container mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-ktip-ocean-500 flex items-center justify-center">
            <FileText size={16} className="text-white" />
          </div>
          <span className="text-sm font-medium text-gray-300">KTIP Shared Proposal</span>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 size={24} className="animate-spin text-ktip-ocean-500" />
          </div>
        ) : proposal ? (
          <>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-xl font-semibold text-ktip-sand-900 font-display">
                  {proposal.title}
                </h1>
                <span className="text-xs text-ktip-sand-500">
                  {PROPOSAL_TYPE_LABELS[proposal.type] || proposal.type}
                </span>
              </div>
              <ProposalExportActions
                type={proposal.type}
                title={proposal.title}
                data={proposal.proposal_data}
              />
            </div>

            <div className="bg-white border border-gray-200 p-6 md:p-8">
              <ProposalPreview
                type={proposal.type}
                title={proposal.title}
                data={proposal.proposal_data}
              />
            </div>

            <p className="text-center text-xs text-ktip-sand-400 mt-6">
              Shared via KTIP Proposal Wizard
            </p>
          </>
        ) : (
          <div className="text-center py-24">
            <h2 className="text-lg font-semibold text-ktip-sand-800 mb-2">Proposal Not Found</h2>
            <p className="text-sm text-ktip-sand-500">
              This shared link may have been revoked or the proposal no longer exists.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
