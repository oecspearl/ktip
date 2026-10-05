import { Link } from 'react-router'
import { ShieldCheck } from 'lucide-react'
import { msg } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import type { MessageDescriptor } from '@lingui/core'
import { useConsents } from '../../hooks/useAgreementGate'
import { documentsInBundle, legalPath } from '../../lib/legal'
import { resolveLegal } from './LegalBody'

/** Height of the band. AgreementRoute writes it to --notice-h so PageHero clears it. */
export const NOTICE_BAR_H = '2.75rem'

export type PageGatedBundle = 'publishing' | 'application'

/**
 * Past tense, unlike NOTICE_COPY in AgreementGate.tsx, which sits above a
 * submit button and describes what pressing it will do. By the time this shows
 * the member has agreed, and the line is a record of that, not a warning.
 */
const AGREED_COPY: Record<PageGatedBundle, MessageDescriptor> = {
  publishing: msg`You agreed to the publishing terms. You keep ownership of your work.`,
  application: msg`You agreed to the application terms. Your application stays confidential.`,
}

/**
 * The band that stays under the navbar after the entry notice is accepted.
 *
 * Fixed rather than sticky, for the reason DashboardTopBar gives: the pages it
 * sits on open with a PageHero that runs up under the navbar, and an in-flow
 * band would either push that hero down off the top of the page or hide behind
 * the navbar. Fixed at --nav-offset it follows the navbar as it auto-hides, and
 * PageHero adds --notice-h to its top padding so nothing in the hero is covered.
 *
 * No close button, by request: it is the standing reminder of what this page
 * is publishing under, for as long as the member is on it.
 */
export function AgreementBanner({ bundle }: { bundle: PageGatedBundle }) {
  const { t, i18n } = useLingui()
  const { data } = useConsents()
  const docs = documentsInBundle(bundle)

  // The latest acceptance across the bundle's documents. Every document in a
  // bundle shares one version and is accepted in one call, so this is the
  // moment the member agreed to the set.
  const acceptedAt = (data ?? [])
    .filter((row) => row.bundle === bundle && row.accepted_at)
    .map((row) => row.accepted_at as string)
    .sort()
    .at(-1)
  // Named so the catalog reads "Agreed {date}" rather than "Agreed {0}".
  const date = acceptedAt ? i18n.date(new Date(acceptedAt), { dateStyle: 'medium' }) : null

  return (
    <aside
      aria-label={t`IP notice`}
      // Solid ink instead of blurred glass on mobile-lite (index.css).
      data-lite-solid
      className="fixed inset-x-0 top-[var(--nav-offset)] z-rail border-b border-ktip-line/60 bg-ktip-ink/95 backdrop-blur-md transition-[top] duration-300 [--lite-solid:var(--color-ktip-ink)]"
      style={{ height: NOTICE_BAR_H }}
    >
      <div className="mx-auto flex h-full w-full max-w-page items-center gap-3 px-6 text-label text-white/85 md:px-12">
        <ShieldCheck size={16} className="shrink-0 text-ktip-tropical-300" aria-hidden />

        <p className="min-w-0 flex-1 truncate">
          <span className="font-semibold text-white">{t`IP notice`}</span>
          <span aria-hidden className="mx-2 text-white/40">
            ·
          </span>
          {i18n._(AGREED_COPY[bundle])}
        </p>

        {date && <span className="hidden shrink-0 text-white/60 lg:inline">{t`Agreed ${date}`}</span>}

        {/* The documents by name from md up; below that, one link to the first,
            which links on to the rest. */}
        <span className="hidden shrink-0 items-center gap-3 md:flex">
          {docs.map((doc) => (
            <Link
              key={doc.key}
              to={legalPath(doc.key)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-white underline-offset-2 hover:underline"
            >
              {resolveLegal(i18n, doc.title)}
            </Link>
          ))}
        </span>
        {docs[0] && (
          <Link
            to={legalPath(docs[0].key)}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 font-semibold text-white underline underline-offset-2 md:hidden"
          >
            {t`Read`}
          </Link>
        )}
      </div>
    </aside>
  )
}
