import { Show, Suspense } from 'solid-js'
import { useParams } from '@solidjs/router'
import { ProposalPreview } from '../../components/proposals/ProposalPreview'
import { ProposalExportActions } from '../../components/proposals/ProposalExportActions'
import { useSharedProposal } from '../../hooks/useShareProposal'
import { usePageTitle } from '../../hooks/usePageTitle'
import { PROPOSAL_TYPE_LABELS } from '../../lib/constants'
import { Loader2, FileText } from 'lucide-solid'

export default function SharedProposalPage() {
  const params = useParams()
  const token = () => params.token as string | undefined
  const { proposal } = useSharedProposal(token)

  usePageTitle(() => proposal()?.title || 'Shared Proposal')

  return (
    <div class="min-h-screen bg-ktip-canvas">
      {/* Dark header bar */}
      <header class="border-b border-gray-700 bg-gray-800">
        <div class="container mx-auto px-4 py-3 flex items-center gap-3">
          <div class="w-8 h-8 rounded-lg bg-ktip-ocean-500 flex items-center justify-center">
            <FileText size={16} class="text-white" />
          </div>
          <span class="text-sm font-medium text-gray-300">KTIP Shared Proposal</span>
        </div>
      </header>

      <div class="container mx-auto px-4 py-8 max-w-4xl">
        <Suspense
          fallback={
            <div class="flex items-center justify-center py-24">
              <Loader2 size={24} class="animate-spin text-ktip-ocean-500" />
            </div>
          }
        >
          <Show
            when={proposal()}
            fallback={
              <div class="text-center py-24">
                <h2 class="text-lg font-semibold text-ktip-sand-800 mb-2">Proposal Not Found</h2>
                <p class="text-sm text-ktip-sand-500">
                  This shared link may have been revoked or the proposal no longer exists.
                </p>
              </div>
            }
          >
            {(p) => (
              <>
                <div class="flex items-center justify-between mb-6">
                  <div>
                    <h1 class="text-xl font-semibold text-ktip-sand-900 font-display">
                      {p().title}
                    </h1>
                    <span class="text-xs text-ktip-sand-500">
                      {PROPOSAL_TYPE_LABELS[p().type] || p().type}
                    </span>
                  </div>
                  <ProposalExportActions
                    type={p().type}
                    title={p().title}
                    data={p().proposal_data}
                  />
                </div>

                <div class="bg-white border border-gray-200 p-6 md:p-8">
                  <ProposalPreview
                    type={p().type}
                    title={p().title}
                    data={p().proposal_data}
                  />
                </div>

                <p class="text-center text-xs text-ktip-sand-400 mt-6">
                  Shared via KTIP Proposal Wizard
                </p>
              </>
            )}
          </Show>
        </Suspense>
      </div>
    </div>
  )
}
