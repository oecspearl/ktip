import { useState, useEffect } from 'react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { useMyPreferences, useSavePreferences, DEFAULT_NOTIFICATION_PREFERENCES } from '../../hooks/usePreferences'
import { useReadableMode } from '../../hooks/useReadableMode'
import { useThemeMode } from '../../hooks/useThemeMode'
import {
  Bell,
  Eye,
  Save,
  Type,
  Moon,
} from 'lucide-react'

interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
}

function Toggle({ checked, onChange, label, description }: ToggleProps) {
  return (
    <label className="flex items-center justify-between py-3 cursor-pointer group">
      <div className="flex-1 mr-4">
        <div className="text-sm font-medium text-ktip-sand-800 group-hover:text-ktip-sand-900">
          {label}
        </div>
        {description && (
          <div className="text-xs text-ktip-sand-500 mt-0.5">{description}</div>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          checked ? 'bg-ktip-ocean-500' : 'bg-ktip-sand-300'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </label>
  )
}

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

  // Privacy preferences — still local-only (no enforcement yet)
  const [profilePublic, setProfilePublic] = useState(true)
  const [showEmail, setShowEmail] = useState(false)
  const [showCountry, setShowCountry] = useState(true)

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
    })

    if (legacy?.privacy) {
      setProfilePublic(legacy.privacy.profilePublic ?? true)
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
      // Privacy stays local until enforced server-side
      localStorage.setItem(
        'ktip_preferences',
        JSON.stringify({ privacy: { profilePublic, showEmail, showCountry } })
      )
      toast.success('Preferences saved!')
    } catch {
      toast.error('Failed to save preferences')
    }
  }

  return (
    <div className="space-y-6">
      {/* Notification Preferences */}
      <Card>
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
        </div>
      </Card>

      {/* Privacy Preferences */}
      <Card>
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
            description="Allow others to view your profile page"
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
        </div>
      </Card>

      {/* Accessibility — applies instantly, stored locally, not part of Save */}
      <Card>
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
      <Card>
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
