import AchievementsPage from '../../achievements/AchievementsPage'

/**
 * Achievements as a dashboard tab.
 *
 * It used to be the one tab that navigated away — you clicked a tab and lost the
 * rail, which read as a broken tab rather than a deliberate link out. The
 * gallery renders here in embedded mode so the tab shell supplies the width and
 * the heading level; the old /achievements address now redirects to this tab.
 */
export default function AchievementsTab() {
  return <AchievementsPage embedded />
}
