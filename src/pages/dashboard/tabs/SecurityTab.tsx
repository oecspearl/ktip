import { usePageTitle } from '../../../hooks/usePageTitle'
import { useLingui } from '@lingui/react/macro'
import { SecuritySettingsTab } from '../../../components/settings/SecuritySettingsTab'

/**
 * Password, two-step verification, the addresses you sign in with, and the
 * two ways out — export everything, or close the account.
 *
 * Was /settings?tab=security. That address still resolves: SettingsRedirect
 * in App.tsx reads the tab out of the query string and sends it here, which
 * matters because migration 118's MFA-reset notification and the recovery-code
 * warning in api/auth/mfa-recover.ts both wrote /settings into rows that
 * already exist.
 */
export default function SecurityTab() {
  const { t } = useLingui()
  usePageTitle(t`Security`)

  return <SecuritySettingsTab />
}
