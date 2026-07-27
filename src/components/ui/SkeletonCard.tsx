import { For } from 'solid-js'

export function SkeletonCard() {
  return (
    <div class="bg-white rounded-2xl shadow-card border border-ktip-sand-100 p-6 animate-pulse-soft">
      {/* Image placeholder */}
      <div class="h-40 bg-ktip-sand-100 rounded-xl mb-4" />
      {/* Badge placeholder */}
      <div class="h-5 w-20 bg-ktip-sand-100 rounded-full mb-3" />
      {/* Title placeholder */}
      <div class="h-6 bg-ktip-sand-100 rounded-lg mb-2 w-3/4" />
      {/* Description lines */}
      <div class="space-y-2 mb-4">
        <div class="h-4 bg-ktip-sand-100 rounded w-full" />
        <div class="h-4 bg-ktip-sand-100 rounded w-5/6" />
      </div>
      {/* Footer placeholder */}
      <div class="flex items-center justify-between pt-4 border-t border-ktip-sand-100">
        <div class="flex items-center gap-2">
          <div class="h-6 w-6 bg-ktip-sand-100 rounded-full" />
          <div class="h-4 w-24 bg-ktip-sand-100 rounded" />
        </div>
        <div class="h-4 w-16 bg-ktip-sand-100 rounded" />
      </div>
    </div>
  )
}

export function SkeletonGrid(props: { count?: number }) {
  return (
    <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
      <For each={Array.from({ length: props.count ?? 6 })}>
        {() => <SkeletonCard />}
      </For>
    </div>
  )
}
