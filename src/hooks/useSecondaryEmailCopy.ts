import { useLingui } from '@lingui/react/macro'
import type { SecondaryEmailProblem } from '../lib/email-policy'

/**
 * The words for each way a secondary email can fail the rule (204), shared by
 * signup, the backup-email gate and Settings so the three never drift apart.
 */
export function useSecondaryEmailCopy() {
  const { t } = useLingui()
  return {
    problem(problem: SecondaryEmailProblem | undefined): string | undefined {
      switch (problem) {
        case 'missing':
          return t`Enter a backup email address.`
        case 'invalid':
          return t`Enter a valid email address.`
        case 'same':
          return t`Use a different address from your main email.`
        case 'both_school':
          return t`Your main email is a school address, and so is this one. Use a personal address, like Gmail or Outlook, so you can still sign in after you leave school.`
        default:
          return undefined
      }
    },
    helper: t`If you lose access to one address, the other still signs you in. At least one must be personal, not a school address.`,
  }
}
