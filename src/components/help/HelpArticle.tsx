import { Show, For } from 'solid-js'
import { ChevronDown } from 'lucide-solid'
import type { HelpArticle as HelpArticleType } from '../../lib/help-content'

interface HelpArticleProps {
  article: HelpArticleType
  expanded: boolean
  onToggle: () => void
}

export function HelpArticle(props: HelpArticleProps) {
  const paragraphs = () => props.article.content.split('\n\n')

  return (
    <div class="border border-ktip-sand-100 rounded-xl overflow-hidden transition-colors hover:border-ktip-sand-200">
      <button
        type="button"
        onClick={props.onToggle}
        aria-expanded={props.expanded}
        class="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <span class="font-medium text-ktip-sand-900 pr-4">{props.article.title}</span>
        <ChevronDown
          size={18}
          class={`shrink-0 text-ktip-sand-400 transition-transform duration-200 ${props.expanded ? 'rotate-180' : ''}`}
        />
      </button>

      <div
        class="grid transition-[grid-template-rows] duration-200 ease-in-out"
        style={{ 'grid-template-rows': props.expanded ? '1fr' : '0fr' }}
      >
        <div class="overflow-hidden">
          <div class="px-5 pb-5 pt-1 space-y-3">
            <Show when={paragraphs().length > 0}>
              <For each={paragraphs()}>
                {(p) => (
                  <p class="text-sm text-ktip-sand-700 leading-relaxed">{p}</p>
                )}
              </For>
            </Show>

            <Show when={props.article.tags.length > 0}>
              <div class="flex flex-wrap gap-1.5 pt-2">
                <For each={props.article.tags.slice(0, 5)}>
                  {(tag) => (
                    <span class="text-xs text-ktip-sand-500 bg-ktip-sand-50 px-2 py-0.5 rounded-full">
                      {tag}
                    </span>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </div>
      </div>
    </div>
  )
}
