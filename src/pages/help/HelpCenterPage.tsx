import { createSignal, createMemo, Show, For } from 'solid-js'
import { A } from '@solidjs/router'
import { MainLayout } from '../../components/layout/MainLayout'
import { HelpSearch } from '../../components/help/HelpSearch'
import { HelpCategorySection } from '../../components/help/HelpCategory'
import { AIAssistant } from '../../components/help/AIAssistant'
import {
  HELP_CATEGORIES,
  GETTING_STARTED_GUIDES,
  searchHelpContent,
} from '../../lib/help-content'
import { useAuth } from '../../contexts/AuthContext'
import { usePageTitle } from '../../hooks/usePageTitle'
import {
  HelpCircle,
  ArrowRight,
  MessageSquare,
  Users,
  Rocket,
  GraduationCap,
  Lightbulb,
  TrendingUp,
  Building2,
  Globe,
  Briefcase,
  ChevronRight,
} from 'lucide-solid'

const ROLE_ICONS: Record<string, any> = {
  student: GraduationCap,
  mentor: Lightbulb,
  entrepreneur: Rocket,
  investor: TrendingUp,
  private_sector: Building2,
  oecs: Globe,
}

const ROLE_COLORS: Record<string, string> = {
  student: 'from-blue-500 to-blue-600',
  mentor: 'from-amber-500 to-amber-600',
  entrepreneur: 'from-emerald-500 to-emerald-600',
  investor: 'from-purple-500 to-purple-600',
  private_sector: 'from-rose-500 to-rose-600',
  oecs: 'from-cyan-500 to-cyan-600',
}

