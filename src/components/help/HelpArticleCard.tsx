import { useEffect, useRef } from 'react'
import { ChevronDown } from 'lucide-react'
import { useDisclosureAnimation } from '../ui/useDisclosureAnimation'
import type { HelpArticle } from '../../lib/help-content'

/** Marks a card root so the outside-click handler can tell cards from the page. */
const CARD_MARKER = 'data-help-card'

interface HelpArticleCardProps {
  article: HelpArticle
  expanded: boolean
  onToggle: () => void
  onCollapse: () => void
}

/**
 * One help article as a card in the category grid.
 *
 * Expanding spans the full grid width rather than growing one column, so the
 * answer gets a readable measure and the surrounding cards keep their row
 * heights instead of stretching to match the tallest one.
 *
 * The answer and the two-line preview each fold on the shared
 * `disclosure-collapse` transition, and both stay mounted so closing animates
 * too. The column span is held until the collapse has settled — dropping it on
 * the click would reflow the row out from under the closing animation.
 *
 * Anywhere on a collapsed card opens it; a click outside closes it, as does
 * Escape. The header button stays a real button so the disclosure is still
 * operable from the keyboard, and stops propagation so its own click is not
 * also seen by the card as an open.
 */
export function HelpArticleCard({
  article,
  expanded,
  onToggle,
  onCollapse,
}: HelpArticleCardProps) {
  const paragraphs = article.content.split('\n\n')

  const answer = useDisclosureAnimation(expanded, { keepMounted: true })
  const preview = useDisclosureAnimation(!expanded, { keepMounted: true })
  const wide = expanded || !answer.settled

  const rootRef = useRef<HTMLElement>(null)

  // Only the open card listens, so this is one document listener rather than one
  // per article. `mousedown` rather than `click`: it fires before the click that
  // opens another card, so switching cards ends up open rather than closed. A
  // press inside any card is left alone — that card's own handler owns it.
  useEffect(() => {
    if (!expanded) return

    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (rootRef.current?.contains(target)) return
      if (target?.closest(`[${CARD_MARKER}]`)) return
      onCollapse()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCollapse()
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [expanded, onCollapse])

  return (
    // The id is the scroll target for /help?article=<id> deep links
    <article
      ref={rootRef}
      id={`help-${article.id}`}
      {...{ [CARD_MARKER]: '' }}
      onClick={expanded ? undefined : onToggle}
      className={`bg-ktip-cream border rounded-xl transition-colors scroll-mt-28 ${
        expanded
          ? 'border-ktip-ocean-300'
          : 'border-ktip-sand-100 hover:border-ktip-ocean-300 cursor-pointer'
      } ${wide ? 'sm:col-span-2 xl:col-span-3' : ''}`}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onToggle()
        }}
        aria-expanded={expanded}
        className="w-full flex items-start justify-between gap-3 px-5 pt-4 pb-3 text-left"
      >
        <h3 className="font-medium text-ktip-sand-900">{article.title}</h3>
        <ChevronDown
          size={18}
          className={`shrink-0 mt-0.5 text-ktip-sand-400 transition-transform duration-200 ${
            expanded ? 'rotate-180' : ''
          }`}
        />
      </button>

      <div
        className="disclosure-collapse"
        data-state={answer.state}
        data-settled={answer.settled}
      >
        <div>
          <div className="px-5 pb-5 space-y-3">
            {paragraphs.map((p, i) => (
              <p key={i} className="text-sm text-ktip-sand-700 leading-relaxed max-w-3xl">
                {p}
              </p>
            ))}

            {article.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {article.tags.slice(0, 6).map((tag) => (
                  <span
                    key={tag}
                    className="text-xs text-ktip-sand-500 bg-ktip-sand-50 px-2 py-0.5 rounded-full"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        className="disclosure-collapse"
        data-state={preview.state}
        data-settled={preview.settled}
        aria-hidden={expanded}
      >
        <div>
          <p className="px-5 pb-4 text-sm text-ktip-sand-600 leading-relaxed line-clamp-2">
            {paragraphs[0]}
          </p>
        </div>
      </div>
    </article>
  )
}
