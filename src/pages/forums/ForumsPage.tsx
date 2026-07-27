import { Show, For, Suspense } from 'solid-js'
import { A } from '@solidjs/router'
import { MainLayout } from '../../components/layout/MainLayout'
import { BoardCard } from '../../components/forums/BoardCard'
import { useForumBoards } from '../../hooks/useForums'
import { MessageSquare, ChevronRight } from 'lucide-solid'
import { SkeletonGrid } from '../../components/ui/SkeletonCard'
import { usePageTitle } from '../../hooks/usePageTitle'

export default function ForumsPage() {
  usePageTitle(() => 'Forums')
  const { boards } = useForumBoards()

  return (
    <MainLayout>
      {/* === Dark Hero Header Band === */}
      <div class="bg-gray-800 min-h-[180px] flex items-center">
        <div class="container mx-auto px-4 py-10">
          <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <p class="text-gray-400 text-sm uppercase tracking-widest mb-2">Community Forums</p>
              <h1 class="text-3xl md:text-4xl font-display font-bold text-white">Forums</h1>
            </div>
            <nav class="text-sm text-gray-400 hidden md:block" aria-label="Breadcrumb">
              <A href="/" class="hover:text-white transition-colors">Home</A>
              <span class="mx-2"><ChevronRight size={12} class="inline" /></span>
              <span class="text-gray-300">Forums</span>
            </nav>
          </div>
        </div>
      </div>

      {/* === Board Grid === */}
      <div class="bg-white py-12">
        <div class="max-w-5xl mx-auto px-4">
          <Suspense fallback={<SkeletonGrid count={6} />}>
            <Show
              when={boards()?.length}
              fallback={
                <div class="text-center py-16">
                  <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <MessageSquare size={32} class="text-gray-400" />
                  </div>
                  <h3 class="text-2xl font-display font-bold text-ktip-sand-900 mb-2">
                    No forum boards available yet
                  </h3>
                  <p class="text-gray-500">Check back soon for community discussions.</p>
                </div>
              }
            >
              <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                <For each={boards()}>
                  {(board) => <BoardCard board={board} />}
                </For>
              </div>
            </Show>
          </Suspense>
        </div>
      </div>
    </MainLayout>
  )
}
