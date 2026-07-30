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

const SOURCE_LINK_LABELS: Record<string, string> = {
  grant_application: 'View grant',
  event_registration: 'View event',
  grievance: 'View report status',
}

export default function SubmissionReceiptPage() {
  const params = useParams()
  const { receipt, loading } = useSubmissionReceipt(params.id)

  usePageTitle(receipt ? `Copy — ${receipt.title}` : 'Submission Copy')

  if (loading) {
    return (
      <div className="w-full max-w-[calc(50vw+48rem)] mx-auto px-4 py-12 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ktip-ocean-500 mx-auto"></div>
        <p className="mt-4 text-ktip-sand-600">Loading your copy...</p>
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
          Submission not found
        </h1>
        <p className="text-ktip-sand-600 mb-6">
          This copy doesn't exist, or it belongs to another account.
        </p>
        <Link to="/dashboard/submissions">
          <Button icon={<ArrowLeft size={16} />}>Back to My Submissions</Button>
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
          subtitle="Your copy of this submission"
          imageSeed="dashboard"
          compact
          breadcrumb={[
            { label: 'Home', href: '/' },
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'My Submissions', href: '/dashboard/submissions' },
            { label: 'Copy' },
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
            All submissions
          </Link>

          <div className="flex items-center gap-3">
            <Link to={receipt.link}>
              <Button variant="outline" size="sm" icon={<ExternalLink size={16} />}>
                {SOURCE_LINK_LABELS[receipt.kind] || 'View source'}
              </Button>
            </Link>
            <Button size="sm" icon={<Printer size={16} />} onClick={() => window.print()}>
              Print / Save as PDF
            </Button>
          </div>
        </div>

        <div className="mb-4 print:hidden">
          <SubmissionKindBadge kind={receipt.kind} />
        </div>

        <div className="border border-ktip-sand-200 rounded-2xl p-6 md:p-8 bg-ktip-cream print:border-0 print:p-0 print:rounded-none">
          <ReceiptDocument
            title={receipt.title}
            subtitle={receipt.subtitle}
            submittedAt={receipt.submitted_at}
            sections={receiptToSections(receipt)}
            footer={`KTIP submission copy · Reference ${receipt.id}`}
          />
        </div>
      </div>
    </>
  )
}
