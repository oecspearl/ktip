import { usePageTitle } from '../../../hooks/usePageTitle'
import { useLingui } from '@lingui/react/macro'
import { PersonalizationTab as PersonalizationPanel } from '../../../components/settings/PersonalizationTab'

/**
 * The signals behind "For You" — topics, categories, content types, the
 * climate boost, and the opt-outs.
 *
 * Was /settings?tab=personalization; ForYouRail's "Tune this" links here.
 */
export default function PersonalizationTab() {
  const { t } = useLingui()
  usePageTitle(t`Personalization`)

  return <PersonalizationPanel />
}
