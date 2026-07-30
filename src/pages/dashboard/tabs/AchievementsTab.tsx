import AchievementsPage from '../../achievements/AchievementsPage'

/**
 * Achievements as a dashboard tab.
 *
 * It used to be the one tab that navigated away — you clicked a tab and lost the
 * rail, which read as a broken tab rather than a deliberate link out. Same
 * component as /achievements, in embedded mode so the tab shell supplies the
 * width and the heading level. The standalone route stays for direct links and
 * for the "Leaderboard" trail.
 */
export default function AchievementsTab() {
  return <AchievementsPage embedded />
}
