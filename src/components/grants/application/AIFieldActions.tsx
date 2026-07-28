import { useState } from 'react'
import { useAISuggestions } from '../../../hooks/useAISuggestions'
import { Sparkles, Wand2, MessageSquare, Loader2 } from 'lucide-react'

interface AIFieldActionsProps {
  grantTitle: string
  fieldLabel: string
  fieldValue: string
  helpText?: string
  placeholder?: string
  applicationTitle?: string
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
  const { grantTitle, fieldLabel, fieldValue, helpText, placeholder, applicationTitle, existingData, onReplace } = props
  const ai = useAISuggestions()
  const [showTones, setShowTones] = useState(false)

  const handleImprove = async () => {
    if (!fieldValue?.trim()) return
    const html = await ai.improveField({
      grantTitle,
      fieldLabel,
      fieldValue,
      helpText,
    })
    if (html) onReplace(html)
  }

  const handleSuggest = async () => {
    const html = await ai.suggestSection({
      grantTitle,
      fieldLabel,
      helpText,
      placeholder,
      applicationTitle,
      existingData,
    })
    if (html) onReplace(html)
  }

  const handleTone = async (tone: string) => {
    if (!fieldValue?.trim()) return
    setShowTones(false)
    const html = await ai.adjustTone({
      fieldValue,
      tone,
    })
    if (html) onReplace(html)
  }

  return (
    <div className="flex items-center gap-1.5 mt-1.5">
      {ai.loading ? (
        <span className="inline-flex items-center gap-1.5 text-xs text-ktip-ocean-600">
          <Loader2 size={12} className="animate-spin" />
          AI working...
        </span>
      ) : (
        <>
          {/* Improve button - only when field has content */}
          {fieldValue?.trim() && (
            <button
              type="button"
              onClick={handleImprove}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs text-ktip-ocean-600 hover:bg-ktip-ocean-50 rounded-md transition-colors"
              title="Improve this content with AI"
            >
              <Sparkles size={11} />
              Improve
            </button>
          )}

          {/* Suggest button - when field is empty or has content */}
          <button
            type="button"
            onClick={handleSuggest}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs text-ktip-ocean-600 hover:bg-ktip-ocean-50 rounded-md transition-colors"
            title="Generate AI suggestion for this section"
          >
            <Wand2 size={11} />
            Suggest
          </button>

          {/* Tone adjustment */}
          {fieldValue?.trim() && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowTones(!showTones)}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs text-ktip-ocean-600 hover:bg-ktip-ocean-50 rounded-md transition-colors"
                title="Adjust tone"
              >
                <MessageSquare size={11} />
                Tone
              </button>

              {showTones && (
                <div className="absolute left-0 top-full mt-1 bg-ktip-cream border border-ktip-sand-200 rounded-lg shadow-medium py-1 z-50 min-w-[120px]">
                  {TONES.map((tone) => (
                    <button
                      key={tone.value}
                      type="button"
                      onClick={() => handleTone(tone.value)}
                      className="w-full text-left px-3 py-1.5 text-xs text-ktip-sand-700 hover:bg-ktip-sand-50 transition-colors"
                    >
                      {tone.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {ai.error && <span className="text-xs text-red-500">{ai.error}</span>}
    </div>
  )
}
