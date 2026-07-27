import { Show, For } from 'solid-js'
import {
  Rocket,
  FolderKanban,
  Calendar,
  DollarSign,
  Users,
  MessageSquare,
  FileText,
  Handshake,
  Settings,
  Wrench,
} from 'lucide-solid'
import { HelpArticle } from './HelpArticle'
import type { HelpCategory as HelpCategoryType } from '../../lib/help-content'

const ICON_MAP: Record<string, any> = {
  Rocket,
  FolderKanban,
  Calendar,
  DollarSign,
  Users,
  MessageSquare,
  FileText,
  Handshake,
  Settings,
  Wrench,
}

interface HelpCategoryProps {
  category: HelpCategoryType
  expandedArticleId: () => string | null
  onToggleArticle: (id: string) => void
}

export function HelpCategorySection(props: HelpCategoryProps) {
  const Icon = () => ICON_MAP[props.category.icon] || Rocket

  return (
    <Show when={props.category.articles.length > 0}>
      <section class="mb-8">
        <div class="flex items-center gap-3 mb-4">
          <div class="w-10 h-10 rounded-xl bg-ktip-ocean-50 flex items-center justify-center text-ktip-ocean-600">
            {(() => {
              const I = Icon()
              return <I size={20} />
            })()}
          </div>
          <div>
            <h2 class="text-lg font-display font-bold text-ktip-sand-900">
              {props.category.title}
            </h2>
            <p class="text-sm text-ktip-sand-500">{props.category.description}</p>
          </div>
        </div>

        <div class="space-y-2">
          <For each={props.category.articles}>
            {(article) => (
              <HelpArticle
                article={article}
                expanded={props.expandedArticleId() === article.id}
                onToggle={() => props.onToggleArticle(article.id)}
              />
            )}
          </For>
        </div>
      </section>
    </Show>
  )
}
