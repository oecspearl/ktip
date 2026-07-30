import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { HelpSearch } from '../../components/help/HelpSearch'
import { HelpCategoryNav } from '../../components/help/HelpCategoryNav'
import { HelpCategorySection } from '../../components/help/HelpCategory'
import { HELP_CATEGORIES, searchHelpContent } from '../../lib/help-content'
import { usePageTitle } from '../../hooks/usePageTitle'
import { HelpCircle, MessageSquare, Users, Sparkles } from 'lucide-react'
import { PageHero } from '../../components/layout/PageHero'
import { useMessagingPanel } from '../../contexts/MessagingPanelContext'
import { ASSISTANT_CONVERSATION_ID, ASSISTANT_NAME } from '../../lib/assistant'

export default function HelpCenterPage() {
  usePageTitle('Help Center')
  const { openPanel } = useMessagingPanel()

  // /help?article=<id> and /help?q=<text> let the global search panel land on
  // a specific answer instead of the top of the page
  const [searchParams] = useSearchParams()
  const requestedArticle = searchParams.get('article')
  const requestedQuery = searchParams.get('q')

  const [searchQuery, setSearchQuery] = useState(requestedQuery ?? '')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [expandedArticleId, setExpandedArticleId] = useState<string | null>(requestedArticle)

  useEffect(() => {
    if (requestedQuery !== null) setSearchQuery(requestedQuery)
  }, [requestedQuery])

  useEffect(() => {
    if (!requestedArticle) return
    setExpandedArticleId(requestedArticle)
    // MainLayout scrolls to the top on navigation; rAF runs after that
    const frame = requestAnimationFrame(() => {
      document
        .getElementById(`help-${requestedArticle}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    return () => cancelAnimationFrame(frame)
  }, [requestedArticle])

  const hasQuery = searchQuery.trim() !== ''
  const isFiltered = hasQuery || selectedCategory !== ''

  const filteredCategories = useMemo(
    () => searchHelpContent(HELP_CATEGORIES, searchQuery, selectedCategory),
    [searchQuery, selectedCategory]
  )

  // Sidebar counts follow the query but ignore the category filter, so picking a
  // category never hides the other categories' counts from you.
  const matchCounts = useMemo(() => {
    if (!hasQuery) return null
    const matched = searchHelpContent(HELP_CATEGORIES, searchQuery, '')
    return Object.fromEntries(matched.map((cat) => [cat.id, cat.articles.length]))
  }, [hasQuery, searchQuery])

  const totalArticles = useMemo(
    () => filteredCategories.reduce((sum, cat) => sum + cat.articles.length, 0),
    [filteredCategories]
  )

  // Functional updates: opening another card fires in the same batch as the open
  // card's outside-click collapse, so reading the previous value is what keeps
  // the newly clicked card open instead of both writes fighting.
  const toggleArticle = useCallback((id: string) => {
    setExpandedArticleId((prev) => (prev === id ? null : id))
  }, [])

  const collapseArticle = useCallback(() => setExpandedArticleId(null), [])

  const clearFilters = () => {
    setSearchQuery('')
    setSelectedCategory('')
  }

  return (
    <>
      <PageHero
        eyebrow="Help Center"
        title="How Can We Help?"
        imageSeed="help"
        breadcrumb={[{ label: 'Home', href: '/' }, { label: 'Help Center' }]}
      >
        <Link
          to="/help/faq"
          className="inline-block text-sm text-ktip-nav-accent hover:text-white transition-colors"
        >
          Browse the FAQ →
        </Link>
        {/* Search embedded in hero; category filtering lives in the sidebar */}
        <div className="max-w-2xl mt-4">
          <HelpSearch
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            resultCount={hasQuery ? totalArticles : undefined}
          />
        </div>
      </PageHero>

      <div className="bg-ktip-sand-50 py-10">
        <div className="max-w-[calc(50vw+32rem)] mx-auto px-4">
          {/* Categories in a sidebar, articles as cards. The role-based quick
              start cards used to sit above this; they duplicated the
              "Getting Started" category (same heading, same `getting-started`
              anchor), so the category is now the single source. */}
          <section id="topics" data-spy="Topics" className="scroll-mt-24">
            <div className="flex flex-col lg:flex-row gap-6 items-start">
              <HelpCategoryNav
                categories={HELP_CATEGORIES}
                selectedCategory={selectedCategory}
                onSelect={setSelectedCategory}
                matchCounts={matchCounts}
              />

              <div className="flex-1 min-w-0 w-full">
                {isFiltered && (
                  <div className="flex items-center justify-between gap-4 mb-6">
                    <h2 className="text-2xl font-display font-bold text-ktip-sand-900">
                      {hasQuery ? 'Search Results' : 'Browsing by category'}
                    </h2>
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="text-sm text-ktip-ocean-600 hover:text-ktip-ocean-700 font-medium shrink-0"
                    >
                      Clear all
                    </button>
                  </div>
                )}

                {filteredCategories.length > 0 ? (
                  filteredCategories.map((category) => (
                    <HelpCategorySection
                      key={category.id}
                      category={category}
                      expandedArticleId={expandedArticleId}
                      onToggleArticle={toggleArticle}
                      onCollapseArticle={collapseArticle}
                    />
                  ))
                ) : (
                  <div className="text-center py-16">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <HelpCircle size={28} className="text-gray-400" />
                    </div>
                    <h3 className="text-xl font-display font-bold text-ktip-sand-900 mb-2">
                      No articles found
                    </h3>
                    <p className="text-gray-500 mb-4 max-w-md mx-auto">
                      We could not find any articles matching your search. Try different keywords, or
                      ask the {ASSISTANT_NAME} in Messages.
                    </p>
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="text-ktip-ocean-600 hover:text-ktip-ocean-700 font-medium"
                    >
                      Clear search
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Contact CTA */}
          {!isFiltered && (
            <section id="contact" data-spy="Contact" className="scroll-mt-24 mt-12">
              <div className="bg-ktip-ocean-700 rounded-2xl text-center py-10 px-6">
                <h3 className="text-xl font-display font-bold text-white mb-2">Still need help?</h3>
                <p className="text-ktip-ocean-100 mb-6 max-w-lg mx-auto">
                  If you could not find what you are looking for, reach out to the community or chat with our AI assistant.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => openPanel({ conversationId: ASSISTANT_CONVERSATION_ID })}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-ktip-cream text-ktip-ocean-700 rounded-lg hover:bg-ktip-ocean-50 transition-colors font-medium text-sm"
                  >
                    <Sparkles size={18} />
                    Ask the {ASSISTANT_NAME}
                  </button>
                  <Link
                    to="/messages"
                    className="inline-flex items-center gap-2 px-5 py-2.5 border border-white/30 text-white rounded-lg hover:bg-white/10 transition-colors font-medium text-sm"
                  >
                    <MessageSquare size={18} />
                    Send a Message
                  </Link>
                  <Link
                    to="/forums"
                    className="inline-flex items-center gap-2 px-5 py-2.5 border border-white/30 text-white rounded-lg hover:bg-white/10 transition-colors font-medium text-sm"
                  >
                    <Users size={18} />
                    Visit Forums
                  </Link>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  )
}
