import CvPage from '../../cv/CvPage'

/**
 * The member's CV, as a dashboard panel.
 *
 * This used to be a read-only rendering that linked out to /cv for design,
 * download and publishing. The full page lives here now — /cv redirects to
 * /dashboard/profile — so there is exactly one place the CV is managed from
 * and nothing for the two copies to disagree about.
 */
export default function ProfileTab() {
  return <CvPage embedded />
}
