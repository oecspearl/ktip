import { usePageTitle } from '../../../hooks/usePageTitle'
import { useLingui } from '@lingui/react/macro'
import { LegalSettingsTab } from '../../../components/settings/LegalSettingsTab'

/**
 * What you have agreed to, and your analytics choice.
 *
 * Was /settings?tab=legal. The consent rows it writes carry context 'settings'
 * — a value constrained by CHECKs in migrations 115, 129 and 135, so it stays
 * that string whatever the route is called.
 */
export default function LegalTab() {
  const { t } = useLingui()
  usePageTitle(t`Legal & Consent`)

  return <LegalSettingsTab />
}
