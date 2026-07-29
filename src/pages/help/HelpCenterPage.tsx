import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
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
} from 'lucide-react'
import { PageHero } from '../../components/layout/PageHero'

const ROLE_ICONS: Record<string, any> = {
  student: GraduationCap,
  mentor: Lightbulb,
  entrepreneur: Rocket,
  investor: TrendingUp,
  private_sector: Building2,
  oecs: Globe,
}

const ROLE_COLORS: Record<string, string> = {
  student: 'from-ktip-ocean-500 to-ktip-ocean-600',
  mentor: 'from-ktip-sun-500 to-ktip-sun-600',
  entrepreneur: 'from-ktip-tropical-500 to-ktip-tropical-700',
  investor: 'from-ktip-ocean-500 to-ktip-ocean-600',
  private_sector: 'from-red-500 to-red-600',
  oecs: 'from-ktip-ocean-400 to-ktip-ocean-500',
}

export default function HelpCenterPage() {
  usePageTitle('Help Center')
  const auth = useAuth()

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

  const isSearching = searchQuery.trim() !== '' || selectedCategory !== ''

  const filteredCategories = useMemo(
    () => searchHelpContent(HELP_CATEGORIES, searchQuery, selectedCategory),
    [searchQuery, selectedCategory]
  )

  const totalArticles = useMemo(
    () => filteredCategories.reduce((sum, cat) => sum + cat.articles.length, 0),
    [filteredCategories]
  )

  const toggleArticle = (id: string) => {
    setExpandedArticleId(expandedArticleId === id ? null : id)
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
        {/* Search embedded in hero */}
        <div className="max-w-2xl mt-4">
          <HelpSearch
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            selectedCategory={selectedCategory}
            setSelectedCategory={setSelectedCategory}
            categories={HELP_CATEGORIES}
            resultCount={isSearching ? totalArticles : undefined}
          />
        </div>
      </PageHero>

      <div className="bg-ktip-sand-50 py-10">
        <div className="max-w-[calc(50vw+32rem)] mx-auto px-4">
          {/* Quick Start Guides — Hidden during search */}
          {!isSearching && (
            <section className="mb-12">
              <h2 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">
                Getting Started
              </h2>
              <p className="text-ktip-ocean-600 text-xs italic mb-6">
                Quick guides based on your role to help you hit the ground running.
              </p>

              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {GETTING_STARTED_GUIDES.map((guide) => {
                  const Icon = ROLE_ICONS[guide.role] || Briefcase
                  const gradient = ROLE_COLORS[guide.role] || 'from-gray-500 to-gray-600'
                  const isUserRole = auth.profile?.roles?.[0] === guide.role

                  return (
                    <div
                      key={guide.role}
                      className={`relative border border-gray-200 p-6 transition-colors hover:border-ktip-ocean-400 ${
                        isUserRole ? 'ring-2 ring-ktip-ocean-400' : ''
                      }`}
                    >
                      {isUserRole && (
                        <div className="absolute top-3 right-3">
                          <span className="text-xs font-medium bg-ktip-ocean-100 text-ktip-ocean-700 px-2 py-0.5 rounded-full">
                            Your role
                          </span>
                        </div>
                      )}

                      <div
                        className={`w-10 h-10 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center mb-3`}
                      >
                        <Icon size={20} className="text-white" />
                      </div>

                      <h3 className="text-lg font-display font-bold text-ktip-sand-900 mb-1">
                        {guide.title}
                      </h3>
                      <p className="text-sm text-gray-600 mb-4">
                        {guide.description}
                      </p>

                      <ol className="space-y-2 mb-4">
                        {guide.steps.map((step, i) => (
                          <li key={i} className="flex gap-2.5 text-sm text-gray-700">
                            <span className="shrink-0 w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-xs flex items-center justify-center font-medium mt-0.5">
                              {i + 1}
                            </span>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ol>

                      <div className="flex flex-wrap gap-2">
                        {guide.quickLinks.map((link) => (
                          <Link
                            key={link.href}
                            to={link.href}
                            className="inline-flex items-center gap-1 text-sm text-ktip-ocean-600 hover:text-ktip-ocean-700 font-medium"
                          >
                            {link.label}
                            <ArrowRight size={14} />
                          </Link>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* Category Sections */}
          {filteredCategories.length > 0 ? (
            <section>
              {isSearching && (
                <h2 className="text-2xl font-display font-bold text-ktip-sand-900 mb-6">
                  Search Results
                </h2>
              )}
              {!isSearching && (
                <>
                  <h2 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">
                    Browse by Topic
                  </h2>
                  <p className="text-ktip-ocean-600 text-xs italic mb-6">
                    Explore all help articles organized by category.
                  </p>
                </>
              )}

              {filteredCategories.map((category) => (
                <HelpCategorySection
                  key={category.id}
                  category={category}
                  expandedArticleId={expandedArticleId}
                  onToggleArticle={toggleArticle}
                />
              ))}
            </section>
          ) : (
            <div className="text-center py-16">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <HelpCircle size={28} className="text-gray-400" />
              </div>
              <h3 className="text-xl font-display font-bold text-ktip-sand-900 mb-2">
                No articles found
              </h3>
              <p className="text-gray-500 mb-4 max-w-md mx-auto">
                We could not find any articles matching your search. Try different keywords or ask the AI assistant for help.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('')
                  setSelectedCategory('')
                }}
                className="text-ktip-ocean-600 hover:text-ktip-ocean-700 font-medium"
              >
                Clear search
              </button>
            </div>
          )}

          {/* Contact CTA */}
          {!isSearching && (
            <section className="mt-12">
              <div className="bg-ktip-ocean-700 rounded-2xl text-center py-10 px-6">
                <h3 className="text-xl font-display font-bold text-white mb-2">
                  Still need help?
                </h3>
                <p className="text-ktip-ocean-100 mb-6 max-w-lg mx-auto">
                  If you could not find what you are looking for, reach out to the community or chat with our AI assistant.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <Link
                    to="/messages"
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-ktip-cream text-ktip-ocean-700 rounded-lg hover:bg-ktip-ocean-50 transition-colors font-medium text-sm"
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

      {/* AI Assistant floating widget */}
      <AIAssistant />
    </>
  )
}
