import { usePageTitle } from '../../../hooks/usePageTitle'
import { useLingui } from '@lingui/react/macro'
import { PreferencesTab as PreferencesPanel } from '../../../components/settings/PreferencesTab'

/**
 * Notifications, what the directory and the leaderboard may show of you,
 * language, and the accessibility and appearance switches.
 *
 * Was /settings?tab=preferences.
 */
export default function PreferencesTab() {
  const { t } = useLingui()
  usePageTitle(t`Preferences`)

  return <PreferencesPanel />
}
