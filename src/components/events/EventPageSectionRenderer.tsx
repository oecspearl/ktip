import { createSignal, Show, For } from 'solid-js'
import { type EventPageSection } from '../../types'
import { ChevronDown, ChevronUp, MapPin, ExternalLink } from 'lucide-solid'

interface EventPageSectionRendererProps {
  section: EventPageSection
}

export function EventPageSectionRenderer(props: EventPageSectionRendererProps) {
  const [openIndex, setOpenIndex] = createSignal<number>(-1)

  const toggleFaq = (index: number) => {
    setOpenIndex(openIndex() === index ? -1 : index)
  }

  return (
    <div class="bg-white rounded-xl border border-ktip-sand-200 shadow-card p-6">
      <Show when={props.section.section_type === 'about' || props.section.section_type === 'custom'}>
        <h3 class="text-xl font-display font-bold text-ktip-sand-900 mb-4">
          {props.section.title}
        </h3>
        <p class="text-ktip-sand-700 whitespace-pre-wrap">
          {props.section.content.body}
        </p>
      </Show>

      <Show when={props.section.section_type === 'faq'}>
        <h3 class="text-xl font-display font-bold text-ktip-sand-900 mb-4">
          {props.section.title}
        </h3>
        <div class="space-y-1">
          <For each={props.section.content.items as Array<{ question: string; answer: string }>}>
            {(item, index) => (
              <div>
                <button
                  type="button"
                  class="flex items-center justify-between w-full text-left py-3 px-4 hover:bg-ktip-sand-50 rounded-lg transition-colors font-medium text-ktip-sand-800"
                  onClick={() => toggleFaq(index())}
                >
                  <span>{item.question}</span>
                  <Show when={openIndex() === index()} fallback={<ChevronDown class="w-5 h-5 text-ktip-sand-400 flex-shrink-0 ml-2" />}>
                    <ChevronUp class="w-5 h-5 text-ktip-sand-400 flex-shrink-0 ml-2" />
                  </Show>
                </button>
                <Show when={openIndex() === index()}>
                  <div class="px-4 pb-3 text-ktip-sand-600 text-sm">
                    {item.answer}
                  </div>
                </Show>
              </div>
            )}
          </For>
        </div>
      </Show>

      <Show when={props.section.section_type === 'venue'}>
        <h3 class="text-xl font-display font-bold text-ktip-sand-900 mb-4">
          {props.section.title}
        </h3>
        <div class="space-y-2">
          <Show when={props.section.content.name}>
            <p class="font-bold text-ktip-sand-900">{props.section.content.name}</p>
          </Show>
          <Show when={props.section.content.address}>
            <p class="text-ktip-sand-700 flex items-start gap-2">
              <MapPin class="w-4 h-4 mt-0.5 flex-shrink-0 text-ktip-sand-400" />
              <span>{props.section.content.address}</span>
            </p>
          </Show>
          <Show when={props.section.content.directions}>
            <p class="text-ktip-sand-600 text-sm">{props.section.content.directions}</p>
          </Show>
          <Show when={props.section.content.map_url}>
            <a
              href={props.section.content.map_url}
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1.5 text-ktip-ocean-600 hover:text-ktip-ocean-700 font-medium text-sm mt-2 transition-colors"
            >
              <span>View on Map</span>
              <ExternalLink class="w-4 h-4" />
            </a>
          </Show>
        </div>
      </Show>

      <Show when={props.section.section_type === 'sponsors'}>
        <h3 class="text-xl font-display font-bold text-ktip-sand-900 mb-4">
          {props.section.title}
        </h3>
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          <For each={props.section.content.items as Array<{ name: string; logo_url?: string; website?: string }>}>
            {(sponsor) => {
              const content = (
                <div class="flex flex-col items-center text-center p-4 rounded-xl border border-ktip-sand-100 hover:border-ktip-sand-200 transition-colors">
                  <Show
                    when={sponsor.logo_url}
                    fallback={
                      <div class="w-16 h-16 rounded-full bg-ktip-sand-100 flex items-center justify-center text-ktip-sand-500 font-display font-bold text-lg mb-3">
                        {sponsor.name
                          .split(' ')
                          .map((w) => w[0])
                          .join('')
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                    }
                  >
                    <img
                      src={sponsor.logo_url!}
                      alt={sponsor.name}
                      class="w-16 h-16 object-contain rounded-lg mb-3"
                    />
                  </Show>
                  <span class="text-sm font-medium text-ktip-sand-800">{sponsor.name}</span>
                </div>
              )

              return (
                <Show
                  when={sponsor.website}
                  fallback={content}
                >
                  <a
                    href={sponsor.website}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {content}
                  </a>
                </Show>
              )
            }}
          </For>
        </div>
      </Show>
    </div>
  )
}
