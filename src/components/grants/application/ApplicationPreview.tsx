import { ReceiptDocument } from '../../shared/ReceiptDocument'
import { GRANT_APPLICATION_STEPS } from '../../../lib/grant-application-template'
import type { StepConfig } from '../../../lib/grant-application-template'
import { useLingui } from '@lingui/react/macro'

interface ApplicationPreviewProps {
  title: string
  grantTitle?: string
  data: Record<string, any>
  steps?: StepConfig[]
}

/**
 * Wizard review step. Renders through the same document component as the
 * submitted-copy receipt, so what the applicant reviews is what they keep.
 */
export function ApplicationPreview({
  title,
  grantTitle,
  data,
  steps = GRANT_APPLICATION_STEPS,
}: ApplicationPreviewProps) {
  const { i18n } = useLingui()
  const sections = steps.map((step) => ({
    title: i18n._(step.title),
    fields: step.fields.flatMap((field) => {
      const raw = data[field.name]
      const value = raw && String(raw).trim() ? String(raw) : null
      return value ? [{ label: i18n._(field.label), value }] : []
    }),
  }))

  return <ReceiptDocument title={title} subtitle={grantTitle} sections={sections} />
}
