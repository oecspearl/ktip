import { Check, Loader2 } from 'lucide-react'
import { TagInput } from '../ui/TagInput'
import { useMergedTagVocabulary } from '../../hooks/useTagVocabulary'
import { sanitizeTag } from '../../lib/utils'
import { CONTENT_TAG_SUGGESTIONS, LIMITS } from '../../lib/constants'
import { Trans, useLingui } from '@lingui/react/macro'

interface TopicPickerProps {
  values: string[]
  onChange: (values: string[]) => void
  max?: number
}

/** Chips beyond this are noise in a settings form; the rest stay reachable via the input. */
const VISIBLE_CHIPS = 40

/**
 * Topic selection for Settings › Personalization.
 *
 * The chips come from tags that are *actually stored* on content rather than
 * from a suggestion constant, for the same reason the list-page filters do
 * (see useTagVocabulary): a picked topic has to be byte-identical to what the
 * ranker compares against, and a chip that matches nothing is worse than no
 * chip. The usage count is shown so a member can tell "agriculture · 24" from
 * a topic with one item behind it.
 */
export function TopicPicker({ values, onChange, max = LIMITS.MAX_INTERESTS * 2 }: TopicPickerProps) {
    const { t } = useLingui()
  const { tags, loading } = useMergedTagVocabulary()

  const toggle = (tag: string) => {
    if (values.includes(tag)) {
      onChange(values.filter((t) => t !== tag))
    } else if (values.length < max) {
      onChange([...values, tag])
    }
  }

  const visible = tags.slice(0, VISIBLE_CHIPS)
  // Anything already picked that has since dropped out of the corpus still
  // needs a way to be un-picked.
  const orphans = values.filter((v) => !visible.some((t) => t.tag === v))

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-ktip-sand-500 py-3">
          <Loader2 size={16} className="animate-spin" />
          Loading topics from across the platform…
        </div>
      ) : visible.length === 0 ? (
        <p className="text-sm text-ktip-sand-500 py-2">
          <Trans>No tagged content yet. Add your own topics below — they will start matching as content is tagged.</Trans>
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {visible.map(({ tag, count }) => {
            const selected = values.includes(tag)
            const atLimit = !selected && values.length >= max
            return (
              <button
                key={tag}
                type="button"
                role="checkbox"
                aria-checked={selected}
                disabled={atLimit}
                onClick={() => toggle(tag)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                  selected
                    ? 'border-ktip-ocean-500 bg-ktip-ocean-50 text-ktip-ocean-800'
                    : atLimit
                      ? 'border-ktip-sand-200 text-ktip-sand-300 cursor-not-allowed'
                      : 'border-ktip-sand-200 text-ktip-sand-700 hover:border-ktip-ocean-300 hover:bg-ktip-ocean-50/50'
                }`}
              >
                {selected && <Check size={13} />}
                {tag}
                <span className={selected ? 'text-ktip-ocean-500' : 'text-ktip-sand-400'}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {orphans.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {orphans.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => toggle(tag)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border border-ktip-ocean-500 bg-ktip-ocean-50 text-ktip-ocean-800"
            >
              <Check size={13} />
              {tag}
            </button>
          ))}
        </div>
      )}

      <div className="pt-2 border-t border-ktip-sand-100">
        <TagInput
          values={[]}
          onChange={(added) => {
            const clean = added.map(sanitizeTag).filter(Boolean)
            const next = [...values]
            for (const tag of clean) {
              if (!next.includes(tag) && next.length < max) next.push(tag)
            }
            onChange(next)
          }}
          suggestions={CONTENT_TAG_SUGGESTIONS.filter((s) => !values.includes(s))}
          max={max}
          label={t`Add your own`}
          description={t`Anything not listed above. Matches content tagged with the same word.`}
          placeholder={t`e.g. blue economy`}
        />
      </div>
    </div>
  )
}
