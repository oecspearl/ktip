import OrgProfileEditPage from '../../sme/OrgProfileEditPage'

/**
 * The organisation's profile and portfolio, as a dashboard panel — the
 * business-tier counterpart to ProfileTab. The page itself is
 * OrgProfileEditPage; /org/edit redirects here so there is one place an
 * organisation is managed from.
 */
export default function BusinessTab() {
  return <OrgProfileEditPage embedded />
}
