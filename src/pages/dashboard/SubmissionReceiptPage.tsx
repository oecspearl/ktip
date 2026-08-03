import { Link, useParams } from 'react-router'
import { ArrowLeft, Printer, ExternalLink, FileQuestion } from 'lucide-react'
import { PageHero } from '../../components/layout/PageHero'
import { Button } from '../../components/ui/Button'
import { ReceiptDocument, receiptToSections } from '../../components/shared/ReceiptDocument'
import {
  SUBMISSION_KIND_LABELS,
  SubmissionKindBadge,
} from '../../components/shared/SubmissionKindBadge'
import { useSubmissionReceipt } from '../../hooks/useSubmissionReceipts'
import { usePageTitle } from '../../hooks/usePageTitle'
import { truncate } from '../../lib/utils'
import { Trans, useLingui } from '@lingui/react/macro'
import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'

const SOURCE_LINK_LABELS: Record<string, MessageDescriptor> = {
  grant_application: msg`View grant`,
  event_registration: msg`View event`,
  grievance: msg`View report status`,
}

export default function SubmissionReceiptPage() {
    const { t, i18n } = useLingui()
  const params = useParams()
  const { receipt, loading } = useSubmissionReceipt(params.id)

  const receiptTitle = receipt?.title
  usePageTitle(receipt ? t`Copy — ${receiptTitle}` : t`Submission Copy`)

  if (loading) {
    return (
      <div className="w-full max-w-page mx-auto px-4 py-12 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ktip-ocean-500 mx-auto"></div>
        <p className="mt-4 text-ktip-sand-600"><Trans>Loading your copy...</Trans></p>
      </div>
    )
  }

  // RLS scopes receipts to their owner, so "not found" covers both cases
  if (!receipt) {
    return (
      <div className="w-full max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 bg-ktip-sand-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <FileQuestion size={32} className="text-ktip-sand-400" />
        </div>
        <h1 className="text-2xl font-display font-bold text-ktip-sand-900 mb-2">
          <Trans>Submission not found</Trans>
        </h1>
        <p className="text-ktip-sand-600 mb-6">
          <Trans>This copy doesn't exist, or it belongs to another account.</Trans>
        </p>
        <Link to="/dashboard/submissions">
          <Button icon={<ArrowLeft size={16} />}><Trans>Back to My Submissions</Trans></Button>
        </Link>
      </div>
    )
  }

  return (
    <>
      <div className="print:hidden">
        <PageHero
          eyebrow={SUBMISSION_KIND_LABELS[receipt.kind]}
          title={truncate(receipt.title, 60)}
          subtitle={t`Your copy of this submission`}
          imageSeed="dashboard"
          compact
          breadcrumb={[
            { label: t`Home`, href: '/' },
            { label: t`Dashboard`, href: '/dashboard' },
            { label: t`My Submissions`, href: '/dashboard/submissions' },
            { label: t`Copy` },
          ]}
        />
      </div>

      <div className="w-full max-w-4xl mx-auto px-4 py-8 print:py-0 print:max-w-none">
        {/* Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6 print:hidden">
          <Link
            to="/dashboard/submissions"
            className="inline-flex items-center gap-1.5 text-sm text-ktip-sand-600 hover:text-ktip-sand-900 font-medium transition-colors"
          >
            <ArrowLeft size={16} />
            <Trans>All submissions</Trans>
          </Link>

          <div data-tutorial="receipt-actions" className="flex items-center gap-3">
            <Link to={receipt.link}>
              <Button variant="outline" size="sm" icon={<ExternalLink size={16} />}>
                {SOURCE_LINK_LABELS[receipt.kind] ? i18n._(SOURCE_LINK_LABELS[receipt.kind]) : t`View source`}
              </Button>
            </Link>
            <Button size="sm" icon={<Printer size={16} />} onClick={() => window.print()}>
              <Trans>Print / Save as PDF</Trans>
            </Button>
          </div>
        </div>

        <div className="mb-4 print:hidden">
          <SubmissionKindBadge kind={receipt.kind} />
        </div>

        <div
          data-tutorial="receipt-document"
          className="border border-ktip-sand-200 rounded-2xl p-6 md:p-8 bg-ktip-cream print:border-0 print:p-0 print:rounded-none"
        >
          <ReceiptDocument
            title={receipt.title}
            subtitle={receipt.subtitle}
            submittedAt={receipt.submitted_at}
            sections={receiptToSections(receipt)}
            footer={t`KTIP submission copy · Reference ${receipt.id}`}
          />
        </div>
      </div>
    </>
  )
}
