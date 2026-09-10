import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ArrowRight, Compass } from 'lucide-react'
import { GETTING_STARTED_GUIDES } from '../../lib/help-content'
import { ROLE_LABELS } from '../../lib/constants'
import { resolveCopy } from '../../i18n/copy'
import { useAuth } from '../../contexts/AuthContext'
import { Trans, useLingui } from '@lingui/react/macro'

/**
 * "Start here" — the role-tailored quick start, above the topic catalogue.
 *
 * GETTING_STARTED_GUIDES has been in the tree with no reader: nine role guides,
 * each a numbered path plus the three links that role needs, exported and
 * rendered nowhere. They were pulled when they were nine cards stacked over the
 * catalogue, because that repeated the Getting Started category underneath them
 * — same heading, same `getting-started` anchor, twice on one page.
 *
 * This is the content without that problem. One guide at a time, chosen by a
 * role selector rather than all nine at once, under its own heading and its own
 * anchor. A signed-in member lands on their own role already selected, so the
 * common case is no clicks at all; everyone else lands on the first guide and
 * can switch.
 *
 * Deliberately not a substitute for search. Someone who arrived with a specific
 * problem scrolls straight past this to the catalogue, which is why it stays
 * short and never renders while a search or category filter is active.
 */
export function HelpRoleQuickStart() {
  const { t, i18n } = useLingui()
  const { profile } = useAuth()

  // The member's own role if we have a guide for it, else the first guide.
  // A multi-role member is asked by active_role first — that is the context
  // they chose to operate in — and only then by whichever of their roles has a
  // guide at all. Read once as the initial value rather than synced: someone
  // who has clicked another role is reading it, and a late profile load must
  // not yank it out from under them.
  const [selectedRole, setSelectedRole] = useState(
    () =>
      GETTING_STARTED_GUIDES.find((g) => g.role === profile?.active_role)?.role ??
      GETTING_STARTED_GUIDES.find((g) => profile?.roles?.includes(g.role))?.role ??
      GETTING_STARTED_GUIDES[0].role,
  )

  const guide = useMemo(
    () =>
      GETTING_STARTED_GUIDES.find((g) => g.role === selectedRole) ?? GETTING_STARTED_GUIDES[0],
    [selectedRole],
  )

  const labelFor = (role: string) => {
    const label = ROLE_LABELS[role]
    return label ? resolveCopy(i18n, label) : role
  }

  return (
    <section id="start-here" data-spy="Start here" className="scroll-mt-24 mb-10">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-ktip-ocean-50 flex items-center justify-center text-ktip-ocean-600 shrink-0">
          <Compass size={20} />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-display font-bold text-ktip-sand-900">
            <Trans>Start here</Trans>
          </h2>
          <p className="text-sm text-ktip-sand-500">
            <Trans>The short path through KTIP for your role.</Trans>
          </p>
        </div>
      </div>

      {/* Scrolls on narrow screens rather than wrapping to four rows of chips. */}
      <div
        role="tablist"
        aria-label={t`Choose a role`}
        className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1"
      >
        {GETTING_STARTED_GUIDES.map((g) => {
          const active = g.role === guide.role
          return (
            <button
              key={g.role}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls="start-here-panel"
              onClick={() => setSelectedRole(g.role)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? 'bg-ktip-ocean-600 text-white'
                  : 'bg-ktip-cream border border-ktip-sand-200 text-ktip-sand-600 hover:border-ktip-ocean-300 hover:text-ktip-sand-900'
              }`}
            >
              {labelFor(g.role)}
            </button>
          )
        })}
      </div>

      <div
        id="start-here-panel"
        role="tabpanel"
        className="mt-3 bg-ktip-cream border border-ktip-sand-200 rounded-2xl p-5 sm:p-6"
      >
        <p className="text-sm text-ktip-sand-600 mb-4">{i18n._(guide.description)}</p>

        {/* A real <ol>: these are ordered steps, and the numbering should survive
            a screen reader and a copy-paste, not live in a styled <div>. */}
        <ol className="space-y-2.5 mb-5">
          {guide.steps.map((step, i) => (
            <li key={i} className="flex gap-3 text-sm text-ktip-sand-700 leading-relaxed">
              <span className="shrink-0 w-6 h-6 rounded-full bg-ktip-ocean-50 text-ktip-ocean-700 text-xs font-semibold flex items-center justify-center tabular-nums">
                {i + 1}
              </span>
              <span className="min-w-0 pt-0.5">{i18n._(step)}</span>
            </li>
          ))}
        </ol>

        <div className="flex flex-wrap gap-2">
          {guide.quickLinks.map((link) => (
            <Link
              key={link.href}
              to={link.href}
              className="inline-flex items-center gap-1.5 rounded-lg border border-ktip-sand-200 bg-ktip-sand-50 px-3 py-1.5 text-sm font-medium text-ktip-ocean-700 hover:border-ktip-ocean-300 hover:bg-ktip-ocean-50 transition-colors"
            >
              {i18n._(link.label)}
              <ArrowRight size={14} />
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
