import { ExternalLink } from 'lucide-react'
import { parseSponsorLinks } from '../../../lib/venue-room-sections'
import { RoomPanel, RoomPanelEmpty } from './RoomPanel'
import { Trans, useLingui } from '@lingui/react/macro'

/**
 * The booth's call to action.
 *
 * The links live in the section's own config rather than in a column, because
 * they are content for one panel on one room and nothing server-side has an
 * opinion about them. parseSponsorLinks drops anything that is not http(s) —
 * see the note there.
 */
export function SponsorLinksPanel({
  config,
  sponsorName,
}: {
  config: Record<string, unknown>
  sponsorName: string | null
}) {
  const { t } = useLingui()
  const links = parseSponsorLinks(config)

  return (
    <RoomPanel title={sponsorName ? t`${sponsorName} links` : t`Sponsor links`}>
      {links.length === 0 ? (
        <RoomPanelEmpty><Trans>The host has not added any links yet.</Trans></RoomPanelEmpty>
      ) : (
        <ul className="space-y-1.5 p-3">
          {links.map((link) => (
            <li key={link.url}>
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-xl border border-ktip-sand-200 px-3 py-2 text-sm font-medium text-ktip-sand-800 transition-colors hover:border-ktip-ocean-300 hover:text-ktip-ocean-700"
              >
                <span className="min-w-0 flex-1 truncate">{link.label}</span>
                <ExternalLink size={13} className="shrink-0 text-ktip-sand-400" aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </RoomPanel>
  )
}
