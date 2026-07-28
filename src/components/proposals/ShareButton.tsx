import { useState } from 'react'
import { useShareProposal } from '../../hooks/useShareProposal'
import { Share2, Link, X, Copy, Check, Loader2 } from 'lucide-react'

interface ShareButtonProps {
  proposalId: string
  shareToken: string | null
  onTokenChange: (token: string | null) => void
}

export function ShareButton({ proposalId, shareToken, onTokenChange }: ShareButtonProps) {
  const { enableSharing, disableSharing, loading } = useShareProposal()
  const [showPanel, setShowPanel] = useState(false)
  const [copied, setCopied] = useState(false)

  const shareUrl = shareToken ? `${window.location.origin}/proposals/shared/${shareToken}` : ''

  const handleEnable = async () => {
    const token = await enableSharing(proposalId)
    if (token) onTokenChange(token)
  }

  const handleDisable = async () => {
    const ok = await disableSharing(proposalId)
    if (ok) onTokenChange(null)
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setShowPanel(!showPanel)}
        className="inline-flex items-center gap-2 px-4 py-2 border border-ktip-sand-200 rounded-xl text-sm font-medium text-ktip-sand-700 hover:bg-ktip-sand-50 transition-colors"
      >
        <Share2 size={14} />
        {shareToken ? 'Shared' : 'Share'}
      </button>

      {showPanel && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-ktip-cream border border-ktip-sand-200 rounded-xl shadow-medium p-4 z-50">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-ktip-sand-900">Share Proposal</h4>
            <button
              type="button"
              onClick={() => setShowPanel(false)}
              className="p-1 rounded-md hover:bg-ktip-sand-100 transition-colors"
            >
              <X size={14} className="text-ktip-sand-500" />
            </button>
          </div>

          {shareToken ? (
            <div>
              <p className="text-xs text-ktip-sand-500 mb-2">
                Anyone with this link can view this proposal.
              </p>
              <div className="flex items-center gap-2 mb-3">
                <input
                  type="text"
                  value={shareUrl}
                  readOnly
                  className="flex-1 px-2.5 py-1.5 border border-ktip-sand-200 rounded-lg text-xs text-ktip-sand-700 bg-ktip-sand-50"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  className="p-1.5 rounded-lg border border-ktip-sand-200 hover:bg-ktip-sand-50 transition-colors"
                  title="Copy link"
                >
                  {copied ? <Check size={14} className="text-ktip-tropical-600" /> : <Copy size={14} className="text-ktip-sand-600" />}
                </button>
              </div>
              <button
                type="button"
                onClick={handleDisable}
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 border border-red-200 text-red-600 rounded-lg text-xs font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                Revoke Link
              </button>
            </div>
          ) : (
            <div>
              <p className="text-xs text-ktip-sand-500 mb-3">
                Generate a public link anyone can use to view this proposal (read-only).
              </p>
              <button
                type="button"
                onClick={handleEnable}
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-ktip-ocean-500 text-white rounded-lg text-sm font-medium hover:bg-ktip-ocean-600 transition-colors disabled:opacity-50"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Link size={14} />}
                Generate Share Link
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
