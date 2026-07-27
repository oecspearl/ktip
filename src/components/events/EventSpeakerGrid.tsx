import { Show, For } from 'solid-js'
import { type EventSpeaker } from '../../types'
import { Mic, Globe } from 'lucide-solid'

interface EventSpeakerGridProps {
  speakers: EventSpeaker[]
}

export function EventSpeakerGrid(props: EventSpeakerGridProps) {
  return (
    <div class="bg-white rounded-xl border border-ktip-sand-200 shadow-card p-6">
      <h2 class="text-xl font-display font-bold text-ktip-sand-900 mb-4 flex items-center gap-2">
        <Mic class="text-ktip-ocean-600" size={20} />
        Speakers
      </h2>

      <Show
        when={props.speakers.length > 0}
        fallback={
          <p class="text-sm text-ktip-sand-500">
            Speakers will be announced soon.
          </p>
        }
      >
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <For each={props.speakers}>
            {(speaker) => (
              <div class="flex flex-col items-center text-center">
                <Show
                  when={speaker.photo_url}
                  fallback={
                    <div class="w-20 h-20 bg-ktip-ocean-100 rounded-full flex items-center justify-center text-2xl font-bold text-ktip-ocean-700 mb-3">
                      {speaker.name.charAt(0).toUpperCase()}
                    </div>
                  }
                >
                  <img
                    src={speaker.photo_url!}
                    alt={speaker.name}
                    class="w-20 h-20 rounded-full object-cover mb-3"
                  />
                </Show>

                <span class="font-semibold text-ktip-sand-900">
                  {speaker.name}
                </span>

                <Show when={speaker.title}>
                  <span class="text-sm text-ktip-sand-500 mt-0.5">
                    {speaker.title}
                  </span>
                </Show>

                <Show when={speaker.bio}>
                  <p class="text-sm text-ktip-sand-600 mt-2 line-clamp-3">
                    {speaker.bio}
                  </p>
                </Show>

                <Show when={speaker.website}>
                  <a
                    href={speaker.website!}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center gap-1 text-xs text-ktip-ocean-600 hover:text-ktip-ocean-700 mt-2"
                  >
                    <Globe size={12} />
                    Website
                  </a>
                </Show>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
