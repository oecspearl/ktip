import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { ExternalLink, Lock, LockOpen } from 'lucide-react'
import { Card } from '../../../components/ui/Card'
import { Toggle } from '../../../components/ui/Toggle'
import { ProfileSettingsTab } from '../../settings/ProfileSettingsTab'
import { useAuth } from '../../../contexts/AuthContext'
import { useToast } from '../../../contexts/ToastContext'
import { usePageTitle } from '../../../hooks/usePageTitle'
import { memberPath } from '../../../lib/slug'
import { Trans, useLingui } from '@lingui/react/macro'

/**
 * The member's public face, managed from the dashboard.
 *
 * Two things live here and nowhere else conceptually:
 *  - the profile editor (what other members see) — the same
 *    ProfileSettingsTab that Settings renders, so there is one form and
 *    nothing for two copies to disagree about;
 *  - the profile lock — profile_visibility, enforced server-side by
 *    get_profile_view() and the conversation_participants policy (083).
 *    Locked is not invisible: the directory teaser (name, photo, country)
 *    stays either way; details and messaging require an accepted
 *    connection, and the connection request *is* the access request.
 */
export default function MyProfileTab() {
  const { t } = useLingui()
  usePageTitle(t`My Profile`)
  const auth = useAuth()
  const toast = useToast()

  // Local mirror so the switch flips instantly; the profile row is the
  // source of truth once the refetch lands. Absent column (deploy ahead of
  // migration 083) reads as public, matching the column default.
  const [locked, setLocked] = useState(false)
  useEffect(() => {
    if (auth.profile) setLocked(auth.profile.profile_visibility === 'private')
  }, [auth.profile?.profile_visibility, auth.profile])

  const [savingLock, setSavingLock] = useState(false)

  const handleLockChange = async (next: boolean) => {
    setLocked(next)
    setSavingLock(true)
    try {
      await auth.updateProfile({ profile_visibility: next ? 'private' : 'public' })
      toast.success(
        next
          ? t`Profile locked. Members must connect with you to see your details or message you.`
          : t`Profile unlocked. Any member can view your full profile.`
      )
    } catch (err: any) {
      setLocked(!next)
      toast.error(err.message || t`Failed to update profile privacy`)
    } finally {
      setSavingLock(false)
    }
  }

  const profileHref = auth.profile ? memberPath(auth.profile) : null

  return (
    <div className="space-y-6">
      {/* Privacy lock — kept above the editor so "who can see this" is
          answered before "what do they see". */}
      <Card id="privacy" data-spy="Privacy" className="scroll-mt-24">
        <div className="flex items-start justify-between gap-4 mb-1">
          <h2 className="text-lg font-display font-bold text-ktip-sand-900 flex items-center gap-2">
            {locked ? <Lock size={18} /> : <LockOpen size={18} />}
            <Trans>Profile Privacy</Trans>
          </h2>
          {profileHref && (
            <Link
              to={profileHref}
              className="inline-flex items-center gap-1.5 text-sm text-ktip-ocean-600 hover:underline shrink-0"
            >
              <ExternalLink size={14} />
              <Trans>View my public profile</Trans>
            </Link>
          )}
        </div>
        <Toggle
          checked={locked}
          onChange={handleLockChange}
          disabled={savingLock || auth.profileLoading}
          label={t`Lock my profile`}
          description={t`When locked, other members see only your name, photo and country. To view your full profile or message you, they must send a connection request — accepting it is what grants access.`}
        />
      </Card>

      {/* The editor itself. Everything saved here is what an allowed viewer
          sees on your public profile and in the member directory. */}
      <ProfileSettingsTab />
    </div>
  )
}
