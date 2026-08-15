import { Link } from 'react-router'
import { ArrowUpRight, Flag } from 'lucide-react'
import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import type { MessageDescriptor } from '@lingui/core'
import { PageHero } from '../../components/layout/PageHero'
import { resolveLegal } from '../../components/legal/LegalBody'
import { usePageTitle } from '../../hooks/usePageTitle'
import { documentsInBundle, legalPath, type LegalBundle } from '../../lib/legal'

/**
 * Grouped by bundle rather than listed alphabetically. Fourteen documents in one
 * flat list is a wall; grouped by when they apply to you, it answers the
 * question people actually arrive with — "which of these did I agree to, and
 * which one covers the thing I am about to do?"
 *
 * `msg` rather than `t`: module scope, evaluated at import, resolved at render.
 */
const GROUPS: { bundle: LegalBundle; title: MessageDescriptor; blurb: MessageDescriptor }[] = [
  {
    bundle: 'account',
    title: msg`What you agreed to when you joined`,
    blurb: msg`Accepted at sign-up. These govern your account and your conduct on the platform.`,
  },
  {
    bundle: 'publishing',
    title: msg`What applies when you publish`,
    blurb: msg`Accepted the first time you publish a project, event, post, CV or organisation profile.`,
  },
  {
    bundle: 'competition',
    title: msg`Competitions and submissions`,
    blurb: msg`Accepted the first time you enter a hackathon or submit a solution to an event.`,
  },
  {
    bundle: 'application',
    title: msg`Grant applications`,
    blurb: msg`Accepted the first time you submit an application to a funder.`,
  },
  {
    bundle: 'informational',
    title: msg`Reference`,
    blurb: msg`Published for you to read. There is nothing here to accept.`,
  },
]

export default function LegalIndexPage() {
  const { t, i18n } = useLingui()
  usePageTitle(t`Legal`)

  return (
    <>
      <PageHero
        eyebrow={t`Legal`}
        title={t`Policies and agreements`}
        subtitle={t`Everything governing your use of KTIP, grouped by when it applies to you. The English version of each document is the authoritative one.`}
        imageSeed="legal"
        compact
        breadcrumb={[{ label: t`Home`, href: '/' }, { label: t`Legal` }]}
      />

      <div className="w-full max-w-page mx-auto px-4 py-8">
        {/* Wider than the document pages, and deliberately so: these are cards,
            not prose. The reading measure exists to keep a line of text short,
            and applying it to a list of summaries just produced a narrow ribbon
            with two dead bands beside it. The cards go two-up from lg instead,
            which is what fills that space. */}
        <div className="mx-auto max-w-page-mid space-y-10">
          {GROUPS.map((group) => {
            const docs = documentsInBundle(group.bundle)
            if (docs.length === 0) return null

            return (
              <section
                key={group.bundle}
                data-spy={i18n._(group.title)}
                className="scroll-mt-24"
              >
                <h2 className="font-display text-title-sm font-bold text-ktip-sand-900">
                  {i18n._(group.title)}
                </h2>
                <p className="mb-4 mt-1 text-body text-ktip-sand-500">{i18n._(group.blurb)}</p>

                <ul className="grid gap-3 lg:grid-cols-2">
                  {docs.map((doc) => (
                    <li key={doc.key}>
                      <Link
                        to={legalPath(doc.key)}
                        className="group block rounded-surface border border-ktip-sand-200 bg-ktip-cream p-5 transition-colors hover:border-ktip-ocean-300"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="text-body-lg font-semibold text-ktip-sand-900 group-hover:text-ktip-ocean-700">
                            {resolveLegal(i18n, doc.title)}
                          </h3>
                          <ArrowUpRight
                            size={17}
                            aria-hidden
                            className="mt-1 shrink-0 text-ktip-sand-400 group-hover:text-ktip-ocean-600"
                          />
                        </div>
                        <p className="mt-1 text-body leading-relaxed text-ktip-sand-600">
                          {resolveLegal(i18n, doc.summary)}
                        </p>
                        <p className="mt-2 text-caption text-ktip-sand-500">
                          <Trans>Version {doc.version}</Trans>
                          <span aria-hidden className="mx-2 text-ktip-sand-300">
                            ·
                          </span>
                          <Trans>
                            Effective{' '}
                            {i18n.date(new Date(doc.effectiveDate), { dateStyle: 'long' })}
                          </Trans>
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}

          {/* The infringement form is public and unauthenticated on purpose — a
              rightsholder with no KTIP account still has to be able to file. */}
          <section className="rounded-surface border border-ktip-sand-200 bg-ktip-sand-50 p-5">
            <h2 className="flex items-center gap-2 text-body-lg font-semibold text-ktip-sand-900">
              <Flag size={17} aria-hidden className="text-ktip-sand-500" />
              <Trans>Report content that infringes your rights</Trans>
            </h2>
            <p className="mt-1 text-body leading-relaxed text-ktip-sand-600">
              <Trans>
                If work you own has been published on KTIP without your permission, tell us. You do
                not need an account to file a notice.
              </Trans>
            </p>
            <Link
              to="/legal/copyright/report"
              className="mt-3 inline-flex items-center gap-1 text-body font-semibold text-ktip-ocean-700 hover:underline underline-offset-2"
            >
              <Trans>File an infringement notice</Trans>
              <ArrowUpRight size={15} aria-hidden />
            </Link>
          </section>

          <p className="text-caption text-ktip-sand-500">
            <Trans>
              To see which versions you have accepted and when, open your legal settings.
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
