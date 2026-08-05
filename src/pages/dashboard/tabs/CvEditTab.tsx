import CvEditPage from '../../cv/CvEditPage'

/**
 * The CV editor, as a dashboard pane.
 *
 * Editing used to leave for /cv/edit, which unmounted the rail and the hero and
 * read as going somewhere else entirely. It is a sibling route of
 * /dashboard/profile now, so only the panel beside the rail swaps — the My CV
 * tab stays lit (DashboardLayout matches on the path prefix) and Save/Cancel
 * come straight back to the sheet.
 */
export default function CvEditTab() {
  return <CvEditPage embedded />
}
