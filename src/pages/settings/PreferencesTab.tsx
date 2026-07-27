import { createSignal } from 'solid-js'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../contexts/ToastContext'
import {
  Bell,
  Eye,
  Save,
} from 'lucide-solid'

interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
}

function Toggle(props: ToggleProps) {
  return (
    <label class="flex items-center justify-between py-3 cursor-pointer group">
      <div class="flex-1 mr-4">
        <div class="text-sm font-medium text-ktip-sand-800 group-hover:text-ktip-sand-900">
          {props.label}
        </div>
        {props.description && (
          <div class="text-xs text-ktip-sand-500 mt-0.5">{props.description}</div>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={props.checked}
        onClick={() => props.onChange(!props.checked)}
        class={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          props.checked ? 'bg-ktip-ocean-500' : 'bg-ktip-sand-300'
        }`}
      >
        <span
          class={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${
            props.checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </label>
  )
}

export function PreferencesTab() {
  const toast = useToast()

  // Notification preferences
  const [emailNotifications, setEmailNotifications] = createSignal(true)
  const [messageNotifications, setMessageNotifications] = createSignal(true)
  const [eventReminders, setEventReminders] = createSignal(true)
  const [projectUpdates, setProjectUpdates] = createSignal(true)
  const [forumReplies, setForumReplies] = createSignal(true)

  // Privacy preferences
  const [profilePublic, setProfilePublic] = createSignal(true)
  const [showEmail, setShowEmail] = createSignal(false)
  const [showCountry, setShowCountry] = createSignal(true)

  const [saving, setSaving] = createSignal(false)

  const handleSave = async () => {
    setSaving(true)
    // For now, store preferences locally until a preferences table is added
    try {
      const preferences = {
        notifications: {
          email: emailNotifications(),
          messages: messageNotifications(),
          events: eventReminders(),
          projects: projectUpdates(),
          forums: forumReplies(),
        },
        privacy: {
          profilePublic: profilePublic(),
          showEmail: showEmail(),
          showCountry: showCountry(),
        },
      }
      localStorage.setItem('ktip_preferences', JSON.stringify(preferences))
      toast.success('Preferences saved!')
    } catch {
      toast.error('Failed to save preferences')
    } finally {
      setSaving(false)
    }
  }

  // Load preferences from local storage on init
  try {
    const saved = localStorage.getItem('ktip_preferences')
    if (saved) {
      const prefs = JSON.parse(saved)
      if (prefs.notifications) {
        setEmailNotifications(prefs.notifications.email ?? true)
        setMessageNotifications(prefs.notifications.messages ?? true)
        setEventReminders(prefs.notifications.events ?? true)
        setProjectUpdates(prefs.notifications.projects ?? true)
        setForumReplies(prefs.notifications.forums ?? true)
      }
      if (prefs.privacy) {
        setProfilePublic(prefs.privacy.profilePublic ?? true)
        setShowEmail(prefs.privacy.showEmail ?? false)
        setShowCountry(prefs.privacy.showCountry ?? true)
      }
    }
  } catch {
    // Ignore parse errors
  }

  return (
    <div class="space-y-6">
      {/* Notification Preferences */}
      <Card>
        <div class="flex items-center gap-3 mb-4">
          <div class="w-10 h-10 bg-ktip-tropical-100 rounded-xl flex items-center justify-center">
            <Bell size={20} class="text-ktip-tropical-600" />
          </div>
          <div>
            <h2 class="text-lg font-display font-bold text-ktip-sand-900">Notifications</h2>
            <p class="text-sm text-ktip-sand-600">Choose what you want to be notified about</p>
          </div>
        </div>

        <div class="divide-y divide-ktip-sand-100">
          <Toggle
            checked={emailNotifications()}
            onChange={setEmailNotifications}
            label="Email Notifications"
            description="Receive email updates about your account activity"
          />
          <Toggle
            checked={messageNotifications()}
            onChange={setMessageNotifications}
            label="New Messages"
            description="Get notified when someone sends you a message"
          />
          <Toggle
            checked={eventReminders()}
            onChange={setEventReminders}
            label="Event Reminders"
            description="Receive reminders about upcoming events you've joined"
          />
          <Toggle
            checked={projectUpdates()}
            onChange={setProjectUpdates}
            label="Project Updates"
            description="Get notified about comments and updates on your projects"
          />
          <Toggle
            checked={forumReplies()}
            onChange={setForumReplies}
            label="Forum Replies"
            description="Get notified when someone replies to your forum posts"
          />
        </div>
      </Card>

      {/* Privacy Preferences */}
      <Card>
        <div class="flex items-center gap-3 mb-4">
          <div class="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
            <Eye size={20} class="text-purple-600" />
          </div>
          <div>
            <h2 class="text-lg font-display font-bold text-ktip-sand-900">Privacy</h2>
            <p class="text-sm text-ktip-sand-600">Control what others can see about you</p>
          </div>
        </div>

        <div class="divide-y divide-ktip-sand-100">
          <Toggle
            checked={profilePublic()}
            onChange={setProfilePublic}
            label="Public Profile"
            description="Allow others to view your profile page"
          />
          <Toggle
            checked={showEmail()}
            onChange={setShowEmail}
            label="Show Email"
            description="Display your email address on your profile"
          />
          <Toggle
            checked={showCountry()}
            onChange={setShowCountry}
            label="Show Country"
            description="Display your country on your profile"
          />
        </div>
      </Card>

      {/* Save Button */}
      <div class="flex justify-end">
        <Button onClick={handleSave} loading={saving()} icon={<Save size={18} />}>
          Save Preferences
        </Button>
      </div>
    </div>
  )
}
