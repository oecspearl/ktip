import { createSignal, createMemo, Show, For, Suspense } from 'solid-js'
import { useParams, useNavigate, A } from '@solidjs/router'
import { MainLayout } from '../../components/layout/MainLayout'
import { PostCard } from '../../components/forums/PostCard'
import { useForumBoard, useForumPosts } from '../../hooks/useForums'
import { Plus, Search, MessageCircle, ChevronRight } from 'lucide-solid'
import { debounce } from '../../lib/utils'
import { usePageTitle } from '../../hooks/usePageTitle'

export default function BoardPage() {
  const params = useParams()
  const navigate = useNavigate()

  const { board } = useForumBoard(() => params.slug)
  usePageTitle(() => board()?.name ? `${board()!.name} — Forums` : 'Forums')

  const [searchQuery, setSearchQuery] = createSignal('')
  const [debouncedSearch, setDebouncedSearch] = createSignal('')
  const debouncedSetSearch = debounce((val: string) => setDebouncedSearch(val), 300)

  const boardId = createMemo(() => board()?.id)
  const { posts } = useForumPosts(boardId, {
    get search() { return debouncedSearch() },
  })

  return (
    <MainLayout>
      <Suspense
        fallback={
          <div class="container mx-auto px-4 py-8">
            <div class="bg-gray-800 min-h-[180px] rounded-none animate-pulse-soft mb-0" />
            <div class="py-8 space-y-4">
              <div class="h-12 w-64 bg-ktip-sand-100 rounded-lg animate-pulse-soft" />
              <div class="h-24 bg-ktip-sand-100 rounded-xl animate-pulse-soft" />
              <div class="h-24 bg-ktip-sand-100 rounded-xl animate-pulse-soft" />
              <div class="h-24 bg-ktip-sand-100 rounded-xl animate-pulse-soft" />
            </div>
          </div>
        }
      >
        <Show
          when={!board.loading && board()}
          fallback={
            <div class="container mx-auto px-4 py-16 text-center">
              <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <MessageCircle size={32} class="text-ktip-sand-400" />
              </div>
              <h2 class="text-2xl font-display font-bold uppercase text-ktip-sand-900 mb-2">
                Board Not Found
              </h2>
              <p class="text-gray-500 mb-6">This forum board doesn't exist.</p>
              <button
                onClick={() => navigate('/forums')}
                class="px-6 py-2.5 bg-ktip-ocean-600 text-white text-sm font-bold uppercase tracking-wider rounded-lg hover:bg-ktip-ocean-700 transition-colors"
              >
                Back to Forums
              </button>
            </div>
          }
        >
          {/* === Dark Hero Header Band === */}
          <div class="bg-gray-800 min-h-[180px] flex items-center">
            <div class="container mx-auto px-4 py-10">
              <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                  <p class="text-gray-400 text-sm uppercase tracking-widest mb-2">Forum Board</p>
                  <h1 class="text-3xl md:text-4xl font-display font-bold text-white mb-3">
                    {board()!.name}
                  </h1>
                  <Show when={board()!.description}>
                    <p class="text-gray-300 text-sm">{board()!.description}</p>
                  </Show>
                </div>
                <div class="flex items-center gap-4">
                  <A href={`/forums/${params.slug}/new`}>
                    <button class="inline-flex items-center gap-2 px-4 py-2 bg-ktip-ocean-600 text-white text-sm font-bold uppercase tracking-wider rounded-lg hover:bg-ktip-ocean-700 transition-colors">
                      <Plus size={16} />
                      New Post
                    </button>
                  </A>
                  <nav class="text-sm text-gray-400 hidden md:block" aria-label="Breadcrumb">
                    <A href="/" class="hover:text-white transition-colors">Home</A>
                    <span class="mx-1.5"><ChevronRight size={12} class="inline" /></span>
                    <A href="/forums" class="hover:text-white transition-colors">Forums</A>
                    <span class="mx-1.5"><ChevronRight size={12} class="inline" /></span>
                    <span class="text-gray-300">{board()!.name}</span>
                  </nav>
                </div>
              </div>
            </div>
          </div>

          {/* === Content Area === */}
          <div class="bg-white py-12">
            <div class="max-w-4xl mx-auto px-4">
              {/* Search */}
              <div class="mb-8">
                <div class="relative">
                  <Search size={18} class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery()}
                    onInput={(e) => {
                      setSearchQuery(e.currentTarget.value)
                      debouncedSetSearch(e.currentTarget.value)
                    }}
                    placeholder="Search posts..."
                    class="w-full pl-10 pr-4 py-2.5 border border-gray-300 bg-white rounded-lg text-sm focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors"
                  />
                </div>
              </div>

              {/* Posts List */}
              <Show
                when={posts()?.length}
                fallback={
                  <div class="text-center py-12">
                    <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <MessageCircle size={32} class="text-gray-400" />
                    </div>
                    <p class="text-lg font-medium text-ktip-sand-700 mb-2">No posts yet</p>
                    <p class="text-sm text-gray-500">Start the discussion!</p>
                  </div>
                }
              >
                <div class="divide-y divide-gray-200">
                  <For each={posts()}>
                    {(post) => (
                      <div class="py-4">
                        <PostCard post={post} boardSlug={params.slug!} />
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </div>
          </div>
        </Show>
      </Suspense>
    </MainLayout>
  )
}
