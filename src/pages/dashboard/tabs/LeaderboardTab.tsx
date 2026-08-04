import LeaderboardPage from '../../leaderboard/LeaderboardPage'

/**
 * The leaderboard as a dashboard pane, reached from the Achievements tab's
 * Leaderboard button. Same shape as AchievementsTab: the board renders in
 * embedded mode so the tab shell supplies the width and the heading level.
 * The public /leaderboard address stays — a rank you cannot show to someone
 * outside is not worth chasing.
 */
export default function LeaderboardTab() {
  return <LeaderboardPage embedded />
}
