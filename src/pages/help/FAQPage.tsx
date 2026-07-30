import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ChevronDown, Search, HelpCircle, MessageCircle } from 'lucide-react'
import { FAQS, FAQ_CATEGORIES, searchFAQs } from '../../lib/faq-content'
import { PageHero } from '../../components/layout/PageHero'
import { FeedbackModal } from '../../components/feedback/FeedbackModal'
import { usePageTitle } from '../../hooks/usePageTitle'

export default function FAQPage() {
  usePageTitle('FAQ')

  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [showFeedback, setShowFeedback] = useState(false)

  const results = useMemo(() => searchFAQs(query), [query])

  const grouped = useMemo(() => {
    return FAQ_CATEGORIES.map((category) => ({
      category,
      items: results.filter((f) => f.category === category),
    })).filter((g) => g.items.length > 0)
  }, [results])

  return (
    <>
      <PageHero
        eyebrow="Help Center"
        title="Frequently Asked Questions"
        subtitle="Quick answers about projects, teams, connections, messaging, grants, and your account."
        imageSeed="help"
        compact
        breadcrumb={[
          { label: 'Home', href: '/' },
          { label: 'Help Center', href: '/help' },
          { label: 'FAQ' },
        ]}
      />

      <div className="w-full max-w-[calc(50vw+48rem)] mx-auto px-4 py-10 max-w-3xl">
        {/* Search */}
        <div className="relative mb-8">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search questions..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-3 border border-gray-300 bg-ktip-cream rounded-xl text-sm focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors"
          />
        </div>

        {grouped.length > 0 ? (
          <div className="space-y-8">
            {grouped.map(({ category, items }) => (
              <div key={category} data-spy={category} className="scroll-mt-24">
                <h2 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-3">
                  {category}
                </h2>
                <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 bg-ktip-cream overflow-hidden">
                  {items.map((faq) => {
                    const isOpen = openId === faq.id
                    return (
                      <div key={faq.id}>
                        <button
                          onClick={() => setOpenId(isOpen ? null : faq.id)}
                          aria-expanded={isOpen}
                          className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-ktip-sand-50/50 transition-colors"
                        >
                          <span className="text-sm font-semibold text-ktip-sand-900">
                            {faq.question}
                          </span>
                          <ChevronDown
                            size={18}
                            className={`text-ktip-sand-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                          />
                        </button>
                        {isOpen && (
                          <p className="px-5 pb-4 text-sm text-ktip-sand-600 leading-relaxed">
                            {faq.answer}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <HelpCircle size={32} className="text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-ktip-sand-900 mb-1">No matching questions</h3>
            <p className="text-gray-500 text-sm">
              Try different keywords, or browse the{' '}
              <Link to="/help" className="text-ktip-ocean-600 hover:underline">Help Center</Link>.
            </p>
          </div>
        )}

        {/* Didn't find an answer */}
        <div
          id="feedback"
          data-spy="Feedback"
          className="scroll-mt-24 mt-12 p-6 bg-ktip-ocean-50 border border-ktip-ocean-200 rounded-2xl text-center"
        >
          <p className="text-sm font-semibold text-ktip-sand-900 mb-1">
            Didn't find what you were looking for?
          </p>
          <p className="text-sm text-ktip-sand-600 mb-4">
            {FAQS.length} questions answered here — for anything else, send us feedback.
          </p>
          <button
            onClick={() => setShowFeedback(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 btn-brand text-sm font-bold rounded-lg"
          >
            <MessageCircle size={16} />
            Send Feedback
          </button>
        </div>
      </div>

      <FeedbackModal open={showFeedback} onClose={() => setShowFeedback(false)} />
    </>
  )
}
