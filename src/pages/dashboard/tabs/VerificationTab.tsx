import { usePageTitle } from '../../../hooks/usePageTitle'
import { useLingui } from '@lingui/react/macro'
import { VerificationTab as VerificationPanel } from '../../../components/settings/VerificationTab'

/**
 * Prove who you are: the institutional-email track, student status, or an
 * identity document.
 *
 * Was /settings?tab=verification — the address migration 145 wrote into every
 * "your account is verified" notification, so the redirect carries it here.
 *
 * Note the panel carries data-spy-off, which switches the scroll-spy rail off
 * for this whole route, hero included. That is what it did under Settings too.
 */
export default function VerificationTab() {
  const { t } = useLingui()
  usePageTitle(t`Verification`)

  return <VerificationPanel />
}
