import { Link } from 'react-router'
import { Printer, ArrowUpRight } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { PageHero } from '../../components/layout/PageHero'
import { LegalBody, resolveLegal } from '../../components/legal/LegalBody'
import { AuthoritativeLanguageNotice } from '../../components/legal/AuthoritativeLanguageNotice'
import { usePageTitle } from '../../hooks/usePageTitle'
import { getLegalDocument, legalPath, type LegalDocumentKey } from '../../lib/legal'

/**
 * The shell every published legal document renders in.
 *
 * A NAMED export, deliberately: `lazyPage` treats a module's default export as a
 * route component, and this takes a prop no router can supply. The fourteen
 * three-line files in this directory are what the routes point at.
 *
 * Sections render fully expanded. The collapsible treatment belongs to the
 * consent panel, where the job is to make a long document approachable before
 * someone accepts it; here the job is to be findable, quotable and printable,
 * and text inside a collapsed section is none of those — Ctrl+F lands on it and
 * the reader sees nothing.
 */
export function LegalDocumentPage({ documentKey }: { documentKey: LegalDocumentKey }) {
  const { t, i18n } = useLingui()
  const doc = getLegalDocument(documentKey)

  const title = doc ? resolveLegal(i18n, doc.title) : t`Legal`
  usePageTitle(title)

  if (!doc) return null

  const summary = resolveLegal(i18n, doc.summary)
  const related = (doc.relatedKeys ?? [])
    .map((key) => getLegalDocument(key))
    .filter((d): d is NonNullable<typeof d> => Boolean(d))

  return (
    <>
      <PageHero
        eyebrow={t`Legal`}
        title={title}
        subtitle={summary}
        imageSeed="legal"
        compact
        breadcrumb={[
          { label: t`Home`, href: '/' },
          { label: t`Legal`, href: '/legal' },
          { label: title },
        ]}
      />

      <div className="legal-doc w-full max-w-page mx-auto px-4 py-10">
        <div className="max-w-legal">
          {/* Version strip. Which text is in force, and from when, is the first
              thing anyone checking a legal document needs. */}
          <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-ktip-sand-200 pb-4">
            <p className="text-caption text-ktip-sand-600">
              <Trans>Version {doc.version}</Trans>
              <span aria-hidden className="mx-2 text-ktip-sand-300">
                ·
              </span>
              <Trans>
                Effective {i18n.date(new Date(doc.effectiveDate), { dateStyle: 'long' })}
              </Trans>
            </p>
            <button
              type="button"
              data-print-hide
              onClick={() => window.print()}
              className="ml-auto inline-flex items-center gap-1.5 text-caption font-semibold text-ktip-ocean-700 hover:opacity-80"
            >
              <Printer size={14} aria-hidden />
              <Trans>Print or save as PDF</Trans>
            </button>
          </div>

          <AuthoritativeLanguageNotice className="mb-6" />

          {/* Table of contents. Not a duplicate of the SpyRail — that is
              `hidden sm:flex`, so on a phone a seventeen-section document would
              otherwise have no navigation at all. */}
          <nav
            data-legal-toc
            aria-label={t`On this page`}
            className="mb-8 rounded-surface border border-ktip-sand-200 bg-ktip-cream p-5"
          >
            <h2 className="mb-3 text-caption font-semibold uppercase tracking-wide text-ktip-sand-500">
              <Trans>On this page</Trans>
            </h2>
            <ol className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
              {doc.sections.map((section, index) => (
                <li key={section.id} className="flex gap-2 text-body">
                  <span aria-hidden className="tabular-nums text-ktip-sand-400">
                    {index + 1}.
                  </span>
                  <a
                    href={`#${section.id}`}
                    className="text-ktip-ocean-700 hover:underline underline-offset-2"
                  >
                    {resolveLegal(i18n, section.heading)}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="space-y-10">
            {doc.sections.map((section, index) => (
              <section
                key={section.id}
                id={section.id}
                data-spy={resolveLegal(i18n, section.railLabel ?? section.heading)}
                className="scroll-mt-24"
              >
                <h2 className="font-display text-title-sm font-bold text-ktip-sand-900">
                  <span aria-hidden className="mr-2 tabular-nums text-ktip-sand-400">
                    {index + 1}.
                  </span>
                  {resolveLegal(i18n, section.heading)}
                </h2>

                {section.summary && (
                  <p className="mb-4 mt-1 text-body text-ktip-sand-500">
                    {resolveLegal(i18n, section.summary)}
                  </p>
                )}
                {!section.summary && <div className="mb-4" />}

                <LegalBody blocks={section.body} />

                {section.actions && section.actions.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
                    {section.actions.map((action) => (
                      <Link
                        key={action.href}
                        to={action.href}
                        className="inline-flex items-center gap-1 text-body font-semibold text-ktip-ocean-700 hover:underline underline-offset-2"
                      >
                        {resolveLegal(i18n, action.label)}
                        <ArrowUpRight size={15} aria-hidden />
                      </Link>
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>

          {related.length > 0 && (
            <section className="mt-12 border-t border-ktip-sand-200 pt-6">
              <h2 className="mb-3 text-caption font-semibold uppercase tracking-wide text-ktip-sand-500">
                <Trans>See also</Trans>
              </h2>
              <ul className="space-y-2">
                {related.map((other) => (
                  <li key={other.key}>
                    <Link
                      to={legalPath(other.key)}
                      className="text-body font-semibold text-ktip-ocean-700 hover:underline underline-offset-2"
                    >
                      {resolveLegal(i18n, other.title)}
                    </Link>
                    <p className="text-caption text-ktip-sand-500">
                      {resolveLegal(i18n, other.summary)}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="mt-10 text-caption text-ktip-sand-500">
            <Trans>
              Questions about this document? Write to legal@oecsinnovation.org. To see which
              versions you have accepted, open your legal settings.
            </Trans>{' '}
            <Link
              to="/settings?tab=legal"
              className="font-semibold text-ktip-ocean-700 hover:underline underline-offset-2"
            >
              <Trans>What you have agreed to</Trans>
            </Link>
          </p>
        </div>
      </div>
    </>
  )
}