export default function HelpCenterPage() {
  usePageTitle(() => 'Help Center')
  const auth = useAuth()

  const [searchQuery, setSearchQuery] = createSignal('')
  const [selectedCategory, setSelectedCategory] = createSignal('')
  const [expandedArticleId, setExpandedArticleId] = createSignal<string | null>(null)

  const isSearching = () => searchQuery().trim() !== '' || selectedCategory() !== ''

  const filteredCategories = createMemo(() =>
    searchHelpContent(HELP_CATEGORIES, searchQuery(), selectedCategory())
  )

  const totalArticles = createMemo(() =>
    filteredCategories().reduce((sum, cat) => sum + cat.articles.length, 0)
  )

  const toggleArticle = (id: string) => {
    setExpandedArticleId(expandedArticleId() === id ? null : id)
  }

  return (
    <MainLayout>
      {/* === Dark Hero Header Band === */}
      <div class="bg-gray-800 min-h-[180px] flex items-center">
        <div class="container mx-auto px-4 py-10">
          <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <p class="text-gray-400 text-sm uppercase tracking-widest mb-2">Help Center</p>
              <h1 class="text-3xl md:text-4xl font-display font-bold text-white">How Can We Help?</h1>
            </div>
            <nav class="text-sm text-gray-400 hidden md:block" aria-label="Breadcrumb">
              <A href="/" class="hover:text-white transition-colors">Home</A>
              <span class="mx-2"><ChevronRight size={12} class="inline" /></span>
              <span class="text-gray-300">Help Center</span>
            </nav>
          </div>

          {/* Search embedded in hero */}
          <div class="max-w-2xl mt-6">
            <HelpSearch
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              selectedCategory={selectedCategory}
              setSelectedCategory={setSelectedCategory}
              categories={HELP_CATEGORIES}
              resultCount={isSearching() ? totalArticles() : undefined}
            />
          </div>
        </div>
      </div>

      <div class="bg-white py-10">
        <div class="max-w-5xl mx-auto px-4">
          {/* Quick Start Guides — Hidden during search */}
          <Show when={!isSearching()}>
            <section class="mb-12">
              <h2 class="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">
                Getting Started
              </h2>
              <p class="text-ktip-ocean-600 text-xs italic mb-6">
                Quick guides based on your role to help you hit the ground running.
              </p>

              <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <For each={GETTING_STARTED_GUIDES}>
                  {(guide) => {
                    const Icon = ROLE_ICONS[guide.role] || Briefcase
                    const gradient = ROLE_COLORS[guide.role] || 'from-gray-500 to-gray-600'
                    const isUserRole = () => auth.profile()?.roles?.[0] === guide.role

                    return (
                      <div
                        class={`relative border border-gray-200 p-6 transition-colors hover:border-ktip-ocean-400 ${
                          isUserRole() ? 'ring-2 ring-ktip-ocean-400' : ''
                        }`}
                      >
                        <Show when={isUserRole()}>
                          <div class="absolute top-3 right-3">
                            <span class="text-xs font-medium bg-ktip-ocean-100 text-ktip-ocean-700 px-2 py-0.5 rounded-full">
                              Your role
                            </span>
                          </div>
                        </Show>

                        <div
                          class={`w-10 h-10 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center mb-3`}
                        >
                          <Icon size={20} class="text-white" />
                        </div>

                        <h3 class="text-lg font-display font-bold text-ktip-sand-900 mb-1">
                          {guide.title}
                        </h3>
                        <p class="text-sm text-gray-600 mb-4">
                          {guide.description}
                        </p>

                        <ol class="space-y-2 mb-4">
                          <For each={guide.steps}>
                            {(step, i) => (
                              <li class="flex gap-2.5 text-sm text-gray-700">
                                <span class="shrink-0 w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-xs flex items-center justify-center font-medium mt-0.5">
                                  {i() + 1}
                                </span>
                                <span>{step}</span>
                              </li>
                            )}
                          </For>
                        </ol>

                        <div class="flex flex-wrap gap-2">
                          <For each={guide.quickLinks}>
                            {(link) => (
                              <A
                                href={link.href}
                                class="inline-flex items-center gap-1 text-sm text-ktip-ocean-600 hover:text-ktip-ocean-700 font-medium"
                              >
                                {link.label}
                                <ArrowRight size={14} />
                              </A>
                            )}
                          </For>
                        </div>
                      </div>
                    )
                  }}
                </For>
              </div>
            </section>
          </Show>

          {/* Category Sections */}
          <Show
            when={filteredCategories().length > 0}
            fallback={
              <div class="text-center py-16">
                <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <HelpCircle size={28} class="text-gray-400" />
                </div>
                <h3 class="text-xl font-display font-bold text-ktip-sand-900 mb-2">
                  No articles found
                </h3>
                <p class="text-gray-500 mb-4 max-w-md mx-auto">
                  We could not find any articles matching your search. Try different keywords or ask the AI assistant for help.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('')
                    setSelectedCategory('')
                  }}
                  class="text-ktip-ocean-600 hover:text-ktip-ocean-700 font-medium"
                >
                  Clear search
                </button>
              </div>
            }
          >
            <section>
              <Show when={isSearching()}>
                <h2 class="text-2xl font-display font-bold text-ktip-sand-900 mb-6">
                  Search Results
                </h2>
              </Show>
              <Show when={!isSearching()}>
                <h2 class="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">
                  Browse by Topic
                </h2>
                <p class="text-ktip-ocean-600 text-xs italic mb-6">
                  Explore all help articles organized by category.
                </p>
              </Show>

              <For each={filteredCategories()}>
                {(category) => (
                  <HelpCategorySection
                    category={category}
                    expandedArticleId={expandedArticleId}
                    onToggleArticle={toggleArticle}
                  />
                )}
              </For>
            </section>
          </Show>

          {/* Contact CTA */}
          <Show when={!isSearching()}>
            <section class="mt-12">
              <div class="bg-ktip-ocean-700 rounded-2xl text-center py-10 px-6">
                <h3 class="text-xl font-display font-bold text-white mb-2">
                  Still need help?
                </h3>
                <p class="text-ktip-ocean-100 mb-6 max-w-lg mx-auto">
                  If you could not find what you are looking for, reach out to the community or chat with our AI assistant.
                </p>
                <div class="flex flex-wrap items-center justify-center gap-3">
                  <A
                    href="/messages"
                    class="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-ktip-ocean-700 rounded-lg hover:bg-ktip-ocean-50 transition-colors font-medium text-sm"
                  >
                    <MessageSquare size={18} />
                    Send a Message
                  </A>
                  <A
                    href="/forums"
                    class="inline-flex items-center gap-2 px-5 py-2.5 border border-white/30 text-white rounded-lg hover:bg-white/10 transition-colors font-medium text-sm"
                  >
                    <Users size={18} />
                    Visit Forums
                  </A>
                </div>
              </div>
            </section>
          </Show>
        </div>
      </div>

      {/* AI Assistant floating widget */}
      <AIAssistant />
    </MainLayout>
  )
}
