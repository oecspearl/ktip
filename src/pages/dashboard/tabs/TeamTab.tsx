import OrgMembersPage from '../../sme/OrgMembersPage'

/**
 * The organisation's roster and its engagement switch, as a dashboard panel.
 * The page itself is OrgMembersPage; /org/members redirects here so there is
 * one place an organisation is managed from.
 */
export default function TeamTab() {
  return <OrgMembersPage embedded />
}
