import { Link, useParams } from 'react-router'
import { BadgeCheck, Building2, ExternalLink, Globe, MapPin } from 'lucide-react'
import { PageHero } from '../../components/layout/PageHero'
import { Card } from '../../components/ui/Card'
import { usePageTitle } from '../../hooks/usePageTitle'
import { useEmployerPortfolio, usePublicEmployer } from '../../hooks/useEmployerProfile'
import { formatDate } from '../../lib/utils'

/**
 * A business's public page — the organisation's answer to /user/:id.
 *
 * Only reachable for a Chamber-verified employer (or by the business itself
 * while it waits): an unverified registration is a claim, and a public page
 * with a name and a logo reads as a credential whether or not it is one.
 */
export default function OrgProfilePage() {
  const params = useParams()
  const { employer, loading } = usePublicEmployer(params.slug)
  const { items } = useEmployerPortfolio(employer?.id)
  usePageTitle(employer?.trading_name || employer?.legal_name)

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-4 pb-16 pt-[calc(var(--nav-h)+4rem)]">
        <div className="h-40 animate-pulse-soft rounded-2xl bg-ktip-sand-100" />
        <div className="h-64 animate-pulse-soft rounded-2xl bg-ktip-sand-100" />
      </div>
    )
  }

  if (!employer) {
    return (
      <div className="mx-auto max-w-3xl px-4 pb-16 pt-[calc(var(--nav-h)+4rem)] text-center">
        <Building2 size={32} className="mx-auto mb-3 text-ktip-sand-400" aria-hidden="true" />
        <h1 className="font-display text-2xl font-bold text-ktip-sand-900">Business not found</h1>
        <p className="mt-2 text-ktip-sand-600">
          This organisation does not exist, or has not been verified by its Chamber of Commerce yet.
        </p>
        <Link to="/directory" className="mt-4 inline-block text-ktip-ocean-600 hover:underline">
          Browse the directory
        </Link>
      </div>
    )
  }

  const name = employer.trading_name || employer.legal_name
  const isVerified = employer.verification_status === 'verified'

  return (
    <>
      <PageHero
        eyebrow="Organisation"
        title={name}
        subtitle={employer.industry || undefined}
        image={employer.logo_url}
        imageSeed={employer.slug}
        compact
        breadcrumb={[
          { label: 'Home', href: '/' },
          { label: 'Directory', href: '/directory' },
          { label: name },
        ]}
      />

      <div className="mx-auto max-w-4xl space-y-6 px-4 py-10">
        <Card>
          <div className="flex flex-wrap items-start gap-4">
            {employer.logo_url ? (
              <img
                src={employer.logo_url}
                alt=""
                className="h-16 w-16 shrink-0 rounded-xl object-cover"
                loading="lazy"
              />
            ) : (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-ktip-ocean-100">
                <Building2 size={28} className="text-ktip-ocean-600" />
              </div>
            )}

            <div className="min-w-0 flex-1">
              <h1 className="flex items-center gap-2 font-display text-2xl font-bold text-ktip-sand-900">
                {name}
                {isVerified && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-ktip-tropical-100 px-2 py-0.5 text-xs font-medium text-ktip-tropical-800"
                    title={
                      employer.verified_at
                        ? `Verified ${formatDate(employer.verified_at, 'MMM dd, yyyy')}`
                        : 'Chamber verified'
                    }
                  >
                    <BadgeCheck size={13} aria-hidden="true" />
                    Chamber verified
                  </span>
                )}
              </h1>

              {employer.legal_name !== name && (
                <p className="text-sm text-ktip-sand-500">Registered as {employer.legal_name}</p>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ktip-sand-600">
                <span className="flex items-center gap-1.5">
                  <MapPin size={14} aria-hidden="true" />
                  {[employer.locality, employer.country_code].filter(Boolean).join(', ')}
                </span>
                {employer.website_url && (
                  <a
                    href={employer.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-ktip-ocean-600 hover:underline"
                  >
                    <Globe size={14} aria-hidden="true" />
                    Website
                    <ExternalLink size={12} aria-hidden="true" />
                  </a>
                )}
              </div>
            </div>
          </div>

          {employer.description && (
            <p className="mt-5 whitespace-pre-wrap leading-relaxed text-ktip-sand-800">
              {employer.description}
            </p>
          )}
        </Card>

        <section id="portfolio" data-spy="Portfolio" className="scroll-mt-24">
          <h2 className="mb-1 font-display text-xl font-bold text-ktip-sand-900">Portfolio</h2>
          <p className="mb-4 text-sm text-ktip-sand-600">Work this organisation has delivered</p>

          {!items || items.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-ktip-sand-300 py-10 text-center text-sm text-ktip-sand-500">
              No work published yet.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {items.map((item) => (
                <article
                  key={item.id}
                  className="overflow-hidden rounded-2xl border border-ktip-sand-200 bg-ktip-cream"
                >
                  {item.image_url && (
                    <img
                      src={item.image_url}
                      alt=""
                      className="h-40 w-full object-cover"
                      loading="lazy"
                    />
                  )}
                  <div className="p-4">
                    <h3 className="font-display font-bold text-ktip-sand-900">{item.title}</h3>
                    <p className="mt-0.5 text-xs text-ktip-sand-500">
                      {[
                        item.client_name && `for ${item.client_name}`,
                        item.completed_on && formatDate(item.completed_on, 'MMM yyyy'),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {item.summary && (
                      <p className="mt-2 text-sm text-ktip-sand-700">{item.summary}</p>
                    )}
                    {item.description && (
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ktip-sand-600">
                        {item.description}
                      </p>
                    )}
                    {item.tags.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {item.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full border border-ktip-sand-200 px-2 py-0.5 text-xs text-ktip-sand-600"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    {item.link_url && (
                      <a
                        href={item.link_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-ktip-ocean-600 hover:underline"
                      >
                        Read more
                        <ExternalLink size={12} aria-hidden="true" />
                      </a>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  )
}
