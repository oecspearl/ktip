import { Link } from 'react-router'
import { Eye, ExternalLink, Lock, LockOpen } from 'lucide-react'
import { Card } from '../../../../components/ui/Card'
import { Switch } from '../../../../components/ui/Toggle'
import { Trans, useLingui } from '@lingui/react/macro'

interface ProfilePreviewToolbarProps {
  locked: boolean
  onLockChange: (next: boolean) => void
  savingLock?: boolean
  asVisitor: boolean
  onAsVisitorChange: (next: boolean) => void
  /** The member's own public URL. Null until the profile has loaded. */
  profileHref: string | null
}

/**
 * Who can see the profile, and a way to look at it as they would.
 *
 * Above the preview rather than inside it, because neither control is part of
 * the profile: one is a setting, the other is a lens on the thing below. The
 * privacy tile keeps `id="privacy" data-spy="Privacy"` — the marker the
 * scroll-spy rail and the page tours know it by.
 *
 * The lock writes immediately (there is nothing to draft about a switch) with
 * a local mirror so it flips at once and rolls back if the write fails.
 */
export function ProfilePreviewToolbar({
  locked,
  onLockChange,
  savingLock,
  asVisitor,
  onAsVisitorChange,
  profileHref,
}: ProfilePreviewToolbarProps) {
  const { t } = useLingui()

  return (
    <Card id="privacy" data-spy="Privacy" padding="sm" className="scroll-mt-24">
      {/* One line each. Everything here used to carry a paragraph explaining
          itself, which is three sentences of chrome above the thing the reader
          came to look at — and the state of the switch says most of it. The
          long version of the privacy rule lives in Help. */}
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
        <label className="flex min-w-0 flex-1 items-center gap-3">
          <Switch
            checked={locked}
            onChange={onLockChange}
            disabled={savingLock}
            label={t`Lock my profile`}
          />
          <span className="min-w-0">
            <span className="flex items-center gap-2 font-display text-label font-bold text-ktip-sand-900">
              {locked ? <Lock size={15} aria-hidden="true" /> : <LockOpen size={15} aria-hidden="true" />}
              <Trans>Private profile</Trans>
            </span>
            <span className="mt-0.5 block text-micro text-ktip-sand-500">
              {locked ? (
                <Trans>Name, photo and country only, until you accept a connection.</Trans>
              ) : (
                <Trans>Any member can see your full profile.</Trans>
              )}
            </span>
          </span>
        </label>

        <label className="flex min-w-0 flex-1 items-center gap-3">
          <Switch
            checked={asVisitor}
            onChange={onAsVisitorChange}
            label={t`View my profile as a visitor sees it`}
          />
          <span className="min-w-0">
            <span className="flex items-center gap-2 font-display text-label font-bold text-ktip-sand-900">
              <Eye size={15} aria-hidden="true" />
              <Trans>View as a visitor</Trans>
            </span>
            <span className="mt-0.5 block text-micro text-ktip-sand-500">
              {asVisitor ? (
                locked ? (
                  // The whole reason the toggle exists: your own view of a
                  // locked profile is not the locked view, and the server will
                  // not give you the locked one — can_view_profile() returns
                  // TRUE for the owner before it ever reads the setting.
                  <Trans>What someone not connected to you sees.</Trans>
                ) : (
                  // For an unlocked member the toggle changes almost nothing,
                  // and silence there reads as a broken feature.
                  <Trans>Unlocked, so this is what everyone already sees.</Trans>
                )
              ) : (
                <Trans>Check it without signing out.</Trans>
              )}
            </span>
          </span>
        </label>

        {profileHref && (
          <Link
            to={profileHref}
            className="inline-flex shrink-0 items-center gap-1.5 text-caption text-ktip-ocean-600 hover:underline"
          >
            <ExternalLink size={13} aria-hidden="true" />
            <Trans>View my public profile</Trans>
          </Link>
        )}
      </div>
    </Card>
  )
}
