import { useState } from 'react'
import { useAISuggestions } from '../../hooks/useAISuggestions'
import type { AIReviewResult } from '../../hooks/useAISuggestions'
import { Sparkles, Loader2, CheckCircle, AlertTriangle, Lightbulb } from 'lucide-react'

interface AIReviewPanelProps {
  proposalType: string
  proposalTitle: string
  proposalData: Record<string, any>
}

export function AIReviewPanel({ proposalType, proposalTitle, proposalData }: AIReviewPanelProps) {
  const ai = useAISuggestions()
  const [review, setReview] = useState<AIReviewResult | null>(null)

  const handleReview = async () => {
    const result = await ai.reviewProposal({
      proposalType,
      proposalTitle,
      proposalData,
    })
    if (result) setReview(result)
  }

  const score = review?.score || 0
  const scoreColor = score >= 80 ? 'text-ktip-tropical-600' : score >= 60 ? 'text-ktip-sun-600' : 'text-red-600'
  const scoreBg = score >= 80 ? 'bg-ktip-tropical-50 border-ktip-tropical-200' : score >= 60 ? 'bg-ktip-sun-50 border-ktip-sun-200' : 'bg-red-50 border-red-200'

  return (
    <div className="mt-6">
      {!review ? (
        <div className="text-center py-6 border border-dashed border-ktip-sand-300 rounded-xl">
          <Sparkles size={24} className="mx-auto text-ktip-ocean-400 mb-2" />
          <h4 className="text-sm font-semibold text-ktip-sand-800 mb-1">AI Proposal Review</h4>
          <p className="text-xs text-ktip-sand-500 mb-4 max-w-md mx-auto">
            Get an AI-powered analysis of your proposal with scoring, strengths, weaknesses, and actionable suggestions.
          </p>
          <button
            type="button"
            onClick={handleReview}
            disabled={ai.loading}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-ktip-ocean-500 to-ktip-ocean-600 text-white rounded-xl text-sm font-medium hover:from-ktip-ocean-600 hover:to-ktip-ocean-700 transition-all disabled:opacity-50"
          >
            {ai.loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Sparkles size={16} />
                Analyze Proposal
              </>
            )}
          </button>
          {ai.error && <p className="text-xs text-red-500 mt-2">{ai.error}</p>}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Score */}
          <div className={`flex items-center gap-4 p-4 border rounded-xl ${scoreBg}`}>
            <div className={`text-3xl font-bold ${scoreColor}`}>{review.score}</div>
            <div className="flex-1">
              <div className="text-sm font-semibold text-ktip-sand-800">Overall Score</div>
              <p className="text-xs text-ktip-sand-600 mt-0.5">{review.summary}</p>
            </div>
          </div>

          {/* Strengths */}
          {review.strengths.length > 0 && (
            <div className="p-4 bg-ktip-tropical-50/50 border border-ktip-tropical-100 rounded-xl">
              <h4 className="text-sm font-semibold text-ktip-tropical-800 mb-2 flex items-center gap-1.5">
                <CheckCircle size={14} />
                Strengths
              </h4>
              <ul className="space-y-1.5">
                {review.strengths.map((s, i) => (
                  <li key={i} className="text-xs text-ktip-tropical-700 flex items-start gap-1.5">
                    <span className="mt-1 w-1 h-1 rounded-full bg-ktip-tropical-500 shrink-0" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Weaknesses */}
          {review.weaknesses.length > 0 && (
            <div className="p-4 bg-ktip-sun-50/50 border border-ktip-sun-100 rounded-xl">
              <h4 className="text-sm font-semibold text-ktip-sun-800 mb-2 flex items-center gap-1.5">
                <AlertTriangle size={14} />
                Areas for Improvement
              </h4>
              <ul className="space-y-1.5">
                {review.weaknesses.map((w, i) => (
                  <li key={i} className="text-xs text-ktip-sun-700 flex items-start gap-1.5">
                    <span className="mt-1 w-1 h-1 rounded-full bg-ktip-sun-500 shrink-0" />
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Suggestions */}
          {review.suggestions.length > 0 && (
            <div className="p-4 bg-ktip-ocean-50/50 border border-ktip-ocean-100 rounded-xl">
              <h4 className="text-sm font-semibold text-ktip-ocean-800 mb-2 flex items-center gap-1.5">
                <Lightbulb size={14} />
                Suggestions
              </h4>
              <ul className="space-y-1.5">
                {review.suggestions.map((s, i) => (
                  <li key={i} className="text-xs text-ktip-ocean-700 flex items-start gap-1.5">
                    <span className="mt-1 w-1 h-1 rounded-full bg-ktip-ocean-500 shrink-0" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Re-analyze button */}
          <div className="text-center">
            <button
              type="button"
              onClick={handleReview}
              disabled={ai.loading}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm text-ktip-ocean-600 hover:bg-ktip-ocean-50 rounded-lg transition-colors disabled:opacity-50"
            >
              {ai.loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              Re-analyze
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
