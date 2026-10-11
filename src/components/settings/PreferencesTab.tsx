import { useState, useEffect } from 'react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Toggle } from '../../components/ui/Toggle'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { useMyPreferences, useSavePreferences, DEFAULT_NOTIFICATION_PREFERENCES } from '../../hooks/usePreferences'
import { useThemeMode } from '../../hooks/useThemeMode'
import { AccessibilityControls } from '../../a11y/ui'
import { useLanguage } from '../../i18n/LanguageContext'
import { CONNECTION_VISIBILITY_OPTIONS } from '../../lib/constants'
import { LANGUAGE_NAMES, SELECTABLE_LANGS } from '../../i18n/language'
import { isUiLang, type UiLang } from '../../lib/i18n/protocol'
import type { ConnectionCountVisibility } from '../../types'
import {
  Bell,
  Eye,
  Globe,
  Languages,
  Save,
  Type,
  Moon,
  Users,
} from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { resolveCopy } from '../../i18n/copy'

type NotifPrefs = typeof DEFAULT_NOTIFICATION_PREFERENCES

const RADIO_CLASS = (selected: boolean) =>
  `flex-1 text-left px-3 py-2.5 rounded-neu-sm border transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
    selected
      ? 'border-ktip-ocean-300 shadow-neu-sm-inset text-ktip-ocean-800'
      : 'border-ktip-sand-200 text-ktip-sand-700 hover:-translate-y-px hover:shadow-neu-sm'
  }`

