import { Link, useParams } from 'react-router'
import { ExternalLink, Puzzle } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { PageHero } from '../../components/layout/PageHero'
import { Badge } from '../../components/ui/Badge'
import { useIntegration } from '../../hooks/useIntegrations'
import { usePageTitle } from '../../hooks/usePageTitle'
import { INTEGRATION_CATEGORY_LABELS } from '../../lib/constants'
import { resolveCopy } from '../../i18n/copy'
import { formatDate, truncate } from '../../lib/utils'

const INTEGRATIONS_HREF = '/resources?tab=integrations'

/** Only a plain web address becomes a link; anything else in the column is ignored. */
function webAddress(url: string | null | undefined): { href: string; host: string } | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
    return { href: parsed.href, host: parsed.host.replace(/^www\./, '') }
  } catch {
    return null
  }
}

/**
 * A partner tool, on KTIP. Admins write this copy in /admin/integrations.
 * The route sits behind AccountRoute, so the partner's site is only ever
 * linked for a signed-in member: the card in the grid no longer leaves KTIP.
 */
export default function IntegrationDetailPage() {
  const { t, i18n } = useLingui()
  const params = useParams()
  const { integration, loading } = useIntegration(params.id)

  usePageTitle(integration?.name ? t`${integration.name} — Integrations` : t`Integration`)

  if (loading) {
    return (
      <div className="w-full max-w-page mx-auto px-4 py-8">
        <div className="max-w-page-mid mx-auto">
          <div className="bg-hero-base min-h-[180px] rounded-none animate-pulse" />
          <div className="p-8 animate-pulse">
            <div className="h-4 w-24 bg-ktip-sand-100 rounded mb-4" />
            <div className="h-8 w-3/4 bg-ktip-sand-100 rounded mb-4" />
            <div className="h-4 w-full bg-ktip-sand-100 rounded mb-2" />
            <div className="h-4 w-2/3 bg-ktip-sand-100 rounded" />
          </div>
        </div>
      </div>
    )
  }

  if (!integration) {
    return (
      <div className="w-full max-w-page mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 bg-ktip-sand-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Puzzle size={32} className="text-ktip-sand-400" />
        </div>
        <h2 className="text-2xl font-display font-bold uppercase text-ktip-sand-900 mb-2">
          <Trans>Integration not found</Trans>
        </h2>
        <p className="text-gray-500 mb-6">
          <Trans>This integration doesn't exist or isn't published.</Trans>
        </p>
        <Link
          to={INTEGRATIONS_HREF}
          className="px-6 py-2.5 btn-brand text-sm font-bold uppercase tracking-wider rounded-lg inline-flex items-center gap-2"
        >
          <Trans>Back to Integrations</Trans>
        </Link>
      </div>
    )
  }

  const categoryLabel = INTEGRATION_CATEGORY_LABELS[integration.category]
  const category = categoryLabel ? resolveCopy(i18n, categoryLabel) : integration.category
  const site = webAddress(integration.website_url)
  const name = integration.name

  return (
    <>
      <PageHero
        eyebrow={t`Integration`}
        title={name}
        imageSeed={integration.id}
        breadcrumb={[
          { label: t`Home`, href: '/' },
          { label: t`Integrations`, href: INTEGRATIONS_HREF },
          { label: truncate(name, 30) },
        ]}
      >
        {category && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-ktip-sand-100 text-ktip-sand-700 border-ktip-sand-200">{category}</Badge>
          </div>
        )}
      </PageHero>

      <div className="bg-ktip-sand-50 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-page-mid mx-auto px-4">
          {/* === Main Column === */}
          <div className="lg:col-span-2">
            <div className="flex items-center gap-4 mb-6">
              {integration.logo_url ? (
                <img
                  src={integration.logo_url}
                  alt=""
                  className="w-20 h-20 rounded-xl object-contain bg-ktip-sand-50 border border-ktip-sand-100 p-2 shrink-0"
                  loading="lazy"
                />
              ) : (
                <div className="w-20 h-20 bg-ktip-ocean-100 rounded-xl flex items-center justify-center shrink-0">
                  <Puzzle size={36} className="text-ktip-ocean-600" />
                </div>
              )}
              <h2 className="text-xl font-bold text-ktip-sand-900">{name}</h2>
            </div>

            {integration.summary && (
              <p className="text-lg text-ktip-sand-800 font-medium leading-relaxed mb-6">
                {integration.summary}
              </p>
            )}

            {integration.description && integration.description !== integration.summary && (
              <div className="text-gray-700 whitespace-pre-wrap leading-relaxed mb-6">
                {integration.description}
              </div>
            )}
          </div>

          {/* === Sidebar === */}
          <div className="lg:col-span-1">
            {site && (
              <div className="mb-10">
                <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">
                  <Trans>Partner site</Trans>
                </h3>
                <p className="text-ktip-ocean-600 text-xs italic mb-4">
                  <Trans>Run by {name}, not KTIP</Trans>
                </p>
                <a
                  href={site.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full px-4 py-2.5 btn-brand text-sm font-bold rounded-lg flex items-center justify-center gap-1.5"
                >
                  <Trans>Visit {site.host}</Trans>
                  <ExternalLink size={16} />
                </a>
              </div>
            )}

            <div className="mb-10">
              <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-4">
                <Trans>Details</Trans>
              </h3>
              <dl className="text-sm divide-y divide-ktip-sand-100">
                {category && (
                  <div className="flex justify-between gap-4 py-2.5">
                    <dt className="text-gray-500">
                      <Trans>Category</Trans>
                    </dt>
                    <dd className="text-ktip-sand-900 text-right">{category}</dd>
                  </div>
                )}
                <div className="flex justify-between gap-4 py-2.5">
                  <dt className="text-gray-500">
                    <Trans>Last updated</Trans>
                  </dt>
                  <dd className="text-ktip-sand-900 text-right">{formatDate(integration.updated_at)}</dd>
                </div>
              </dl>
            </div>

            {integration.tags?.length > 0 && (
              <div className="mb-10">
                <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-4">
                  <Trans>Tags</Trans>
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {integration.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-ktip-sand-100 text-ktip-sand-700"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="mb-10">
              <Link
                to={INTEGRATIONS_HREF}
                className="w-full px-4 py-2.5 border border-ktip-sand-200 bg-ktip-cream text-ktip-sand-800 hover:border-ktip-ocean-300 text-sm font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors"
              >
                <Puzzle size={16} />
                <Trans>Browse all integrations</Trans>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
