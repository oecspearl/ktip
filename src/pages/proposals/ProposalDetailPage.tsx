import { createSignal, Show, Suspense } from 'solid-js'
import { A, useParams, useNavigate } from '@solidjs/router'
import { MainLayout } from '../../components/layout/MainLayout'
import { ProposalPreview } from '../../components/proposals/ProposalPreview'
import { ProposalExportActions } from '../../components/proposals/ProposalExportActions'
import { ShareButton } from '../../components/proposals/ShareButton'
import { useProposal, useDeleteProposal } from '../../hooks/useProposals'
import { usePageTitle } from '../../hooks/usePageTitle'
import { PROPOSAL_TYPE_LABELS, PROPOSAL_TYPE_COLORS, PROPOSAL_STATUS_LABELS, PROPOSAL_STATUS_COLORS } from '../../lib/constants'
import { PROPOSAL_STEPS } from '../../lib/proposal-templates'
import { truncate } from '../../lib/utils'
import {
  Pencil,
  Trash2,
  Loader2,
  ChevronRight,
} from 'lucide-solid'

export default function ProposalDetailPage() {
  const params = useParams()
  const navigate = useNavigate()

  const proposalId = () => params.id as string | undefined
  const { proposal } = useProposal(proposalId)
  const { deleteProposal, loading: deleting } = useDeleteProposal()

  usePageTitle(() => proposal()?.title || 'Proposal')

  const totalSteps = () => {
    const p = proposal()
    if (!p) return 0
    return PROPOSAL_STEPS[p.type].length + 1
  }

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this proposal? This cannot be undone.')) return
    try {
      await deleteProposal(params.id as string)
      navigate('/proposals')
    } catch {
      // Error handled by hook
    }
  }

  return (
    <MainLayout>
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
            <div class="container mx-auto px-4 py-16 text-center">
              <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span class="text-3xl">📄</span>
              </div>
              <h2 class="text-2xl font-display font-bold uppercase text-ktip-sand-900 mb-2">
                Proposal Not Found
              </h2>
              <p class="text-gray-500 mb-6">
                This proposal doesn't exist or you don't have access to it.
              </p>
              <A
                href="/proposals"
                class="px-6 py-2.5 bg-ktip-ocean-600 text-white text-sm font-bold uppercase tracking-wider rounded-lg hover:bg-ktip-ocean-700 transition-colors inline-block"
              >
                Back to Proposals
              </A>
            </div>
          }
        >
          {(p) => {
            const [shareToken, setShareToken] = createSignal<string | null>(p().share_token ?? null)
            const typeLabel = () => PROPOSAL_TYPE_LABELS[p().type] || p().type
            const typeColor = () => PROPOSAL_TYPE_COLORS[p().type] || ''
            const statusLabel = () => PROPOSAL_STATUS_LABELS[p().status] || p().status
            const statusColor = () => PROPOSAL_STATUS_COLORS[p().status] || ''

            return (
              <>
                {/* === Dark Hero Header Band === */}
                <div class="bg-gray-800 min-h-[180px] flex items-center">
                  <div class="container mx-auto px-4 py-10">
                    <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                      <div>
                        <p class="text-gray-400 text-sm uppercase tracking-widest mb-2">Proposal Detail</p>
                        <h1 class="text-3xl md:text-4xl font-display font-bold text-white mb-3">
                          {p().title}
                        </h1>
                        <div class="flex flex-wrap items-center gap-2">
                          <span class={`px-2 py-0.5 rounded-full text-xs font-medium border ${typeColor()}`}>
                            {typeLabel()}
                          </span>
                          <span class={`px-2 py-0.5 rounded-full text-xs font-medium border ${statusColor()}`}>
                            {statusLabel()}
                          </span>
                          <Show when={p().status === 'draft'}>
                            <span class="text-sm text-gray-300">
                              Step {p().current_step + 1} of {totalSteps()}
                            </span>
                          </Show>
                        </div>
                      </div>
                      <div class="flex items-center gap-4">
                        <Show when={p().status === 'completed'}>
                          <ShareButton
                            proposalId={p().id}
                            shareToken={shareToken()}
                            onTokenChange={setShareToken}
                          />
                        </Show>
                        <Show when={p().status === 'draft'}>
                          <A
                            href={`/proposals/new?draft=${p().id}`}
                            class="inline-flex items-center gap-2 px-4 py-2 bg-ktip-ocean-600 text-white text-sm font-bold uppercase tracking-wider rounded-lg hover:bg-ktip-ocean-700 transition-colors"
                          >
                            <Pencil size={14} />
                            Continue Editing
                          </A>
                        </Show>
                        <nav class="text-sm text-gray-400 hidden md:block" aria-label="Breadcrumb">
                          <A href="/" class="hover:text-white transition-colors">Home</A>
                          <span class="mx-1.5"><ChevronRight size={12} class="inline" /></span>
                          <A href="/proposals" class="hover:text-white transition-colors">Proposals</A>
                          <span class="mx-1.5"><ChevronRight size={12} class="inline" /></span>
                          <span class="text-gray-300">{truncate(p().title, 30)}</span>
                        </nav>
                      </div>
                    </div>
                  </div>
                </div>

                {/* === Single-Column Content Area === */}
                <div class="bg-white py-12">
                  <div class="max-w-4xl mx-auto px-4">
                    {/* Export Actions */}
                    <div class="mb-8 print:hidden">
                      <ProposalExportActions
                        type={p().type}
                        title={p().title}
                        data={p().proposal_data}
                      />
                    </div>

                    {/* Delete Button */}
                    <div class="flex justify-end mb-6 print:hidden">
                      <button
                        type="button"
                        onClick={handleDelete}
                        disabled={deleting()}
                        class="inline-flex items-center gap-2 px-4 py-2 border border-red-200 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                      >
                        {deleting() ? <Loader2 size={14} class="animate-spin" /> : <Trash2 size={14} />}
                        Delete
                      </button>
                    </div>

                    {/* Preview */}
                    <div>
                      <ProposalPreview
                        type={p().type}
                        title={p().title}
                        data={p().proposal_data}
                      />
                    </div>
                  </div>
                </div>
              </>
            )
          }}
        </Show>
      </Suspense>
    </MainLayout>
  )
}
