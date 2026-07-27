import { useMemo, useState } from 'react'
import { Link } from 'react-router'
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
} from 'lucide-react'

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
  usePageTitle('Help Center')
  const auth = useAuth()

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [expandedArticleId, setExpandedArticleId] = useState<string | null>(null)

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
      {/* === Dark Hero Header Band === */}
      <div className="bg-gray-800 min-h-[180px] flex items-center">
        <div className="container mx-auto px-4 py-10">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <p className="text-gray-400 text-sm uppercase tracking-widest mb-2">Help Center</p>
              <h1 className="text-3xl md:text-4xl font-display font-bold text-white">How Can We Help?</h1>
              <Link
                to="/help/faq"
                className="inline-block mt-2 text-sm text-ktip-ocean-400 hover:text-ktip-ocean-300 transition-colors"
              >
                Browse the FAQ →
              </Link>
            </div>
            <nav className="text-sm text-gray-400 hidden md:block" aria-label="Breadcrumb">
              <Link to="/" className="hover:text-white transition-colors">Home</Link>
              <span className="mx-2"><ChevronRight size={12} className="inline" /></span>
              <span className="text-gray-300">Help Center</span>
            </nav>
          </div>

          {/* Search embedded in hero */}
          <div className="max-w-2xl mt-6">
            <HelpSearch
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              selectedCategory={selectedCategory}
              setSelectedCategory={setSelectedCategory}
              categories={HELP_CATEGORIES}
              resultCount={isSearching ? totalArticles : undefined}
            />
          </div>
        </div>
      </div>

      <div className="bg-white py-10">
        <div className="max-w-5xl mx-auto px-4">
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
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-ktip-ocean-700 rounded-lg hover:bg-ktip-ocean-50 transition-colors font-medium text-sm"
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
