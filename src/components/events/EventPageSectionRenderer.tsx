import { useState } from 'react'
import { type EventPageSection } from '../../types'
import { ChevronDown, ChevronUp, MapPin, ExternalLink } from 'lucide-react'
import { Trans } from '@lingui/react/macro'

interface EventPageSectionRendererProps {
  section: EventPageSection
}

export function EventPageSectionRenderer({ section }: EventPageSectionRendererProps) {
  const [openIndex, setOpenIndex] = useState<number>(-1)

  const toggleFaq = (index: number) => {
    setOpenIndex(openIndex === index ? -1 : index)
  }

  return (
    <div className="bg-ktip-cream rounded-xl border border-ktip-sand-200 shadow-card p-6">
      {(section.section_type === 'about' || section.section_type === 'custom') && (
        <>
          <h3 className="text-xl font-display font-bold text-ktip-sand-900 mb-4">
            {section.title}
          </h3>
          <p className="text-ktip-sand-700 whitespace-pre-wrap">
            {section.content.body}
          </p>
        </>
      )}

      {section.section_type === 'faq' && (
        <>
          <h3 className="text-xl font-display font-bold text-ktip-sand-900 mb-4">
            {section.title}
          </h3>
          <div className="space-y-1">
            {(section.content.items as Array<{ question: string; answer: string }>).map((item, index) => (
              <div key={index}>
                <button
                  type="button"
                  className="flex items-center justify-between w-full text-left py-3 px-4 hover:bg-ktip-sand-50 rounded-lg transition-colors font-medium text-ktip-sand-800"
                  onClick={() => toggleFaq(index)}
                >
                  <span>{item.question}</span>
                  {openIndex === index ? (
                    <ChevronUp className="w-5 h-5 text-ktip-sand-400 flex-shrink-0 ml-2" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-ktip-sand-400 flex-shrink-0 ml-2" />
                  )}
                </button>
                {openIndex === index && (
                  <div className="px-4 pb-3 text-ktip-sand-600 text-sm">
                    {item.answer}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {section.section_type === 'venue' && (
        <>
          <h3 className="text-xl font-display font-bold text-ktip-sand-900 mb-4">
            {section.title}
          </h3>
          <div className="space-y-2">
            {section.content.name && (
              <p className="font-bold text-ktip-sand-900">{section.content.name}</p>
            )}
            {section.content.address && (
              <p className="text-ktip-sand-700 flex items-start gap-2">
                <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0 text-ktip-sand-400" />
                <span>{section.content.address}</span>
              </p>
            )}
            {section.content.directions && (
              <p className="text-ktip-sand-600 text-sm">{section.content.directions}</p>
            )}
            {section.content.map_url && (
              <a
                href={section.content.map_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-ktip-ocean-600 hover:text-ktip-ocean-700 font-medium text-sm mt-2 transition-colors"
              >
                <span><Trans>View on Map</Trans></span>
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>
        </>
      )}

      {section.section_type === 'sponsors' && (
        <>
          <h3 className="text-xl font-display font-bold text-ktip-sand-900 mb-4">
            {section.title}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {(section.content.items as Array<{ name: string; logo_url?: string; website?: string }>).map((sponsor, index) => {
              const content = (
                <div className="flex flex-col items-center text-center p-4 rounded-xl border border-ktip-sand-100 hover:border-ktip-sand-200 transition-colors">
                  {sponsor.logo_url ? (
                    <img
                      src={sponsor.logo_url}
                      alt={sponsor.name}
                      loading="lazy" decoding="async" width={64} height={64} className="w-16 h-16 object-contain rounded-lg mb-3"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-ktip-sand-100 flex items-center justify-center text-ktip-sand-500 font-display font-bold text-lg mb-3">
                      {sponsor.name
                        .split(' ')
                        .map((w) => w[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase()}
                    </div>
                  )}
                  <span className="text-sm font-medium text-ktip-sand-800">{sponsor.name}</span>
                </div>
              )

              if (sponsor.website) {
                return (
                  <a
                    key={index}
                    href={sponsor.website}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {content}
                  </a>
                )
              }

              return <div key={index}>{content}</div>
            })}
          </div>
        </>
      )}
    </div>
  )
}