export function PreferencesTab() {
    const { t, i18n } = useLingui()
  const auth = useAuth()
  const toast = useToast()
  const { preferences, loading } = useMyPreferences(auth.user?.id)
  const { savePreferences, loading: saving } = useSavePreferences()
  const [darkMode, setDarkMode] = useThemeMode()
  const { lang: uiLang, setLang } = useLanguage()

  // Notification preferences — persisted in notification_preferences
  // table and enforced by a DB trigger on the notifications table.
  const [notif, setNotif] = useState<NotifPrefs>({ ...DEFAULT_NOTIFICATION_PREFERENCES })

  // Profile privacy — persisted on the profile row and enforced by
  // get_profile_view() and the conversation_participants policy (083).
  // Private is not invisible: the directory teaser stays either way.
  const [profilePublic, setProfilePublic] = useState(true)

  // Connection-count audience — persisted on the profile row and
  // enforced by the get_connection_count* RPCs (migration 049). The
  // profile's 'standing' section narrows it further (166).
  const [connVisibility, setConnVisibility] = useState<ConnectionCountVisibility>('public')

  // Leaderboard opt-out — persisted on the profile row and enforced by
  // get_leaderboard() (migration 066). Default is visible; students are
  // excluded server-side regardless of this setting, and a private
  // 'standing' section hides the member from non-connections (166).
  const [onLeaderboard, setOnLeaderboard] = useState(true)

  // Language of OTHER members' writing — persisted on the profile row (100) and
  // consumed by useContentLanguage(). '' means "follow the interface language",
  // which is the default and what almost everyone keeps; it is stored as NULL.
  const [contentLang, setContentLang] = useState<'' | UiLang>('')
  const [autoTranslate, setAutoTranslate] = useState(true)

  useEffect(() => {
    const value = auth.profile?.content_language
    setContentLang(isUiLang(value) ? value : '')
  }, [auth.profile?.content_language])

  // `!== false` rather than `?? true`: absent means a deploy running ahead of
  // migration 100, and that has to read as on.
  useEffect(() => {
    setAutoTranslate(auth.profile?.auto_translate !== false)
  }, [auth.profile?.auto_translate])

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
  // notification prefs the first time the user has no DB row. The legacy
  // blob's `privacy` half (Show Email / Show Country) is ignored: those two
  // toggles were never enforced anywhere and are gone.
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
      // NULL, not '': the column's CHECK only accepts the three codes or NULL,
      // and NULL is what "follow the interface language" means to the reader.
      const nextContentLang = contentLang === '' ? null : contentLang
      if (nextContentLang !== (auth.profile?.content_language ?? null)) {
        await auth.updateProfile({ content_language: nextContentLang })
      }
      if (autoTranslate !== (auth.profile?.auto_translate !== false)) {
        await auth.updateProfile({ auto_translate: autoTranslate })
      }
      // The legacy blob has nothing left to carry; clear it so it cannot
      // resurrect a stale notification value on some later first load.
      try {
        localStorage.removeItem('ktip_preferences')
      } catch {
        // storage unavailable — nothing to clear
      }
      toast.success(t`Preferences saved!`)
    } catch {
      toast.error(t`Failed to save preferences`)
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
            <h2 className="text-lg font-display font-bold text-ktip-sand-900"><Trans>Notifications</Trans></h2>
            <p className="text-sm text-ktip-sand-600"><Trans>Choose what you want to be notified about</Trans></p>
          </div>
        </div>

        <div className="divide-y divide-ktip-sand-100">
          <Toggle
            checked={notif.email}
            onChange={setNotifField('email')}
            label={t`Email me about activity`}
            description={t`Event registrations waiting on you and replies to your feedback. Security and legal mail — sign-in codes, verification, account notices — always arrives regardless.`}
          />
          <Toggle
            checked={notif.messages}
            onChange={setNotifField('messages')}
            label={t`New Messages`}
            description={t`Get notified when someone sends you a message`}
          />
          <Toggle
            checked={notif.events}
            onChange={setNotifField('events')}
            label={t`Event Reminders`}
            description={t`Receive reminders about upcoming events you've joined`}
          />
          <Toggle
            checked={notif.projects}
            onChange={setNotifField('projects')}
            label={t`Project Updates`}
            description={t`Team invitations, follows, and updates on your projects`}
          />
          <Toggle
            checked={notif.forums}
            onChange={setNotifField('forums')}
            label={t`Forum Replies`}
            description={t`Get notified when someone replies to your forum posts`}
          />
          <Toggle
            checked={notif.collaboration}
            onChange={setNotifField('collaboration')}
            label={t`Collaboration`}
            description={t`Shared documents, whiteboards, and video invites`}
          />
          <Toggle
            checked={notif.connections}
            onChange={setNotifField('connections')}
            label={t`Connections`}
            description={t`Connection requests and acceptances`}
          />
          <Toggle
            checked={notif.achievements}
            onChange={setNotifField('achievements')}
            label={t`Achievements`}
            description={t`Badges you unlock and milestones you reach`}
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
            <h2 className="text-lg font-display font-bold text-ktip-sand-900"><Trans>Privacy</Trans></h2>
            <p className="text-sm text-ktip-sand-600"><Trans>Control what others can see about you</Trans></p>
          </div>
        </div>

        <div className="divide-y divide-ktip-sand-100">
          <Toggle
            checked={profilePublic}
            onChange={setProfilePublic}
            label={t`Public Profile`}
            description={t`On, any signed-in member can see your full profile and message you. Off, only your connections can — everyone still sees your name, role and country in the directory, so they can send you a connection request.`}
          />

          <Toggle
            checked={onLeaderboard}
            onChange={setOnLeaderboard}
            label={t`Show me on the leaderboard`}
            description={t`Turn this off and your points stay yours alone — you keep earning and can still see your own rank, but nobody else can. Making your level and points private on your profile also keeps you off the board for everyone but your connections.`}
          />

          {/* Connection count audience */}
          <div className="py-3">
            <div className="flex items-center gap-2 text-sm font-medium text-ktip-sand-800">
              <Users size={16} className="text-ktip-sand-500" />
              <Trans>Who can see my connection count</Trans>
            </div>
            <p className="text-xs text-ktip-sand-500 mt-0.5 mb-3">
              <Trans>Controls the number shown on your profile and in the member directory. You can always see your own count. If your level and points are private on your profile, only your connections see it, even if you pick Everyone.</Trans>
            </p>
            <div
              className="flex flex-col sm:flex-row gap-2"
              role="radiogroup"
              aria-label={t`Who can see my connection count`}
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
                    className={RADIO_CLASS(selected)}
                  >
                    <span className="block text-sm font-medium">{resolveCopy(i18n, option.label)}</span>
                    <span className="block text-xs text-ktip-sand-500 mt-0.5">
                      {resolveCopy(i18n, option.description)}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </Card>

      {/* Language — the site's own language, then what OTHER members' writing is turned into */}
      <Card id="language" data-spy="Language" className="scroll-mt-24">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-ktip-tropical-100 rounded-xl flex items-center justify-center">
            <Languages size={20} className="text-ktip-tropical-600" />
          </div>
          <div>
            <h2 className="text-lg font-display font-bold text-ktip-sand-900"><Trans>Language</Trans></h2>
            <p className="text-sm text-ktip-sand-600">
              <Trans>The language the site is in, and how other members' writing is shown to you</Trans>
            </p>
          </div>
        </div>

        <div className="divide-y divide-ktip-sand-100">
          {/* Interface language. Applies instantly and follows the member to
              their other devices through profiles.preferred_language (097). */}
          <div className="py-3">
            <div className="flex items-center gap-2 text-sm font-medium text-ktip-sand-800">
              <Globe size={16} className="text-ktip-sand-500" />
              <Trans>Site language</Trans>
            </div>
            <p className="text-xs text-ktip-sand-500 mt-0.5 mb-3">
              <Trans>Menus, buttons and labels. Applies immediately and follows you to your other devices.</Trans>
            </p>
            <div className="flex flex-col sm:flex-row gap-2" role="radiogroup" aria-label={t`Site language`}>
              {SELECTABLE_LANGS.map((option) => {
                const selected = uiLang === option
                return (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setLang(option)}
                    className={RADIO_CLASS(selected)}
                  >
                    <span className="block text-sm font-medium" lang={option}>
                      {LANGUAGE_NAMES[option]}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <Toggle
            checked={autoTranslate}
            onChange={setAutoTranslate}
            label={t`Translate messages for me`}
            description={t`Chat, announcements and event descriptions written in another language are translated automatically. You can always see the original.`}
          />

          <div className="py-3">
            <div className="flex items-center gap-2 text-sm font-medium text-ktip-sand-800">
              <Languages size={16} className="text-ktip-sand-500" />
              <Trans>Translate into</Trans>
            </div>
            <p className="text-xs text-ktip-sand-500 mt-0.5 mb-3">
              <Trans>Separate from the language the site itself is in. Change this if you would rather read other people's writing in a different language than the one you navigate in.</Trans>
            </p>
            <div
              className="flex flex-col sm:flex-row gap-2"
              role="radiogroup"
              aria-label={t`Translate messages into`}
            >
              {/* '' first: the default, and the answer for almost everyone. */}
              {(['', ...SELECTABLE_LANGS] as const).map((option) => {
                const selected = contentLang === option
                return (
                  <button
                    key={option || 'follow'}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={!autoTranslate}
                    onClick={() => setContentLang(option)}
                    className={RADIO_CLASS(selected)}
                  >
                    {/* The endonym, and lang= on it, for the same reasons as the
                        language switcher: someone who cannot read the current
                        interface language can still find their own, and a screen
                        reader pronounces it with the right voice. */}
                    <span className="block text-sm font-medium" lang={option || undefined}>
                      {option ? LANGUAGE_NAMES[option] : t`Same as the site`}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </Card>

      {/* Accessibility — applies instantly and follows the member across
          devices (155); not part of Save */}
      <Card id="accessibility" data-spy="Accessibility" className="scroll-mt-24">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-ktip-ocean-100 rounded-xl flex items-center justify-center">
            <Type size={20} className="text-ktip-ocean-600" />
          </div>
          <div>
            <h2 className="text-lg font-display font-bold text-ktip-sand-900"><Trans>Accessibility</Trans></h2>
            <p className="text-sm text-ktip-sand-600"><Trans>Make the site easier to read and use. Changes apply straight away and follow you to your other devices.</Trans></p>
          </div>
        </div>

        {/* The same controls as the floating panel (a11y kit). Dark mode keeps
            its own card below, so it is left out here */}
        <AccessibilityControls variant="settings" exclude={['theme']} />
      </Card>

      {/* Appearance — applies instantly and follows the member across devices (155) */}
      <Card id="appearance" data-spy="Appearance" className="scroll-mt-24">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-ktip-sun-100 rounded-xl flex items-center justify-center">
            <Moon size={20} className="text-ktip-sun-700" />
          </div>
          <div>
            <h2 className="text-lg font-display font-bold text-ktip-sand-900"><Trans>Appearance</Trans></h2>
            <p className="text-sm text-ktip-sand-600"><Trans>Switch between light and dark mode</Trans></p>
          </div>
        </div>

        <div className="divide-y divide-ktip-sand-100">
          <Toggle
            checked={darkMode}
            onChange={setDarkMode}
            label={t`Dark mode`}
            description={t`Use a dark color theme across the site. Applies immediately and follows you to your other devices.`}
          />
        </div>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} loading={saving} icon={<Save size={18} />}>
          <Trans>Save Preferences</Trans>
        </Button>
      </div>
    </div>
  )
}
