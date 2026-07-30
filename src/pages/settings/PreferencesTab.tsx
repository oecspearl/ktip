import { useState, useEffect } from 'react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Toggle } from '../../components/ui/Toggle'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { useMyPreferences, useSavePreferences, DEFAULT_NOTIFICATION_PREFERENCES } from '../../hooks/usePreferences'
import { useReadableMode } from '../../hooks/useReadableMode'
import { useThemeMode } from '../../hooks/useThemeMode'
import { CONNECTION_VISIBILITY_OPTIONS } from '../../lib/constants'
import type { ConnectionCountVisibility } from '../../types'
import {
  Bell,
  Eye,
  Save,
  Type,
  Moon,
  Users,
} from 'lucide-react'

type NotifPrefs = typeof DEFAULT_NOTIFICATION_PREFERENCES

export function PreferencesTab() {
  const auth = useAuth()
  const toast = useToast()
  const { preferences, loading } = useMyPreferences(auth.user?.id)
  const { savePreferences, loading: saving } = useSavePreferences()
  const [readable, setReadable] = useReadableMode()
  const [darkMode, setDarkMode] = useThemeMode()

  // Notification preferences — persisted in notification_preferences
  // table and enforced by a DB trigger on the notifications table.
  const [notif, setNotif] = useState<NotifPrefs>({ ...DEFAULT_NOTIFICATION_PREFERENCES })

  // Profile privacy — persisted on the profile row and enforced by
  // get_profile_view() and the conversation_participants policy (083).
  // Private is not invisible: the directory teaser stays either way.
  const [profilePublic, setProfilePublic] = useState(true)

  // Still local-only, enforced nowhere. There is no email column on profiles
  // at all, so "Show Email" has nothing to show yet.
  const [showEmail, setShowEmail] = useState(false)
  const [showCountry, setShowCountry] = useState(true)

  // Connection-count audience — persisted on the profile row and
  // enforced by the get_connection_count* RPCs (migration 049).
  const [connVisibility, setConnVisibility] = useState<ConnectionCountVisibility>('public')

  // Leaderboard opt-out — persisted on the profile row and enforced by
  // get_leaderboard() (migration 066). Default is visible; students are
  // excluded server-side regardless of this setting.
  const [onLeaderboard, setOnLeaderboard] = useState(true)

  useEffect(() => {
    if (auth.profile?.connection_count_visibility) {
      setConnVisibility(auth.profile.connection_count_visibility)
    }
  }, [auth.profile?.connection_count_visibility])

  useEffect(() => {
    if (auth.profile?.leaderboard_visibility) {
      setOnLeaderboard(auth.profile.leaderboard_visibility === 'public')
    }
  }, [auth.profile?.leaderboard_visibility])

  // Absent when the deploy is ahead of migration 083 — read that as public,
  // which is what the column defaults to.
  useEffect(() => {
    if (auth.profile) {
      setProfilePublic(auth.profile.profile_visibility !== 'private')
    }
  }, [auth.profile?.profile_visibility, auth.profile])

  // Sync DB row into local state; migrate any legacy localStorage
  // notification prefs the first time the user has no DB row.
  useEffect(() => {
    if (loading || !preferences) return

    let legacy: any = null
    try {
      const saved = localStorage.getItem('ktip_preferences')
      if (saved) legacy = JSON.parse(saved)
    } catch {
      // Ignore parse errors
    }

    setNotif({
      email: preferences.email ?? legacy?.notifications?.email ?? true,
      messages: preferences.messages ?? legacy?.notifications?.messages ?? true,
      events: preferences.events ?? legacy?.notifications?.events ?? true,
      projects: preferences.projects ?? legacy?.notifications?.projects ?? true,
      forums: preferences.forums ?? legacy?.notifications?.forums ?? true,
      collaboration: preferences.collaboration ?? true,
      connections: preferences.connections ?? true,
      achievements: preferences.achievements ?? true,
    })

    // profilePublic is no longer read back from localStorage — the profile row
    // is the source of truth for it now, and a stale legacy value would
    // silently re-open a profile the member had closed.
    if (legacy?.privacy) {
      setShowEmail(legacy.privacy.showEmail ?? false)
      setShowCountry(legacy.privacy.showCountry ?? true)
    }
  }, [loading, preferences])

  const setNotifField = (field: keyof NotifPrefs) => (checked: boolean) =>
    setNotif((prev) => ({ ...prev, [field]: checked }))

  const handleSave = async () => {
    if (!auth.user) return
    try {
      await savePreferences(auth.user.id, notif)
      if (connVisibility !== auth.profile?.connection_count_visibility) {
        await auth.updateProfile({ connection_count_visibility: connVisibility })
      }
      const nextLeaderboard = onLeaderboard ? 'public' : 'private'
      if (nextLeaderboard !== auth.profile?.leaderboard_visibility) {
        await auth.updateProfile({ leaderboard_visibility: nextLeaderboard })
      }
      const nextProfileVisibility = profilePublic ? 'public' : 'private'
      if (nextProfileVisibility !== (auth.profile?.profile_visibility ?? 'public')) {
        await auth.updateProfile({ profile_visibility: nextProfileVisibility })
      }
      // Remaining privacy toggles stay local until enforced server-side
      localStorage.setItem(
        'ktip_preferences',
        JSON.stringify({ privacy: { showEmail, showCountry } })
      )
      toast.success('Preferences saved!')
    } catch {
      toast.error('Failed to save preferences')
    }
  }

  return (
    <div className="space-y-6">
      {/* Notification Preferences */}
      <Card id="notifications" data-spy="Notifications" className="scroll-mt-24">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-ktip-tropical-100 rounded-xl flex items-center justify-center">
            <Bell size={20} className="text-ktip-tropical-600" />
          </div>
          <div>
            <h2 className="text-lg font-display font-bold text-ktip-sand-900">Notifications</h2>
            <p className="text-sm text-ktip-sand-600">Choose what you want to be notified about</p>
          </div>
        </div>

        <div className="divide-y divide-ktip-sand-100">
          <Toggle
            checked={notif.email}
            onChange={setNotifField('email')}
            label="Email Notifications"
            description="Receive email updates about your account activity (coming soon)"
          />
          <Toggle
            checked={notif.messages}
            onChange={setNotifField('messages')}
            label="New Messages"
            description="Get notified when someone sends you a message"
          />
          <Toggle
            checked={notif.events}
            onChange={setNotifField('events')}
            label="Event Reminders"
            description="Receive reminders about upcoming events you've joined"
          />
          <Toggle
            checked={notif.projects}
            onChange={setNotifField('projects')}
            label="Project Updates"
            description="Team invitations, follows, and updates on your projects"
          />
          <Toggle
            checked={notif.forums}
            onChange={setNotifField('forums')}
            label="Forum Replies"
            description="Get notified when someone replies to your forum posts"
          />
          <Toggle
            checked={notif.collaboration}
            onChange={setNotifField('collaboration')}
            label="Collaboration"
            description="Shared documents, whiteboards, and video invites"
          />
          <Toggle
            checked={notif.connections}
            onChange={setNotifField('connections')}
            label="Connections"
            description="Connection requests and acceptances"
          />
          <Toggle
            checked={notif.achievements}
            onChange={setNotifField('achievements')}
            label="Achievements"
            description="Badges you unlock and milestones you reach"
          />
        </div>
      </Card>

      {/* Privacy Preferences */}
      <Card id="privacy" data-spy="Privacy" className="scroll-mt-24">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-ktip-ocean-100 rounded-xl flex items-center justify-center">
            <Eye size={20} className="text-ktip-ocean-600" />
          </div>
          <div>
            <h2 className="text-lg font-display font-bold text-ktip-sand-900">Privacy</h2>
            <p className="text-sm text-ktip-sand-600">Control what others can see about you</p>
          </div>
        </div>

        <div className="divide-y divide-ktip-sand-100">
          <Toggle
            checked={profilePublic}
            onChange={setProfilePublic}
            label="Public Profile"
            description="On, any signed-in member can see your full profile and message you. Off, only your connections can — everyone still sees your name, role and country in the directory, so they can send you a connection request."
          />
          <Toggle
            checked={showEmail}
            onChange={setShowEmail}
            label="Show Email"
            description="Display your email address on your profile"
          />
          <Toggle
            checked={showCountry}
            onChange={setShowCountry}
            label="Show Country"
            description="Display your country on your profile"
          />

          <Toggle
            checked={onLeaderboard}
            onChange={setOnLeaderboard}
            label="Show me on the leaderboard"
            description="Turn this off and your points stay yours alone — you keep earning and can still see your own rank, but nobody else can."
          />

          {/* Connection count audience */}
          <div className="py-3">
            <div className="flex items-center gap-2 text-sm font-medium text-ktip-sand-800">
              <Users size={16} className="text-ktip-sand-500" />
              Who can see my connection count
            </div>
            <p className="text-xs text-ktip-sand-500 mt-0.5 mb-3">
              Controls the number shown on your profile and in the member directory. You can always
              see your own count.
            </p>
            <div
              className="flex flex-col sm:flex-row gap-2"
              role="radiogroup"
              aria-label="Who can see my connection count"
            >
              {CONNECTION_VISIBILITY_OPTIONS.map((option) => {
                const selected = connVisibility === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setConnVisibility(option.value)}
                    className={`flex-1 text-left px-3 py-2.5 rounded-xl border transition-colors ${
                      selected
                        ? 'border-ktip-ocean-500 bg-ktip-ocean-50 text-ktip-ocean-800'
                        : 'border-ktip-sand-200 hover:border-ktip-sand-300 text-ktip-sand-700'
                    }`}
                  >
                    <span className="block text-sm font-medium">{option.label}</span>
                    <span className="block text-xs text-ktip-sand-500 mt-0.5">
                      {option.description}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </Card>

      {/* Accessibility — applies instantly, stored locally, not part of Save */}
      <Card id="accessibility" data-spy="Accessibility" className="scroll-mt-24">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-ktip-ocean-100 rounded-xl flex items-center justify-center">
            <Type size={20} className="text-ktip-ocean-600" />
          </div>
          <div>
            <h2 className="text-lg font-display font-bold text-ktip-sand-900">Accessibility</h2>
            <p className="text-sm text-ktip-sand-600">Make the site easier to read</p>
          </div>
        </div>

        <div className="divide-y divide-ktip-sand-100">
          <Toggle
            checked={readable}
            onChange={setReadable}
            label="Readable font mode"
            description="Use Atkinson Hyperlegible across the site for easier reading. Applies immediately."
          />
        </div>
      </Card>

      {/* Appearance — applies instantly, stored locally, not part of Save */}
      <Card id="appearance" data-spy="Appearance" className="scroll-mt-24">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-ktip-sun-100 rounded-xl flex items-center justify-center">
            <Moon size={20} className="text-ktip-sun-700" />
          </div>
          <div>
            <h2 className="text-lg font-display font-bold text-ktip-sand-900">Appearance</h2>
            <p className="text-sm text-ktip-sand-600">Switch between light and dark mode</p>
          </div>
        </div>

        <div className="divide-y divide-ktip-sand-100">
          <Toggle
            checked={darkMode}
            onChange={setDarkMode}
            label="Dark mode"
            description="Use a dark color theme across the site. Applies immediately."
          />
        </div>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} loading={saving} icon={<Save size={18} />}>
          Save Preferences
        </Button>
      </div>
    </div>
  )
}
