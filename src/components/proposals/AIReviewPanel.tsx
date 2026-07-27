import { createSignal, Show, For } from 'solid-js'
import { useAISuggestions } from '../../hooks/useAISuggestions'
import type { AIReviewResult } from '../../hooks/useAISuggestions'
import { Sparkles, Loader2, CheckCircle, AlertTriangle, Lightbulb } from 'lucide-solid'

interface AIReviewPanelProps {
  proposalType: string
  proposalTitle: string
  proposalData: Record<string, any>
}

export function AIReviewPanel(props: AIReviewPanelProps) {
  const ai = useAISuggestions()
  const [review, setReview] = createSignal<AIReviewResult | null>(null)

  const handleReview = async () => {
    const result = await ai.reviewProposal({
      proposalType: props.proposalType,
      proposalTitle: props.proposalTitle,
      proposalData: props.proposalData,
    })
    if (result) setReview(result)
  }

  const scoreColor = () => {
    const s = review()?.score || 0
    if (s >= 80) return 'text-ktip-tropical-600'
    if (s >= 60) return 'text-yellow-600'
    return 'text-red-600'
  }

  const scoreBg = () => {
    const s = review()?.score || 0
    if (s >= 80) return 'bg-ktip-tropical-50 border-ktip-tropical-200'
    if (s >= 60) return 'bg-yellow-50 border-yellow-200'
    return 'bg-red-50 border-red-200'
  }

  return (
    <div class="mt-6">
      <Show
        when={review()}
        fallback={
          <div class="text-center py-6 border border-dashed border-ktip-sand-300 rounded-xl">
            <Sparkles size={24} class="mx-auto text-ktip-ocean-400 mb-2" />
            <h4 class="text-sm font-semibold text-ktip-sand-800 mb-1">AI Proposal Review</h4>
            <p class="text-xs text-ktip-sand-500 mb-4 max-w-md mx-auto">
              Get an AI-powered analysis of your proposal with scoring, strengths, weaknesses, and actionable suggestions.
            </p>
            <button
              type="button"
              onClick={handleReview}
              disabled={ai.loading()}
              class="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-ktip-ocean-500 to-ktip-ocean-600 text-white rounded-xl text-sm font-medium hover:from-ktip-ocean-600 hover:to-ktip-ocean-700 transition-all disabled:opacity-50"
            >
              {ai.loading() ? (
                <>
                  <Loader2 size={16} class="animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  Analyze Proposal
                </>
              )}
            </button>
            <Show when={ai.error()}>
              <p class="text-xs text-red-500 mt-2">{ai.error()}</p>
            </Show>
          </div>
        }
      >
        {(r) => (
          <div class="space-y-4">
            {/* Score */}
            <div class={`flex items-center gap-4 p-4 border rounded-xl ${scoreBg()}`}>
              <div class={`text-3xl font-bold ${scoreColor()}`}>{r().score}</div>
              <div class="flex-1">
                <div class="text-sm font-semibold text-ktip-sand-800">Overall Score</div>
                <p class="text-xs text-ktip-sand-600 mt-0.5">{r().summary}</p>
              </div>
            </div>

            {/* Strengths */}
            <Show when={r().strengths.length > 0}>
              <div class="p-4 bg-ktip-tropical-50/50 border border-ktip-tropical-100 rounded-xl">
                <h4 class="text-sm font-semibold text-ktip-tropical-800 mb-2 flex items-center gap-1.5">
                  <CheckCircle size={14} />
                  Strengths
                </h4>
                <ul class="space-y-1.5">
                  <For each={r().strengths}>
                    {(s) => (
                      <li class="text-xs text-ktip-tropical-700 flex items-start gap-1.5">
                        <span class="mt-1 w-1 h-1 rounded-full bg-ktip-tropical-500 shrink-0" />
                        {s}
                      </li>
                    )}
                  </For>
                </ul>
              </div>
            </Show>

            {/* Weaknesses */}
            <Show when={r().weaknesses.length > 0}>
              <div class="p-4 bg-yellow-50/50 border border-yellow-100 rounded-xl">
                <h4 class="text-sm font-semibold text-yellow-800 mb-2 flex items-center gap-1.5">
                  <AlertTriangle size={14} />
                  Areas for Improvement
                </h4>
                <ul class="space-y-1.5">
                  <For each={r().weaknesses}>
                    {(w) => (
                      <li class="text-xs text-yellow-700 flex items-start gap-1.5">
                        <span class="mt-1 w-1 h-1 rounded-full bg-yellow-500 shrink-0" />
                        {w}
                      </li>
                    )}
                  </For>
                </ul>
              </div>
            </Show>

            {/* Suggestions */}
            <Show when={r().suggestions.length > 0}>
              <div class="p-4 bg-ktip-ocean-50/50 border border-ktip-ocean-100 rounded-xl">
                <h4 class="text-sm font-semibold text-ktip-ocean-800 mb-2 flex items-center gap-1.5">
                  <Lightbulb size={14} />
                  Suggestions
                </h4>
                <ul class="space-y-1.5">
                  <For each={r().suggestions}>
                    {(s) => (
                      <li class="text-xs text-ktip-ocean-700 flex items-start gap-1.5">
                        <span class="mt-1 w-1 h-1 rounded-full bg-ktip-ocean-500 shrink-0" />
                        {s}
                      </li>
                    )}
                  </For>
                </ul>
              </div>
            </Show>

            {/* Re-analyze button */}
            <div class="text-center">
              <button
                type="button"
                onClick={handleReview}
                disabled={ai.loading()}
                class="inline-flex items-center gap-2 px-4 py-2 text-sm text-ktip-ocean-600 hover:bg-ktip-ocean-50 rounded-lg transition-colors disabled:opacity-50"
              >
                {ai.loading() ? <Loader2 size={14} class="animate-spin" /> : <Sparkles size={14} />}
                Re-analyze
              </button>
            </div>
          </div>
        )}
      </Show>
    </div>
  )
}
