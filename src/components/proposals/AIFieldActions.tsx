import { createSignal, Show, For } from 'solid-js'
import { useAISuggestions } from '../../hooks/useAISuggestions'
import { Sparkles, Wand2, MessageSquare, Loader2 } from 'lucide-solid'

interface AIFieldActionsProps {
  proposalType: string
  fieldLabel: string
  fieldValue: string
  helpText?: string
  placeholder?: string
  proposalTitle?: string
  existingData?: Record<string, any>
  onReplace: (html: string) => void
}

const TONES = [
  { value: 'professional', label: 'Professional' },
  { value: 'persuasive', label: 'Persuasive' },
  { value: 'academic', label: 'Academic' },
  { value: 'concise', label: 'Concise' },
]

export function AIFieldActions(props: AIFieldActionsProps) {
  const ai = useAISuggestions()
  const [showTones, setShowTones] = createSignal(false)

  const handleImprove = async () => {
    if (!props.fieldValue?.trim()) return
    const html = await ai.improveField({
      proposalType: props.proposalType,
      fieldLabel: props.fieldLabel,
      fieldValue: props.fieldValue,
      helpText: props.helpText,
    })
    if (html) props.onReplace(html)
  }

  const handleSuggest = async () => {
    const html = await ai.suggestSection({
      proposalType: props.proposalType,
      fieldLabel: props.fieldLabel,
      helpText: props.helpText,
      placeholder: props.placeholder,
      proposalTitle: props.proposalTitle,
      existingData: props.existingData,
    })
    if (html) props.onReplace(html)
  }

  const handleTone = async (tone: string) => {
    if (!props.fieldValue?.trim()) return
    setShowTones(false)
    const html = await ai.adjustTone({
      fieldValue: props.fieldValue,
      tone,
    })
    if (html) props.onReplace(html)
  }

  return (
    <div class="flex items-center gap-1.5 mt-1.5">
      <Show
        when={!ai.loading()}
        fallback={
          <span class="inline-flex items-center gap-1.5 text-xs text-ktip-ocean-600">
            <Loader2 size={12} class="animate-spin" />
            AI working...
          </span>
        }
      >
        {/* Improve button - only when field has content */}
        <Show when={props.fieldValue?.trim()}>
          <button
            type="button"
            onClick={handleImprove}
            class="inline-flex items-center gap-1 px-2 py-1 text-xs text-ktip-ocean-600 hover:bg-ktip-ocean-50 rounded-md transition-colors"
            title="Improve this content with AI"
          >
            <Sparkles size={11} />
            Improve
          </button>
        </Show>

        {/* Suggest button - when field is empty or has content */}
        <button
          type="button"
          onClick={handleSuggest}
          class="inline-flex items-center gap-1 px-2 py-1 text-xs text-ktip-ocean-600 hover:bg-ktip-ocean-50 rounded-md transition-colors"
          title="Generate AI suggestion for this section"
        >
          <Wand2 size={11} />
          Suggest
        </button>

        {/* Tone adjustment */}
        <Show when={props.fieldValue?.trim()}>
          <div class="relative">
            <button
              type="button"
              onClick={() => setShowTones(!showTones())}
              class="inline-flex items-center gap-1 px-2 py-1 text-xs text-ktip-ocean-600 hover:bg-ktip-ocean-50 rounded-md transition-colors"
              title="Adjust tone"
            >
              <MessageSquare size={11} />
              Tone
            </button>

            <Show when={showTones()}>
              <div class="absolute left-0 top-full mt-1 bg-white border border-ktip-sand-200 rounded-lg shadow-medium py-1 z-50 min-w-[120px]">
                <For each={TONES}>
                  {(tone) => (
                    <button
                      type="button"
                      onClick={() => handleTone(tone.value)}
                      class="w-full text-left px-3 py-1.5 text-xs text-ktip-sand-700 hover:bg-ktip-sand-50 transition-colors"
                    >
                      {tone.label}
                    </button>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </Show>
      </Show>

      <Show when={ai.error()}>
        <span class="text-xs text-red-500">{ai.error()}</span>
      </Show>
    </div>
  )
}
