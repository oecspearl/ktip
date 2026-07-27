import { createSignal, Show } from 'solid-js'
import { useShareProposal } from '../../hooks/useShareProposal'
import { Share2, Link, X, Copy, Check, Loader2 } from 'lucide-solid'

interface ShareButtonProps {
  proposalId: string
  shareToken: string | null
  onTokenChange: (token: string | null) => void
}

export function ShareButton(props: ShareButtonProps) {
  const { enableSharing, disableSharing, loading } = useShareProposal()
  const [showPanel, setShowPanel] = createSignal(false)
  const [copied, setCopied] = createSignal(false)

  const shareUrl = () => {
    if (!props.shareToken) return ''
    return `${window.location.origin}/proposals/shared/${props.shareToken}`
  }

  const handleEnable = async () => {
    const token = await enableSharing(props.proposalId)
    if (token) props.onTokenChange(token)
  }

  const handleDisable = async () => {
    const ok = await disableSharing(props.proposalId)
    if (ok) props.onTokenChange(null)
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(shareUrl())
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div class="relative">
      <button
        type="button"
        onClick={() => setShowPanel(!showPanel())}
        class="inline-flex items-center gap-2 px-4 py-2 border border-ktip-sand-200 rounded-xl text-sm font-medium text-ktip-sand-700 hover:bg-ktip-sand-50 transition-colors"
      >
        <Share2 size={14} />
        {props.shareToken ? 'Shared' : 'Share'}
      </button>

      <Show when={showPanel()}>
        <div class="absolute right-0 top-full mt-2 w-80 bg-white border border-ktip-sand-200 rounded-xl shadow-medium p-4 z-50">
          <div class="flex items-center justify-between mb-3">
            <h4 class="text-sm font-semibold text-ktip-sand-900">Share Proposal</h4>
            <button
              type="button"
              onClick={() => setShowPanel(false)}
              class="p-1 rounded-md hover:bg-ktip-sand-100 transition-colors"
            >
              <X size={14} class="text-ktip-sand-500" />
            </button>
          </div>

          <Show
            when={props.shareToken}
            fallback={
              <div>
                <p class="text-xs text-ktip-sand-500 mb-3">
                  Generate a public link anyone can use to view this proposal (read-only).
                </p>
                <button
                  type="button"
                  onClick={handleEnable}
                  disabled={loading()}
                  class="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-ktip-ocean-500 text-white rounded-lg text-sm font-medium hover:bg-ktip-ocean-600 transition-colors disabled:opacity-50"
                >
                  {loading() ? <Loader2 size={14} class="animate-spin" /> : <Link size={14} />}
                  Generate Share Link
                </button>
              </div>
            }
          >
            <div>
              <p class="text-xs text-ktip-sand-500 mb-2">
                Anyone with this link can view this proposal.
              </p>
              <div class="flex items-center gap-2 mb-3">
                <input
                  type="text"
                  value={shareUrl()}
                  readOnly
                  class="flex-1 px-2.5 py-1.5 border border-ktip-sand-200 rounded-lg text-xs text-ktip-sand-700 bg-ktip-sand-50"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  class="p-1.5 rounded-lg border border-ktip-sand-200 hover:bg-ktip-sand-50 transition-colors"
                  title="Copy link"
                >
                  {copied() ? <Check size={14} class="text-ktip-tropical-600" /> : <Copy size={14} class="text-ktip-sand-600" />}
                </button>
              </div>
              <button
                type="button"
                onClick={handleDisable}
                disabled={loading()}
                class="w-full inline-flex items-center justify-center gap-2 px-4 py-2 border border-red-200 text-red-600 rounded-lg text-xs font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                {loading() ? <Loader2 size={14} class="animate-spin" /> : <X size={14} />}
                Revoke Link
              </button>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  )
}
