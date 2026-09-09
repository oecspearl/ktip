import { useMemo } from 'react'
import { Link } from 'react-router'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { useGrants, useFunderApplicationTotals } from '../../hooks/useGrants'
import { useAuth } from '../../contexts/AuthContext'
import { Plus, Pencil, Wallet, Calendar, DollarSign, Inbox, Megaphone, Clock, CheckCircle } from 'lucide-react'
import { formatCurrency, formatDate } from '../../lib/utils'
import { FundingStats } from '../../components/grants/FundingStats'
import { applicationTallies, isOpenCall, sumByCurrency } from '../../lib/grant-metrics'
import { entityPath } from '../../lib/slug'
import { usePageTitle } from '../../hooks/usePageTitle'
import { PageHero } from '../../components/layout/PageHero'
import type { Grant } from '../../types'
import { Trans, Plural, useLingui } from '@lingui/react/macro'

/**
 * The funder's side of /grants: the calls this member posted.
 *
 * Deliberately not a filter on the public Grants page — a funder's own closed
 * and expired calls are records they still need to reach, and the public list
 * is built to hide exactly those.
 */
export default function MyGrantsPage() {
  const { t } = useLingui()
  usePageTitle(t`My Grants`)
  const auth = useAuth()

  const { grants, loading } = useGrants({ createdBy: auth.user?.id })

  const { open, closed } = useMemo(() => {
    const openCalls: Grant[] = []
    const closedCalls: Grant[] = []
    for (const grant of grants ?? []) {
      ;(isOpenCall(grant) ? openCalls : closedCalls).push(grant)
    }
    return { open: openCalls, closed: closedCalls }
  }, [grants])

  const { totals } = useFunderApplicationTotals(grants?.map((grant) => grant.id))

  const stats = useMemo(() => {
    const tallies = applicationTallies(totals)
    return {
      tallies,
      // The ceiling, not a midpoint: amount_max is what the call promises at
      // most, and averaging a range with a missing end invents a number.
      advertised: sumByCurrency(
        open,
        (grant) => grant.amount_max ?? grant.amount_min,
        (grant) => grant.currency
      ),
      // What was actually paid out, which is a different question and the one
      // a funder is usually asked. Reads '—' until somebody records an award.
      awarded: sumByCurrency(
        (totals ?? []).filter((row) => row.status === 'approved'),
        (row) => row.awarded_amount,
        (row) => row.awarded_currency,
        'XCD'
      ),
    }
  }, [open, totals])

  const renderRow = (grant: Grant, isClosed: boolean) => (
    <li key={grant.id} className="px-4 py-4 flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <Link
          to={entityPath('grant', grant)}
          className="text-sm font-medium text-ktip-sand-900 hover:text-ktip-ocean-600 transition-colors"
        >
          {grant.title}
        </Link>
        <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-ktip-sand-500">
          {(grant.amount_min != null || grant.amount_max != null) && (
            <span className="inline-flex items-center gap-1">
              <DollarSign size={12} />
              {grant.amount_min != null && grant.amount_max != null
                ? `${formatCurrency(grant.amount_min, grant.currency)} – ${formatCurrency(grant.amount_max, grant.currency)}`
                : formatCurrency((grant.amount_max ?? grant.amount_min) as number, grant.currency)}
            </span>
          )}
          {grant.deadline && (
            <span className="inline-flex items-center gap-1">
              <Calendar size={12} />
              {formatDate(grant.deadline)}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 flex-shrink-0">
        <Badge size="sm" variant={isClosed ? 'default' : 'primary'}>
          {isClosed ? t`Closed` : t`Open`}
        </Badge>
        <Link to={`/grants/${grant.slug || grant.id}/applications`}>
          <Button variant="outline" size="sm" icon={<Inbox size={14} />}>
            <Trans>Applications</Trans>
          </Button>
        </Link>
        <Link to={`/grants/${grant.slug || grant.id}/edit`}>
          <Button variant="outline" size="sm" icon={<Pencil size={14} />}>
            <Trans>Edit</Trans>
          </Button>
        </Link>
      </div>
    </li>
  )

  return (
    <>
      <PageHero
        eyebrow={t`My Grants`}
        title={t`Funding You Posted`}
        subtitle={t`The calls your organisation has published, open and closed.`}
        image="/photos/pairing-1.webp"
        imageSeed="grants"
        breadcrumb={[
          { label: t`Home`, href: '/' },
          { label: t`Grants`, href: '/grants' },
          { label: t`My Grants` },
        ]}
      />

      <div data-spy-off className="w-full max-w-page mx-auto px-4 pt-8 pb-12">
        <div className="flex justify-end mb-6">
          <Link to="/grants/new">
            <Button icon={<Plus size={16} />} size="sm" className="text-sm">
              <Trans>Post a Grant</Trans>
            </Button>
          </Link>
        </div>

        {loading || !grants ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ktip-ocean-500 mx-auto" />
            <p className="mt-4 text-ktip-sand-600"><Trans>Loading your grants...</Trans></p>
          </div>
        ) : grants.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-ktip-sand-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Wallet size={32} className="text-gray-400" />
            </div>
            <h3 className="text-2xl font-display font-bold text-ktip-sand-900 mb-2">
              <Trans>You have not posted a funding call yet</Trans>
            </h3>
            <p className="text-gray-500">
              <Trans>Post one and it appears on the Grants page straight away.</Trans>
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <FundingStats
              tiles={[
                { label: t`Open calls`, value: open.length, icon: Megaphone },
                { label: t`Applications`, value: stats.tallies.submitted, icon: Inbox },
                { label: t`Awaiting review`, value: stats.tallies.awaitingDecision, icon: Clock },
                { label: t`Approved`, value: stats.tallies.approved, icon: CheckCircle },
              ]}
              money={{
                title: t`Funding`,
                lines: [
                  { label: t`Advertised`, totals: stats.advertised },
                  { label: t`Awarded`, totals: stats.awarded },
                ],
              }}
            />

            <div className="bg-ktip-cream border border-ktip-sand-200 rounded-lg">
              <div className="px-4 py-3 border-b border-ktip-sand-200">
                <p className="text-sm text-ktip-sand-600">
                  <Plural value={open.length} one="# open call" other="# open calls" />
                </p>
              </div>
              {open.length ? (
                <ul className="divide-y divide-ktip-sand-100">
                  {open.map((grant) => renderRow(grant, false))}
                </ul>
              ) : (
                <p className="px-4 py-6 text-sm text-ktip-sand-500">
                  <Trans>Nothing open — every call you posted has closed or passed its deadline.</Trans>
                </p>
              )}
            </div>

            {closed.length > 0 && (
              <div className="bg-ktip-cream border border-ktip-sand-200 rounded-lg">
                <div className="px-4 py-3 border-b border-ktip-sand-200">
                  <p className="text-sm text-ktip-sand-600">
                    <Plural value={closed.length} one="# closed call" other="# closed calls" />
                  </p>
                </div>
                <ul className="divide-y divide-ktip-sand-100">
                  {closed.map((grant) => renderRow(grant, true))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
