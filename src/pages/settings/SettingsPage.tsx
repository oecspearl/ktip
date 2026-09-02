import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { usePageTitle } from '../../hooks/usePageTitle'
import { User, Shield, Bell, BadgeCheck, Sparkles, ScrollText, MessageCircle } from 'lucide-react'
import { PageHero } from '../../components/layout/PageHero'
import { ProfileSettingsTab } from './ProfileSettingsTab'
import { SecuritySettingsTab } from './SecuritySettingsTab'
import { PreferencesTab } from './PreferencesTab'
import { PersonalizationTab } from './PersonalizationTab'
import { VerificationTab } from './VerificationTab'
import { LegalSettingsTab } from './LegalSettingsTab'
import { FeedbackTab } from './FeedbackTab'
import { cn } from '../../lib/utils'
import { useLingui } from '@lingui/react/macro'
import { msg } from '@lingui/core/macro'

type SettingsTab =
  | 'profile'
  | 'security'
  | 'preferences'
  | 'personalization'
  | 'verification'
  | 'feedback'
  | 'legal'

const tabs = [
  { id: 'profile' as const, label: msg`Profile`, icon: User, description: msg`Manage your profile info` },
  { id: 'security' as const, label: msg`Security`, icon: Shield, description: msg`Password & account` },
  { id: 'preferences' as const, label: msg`Preferences`, icon: Bell, description: msg`Notifications & display` },
  { id: 'personalization' as const, label: msg`Personalization`, icon: Sparkles, description: msg`Tune what you see` },
  { id: 'verification' as const, label: msg`Verification`, icon: BadgeCheck, description: msg`Verify your identity` },
  { id: 'feedback' as const, label: msg`Feedback`, icon: MessageCircle, description: msg`What you sent us` },
  { id: 'legal' as const, label: msg`Legal & Consent`, icon: ScrollText, description: msg`What you agreed to` },
]

function isSettingsTab(value: string | null): value is SettingsTab {
  return !!value && tabs.some((tab) => tab.id === value)
}

export default function SettingsPage() {
    const { t, i18n } = useLingui()
  usePageTitle(t`Settings`)
  // `?tab=security` lets the global search panel deep-link straight to a tab
  const [searchParams] = useSearchParams()
  const requestedTab = searchParams.get('tab')
  const [activeTab, setActiveTab] = useState<SettingsTab>(
    isSettingsTab(requestedTab) ? requestedTab : 'profile'
  )

  // The page stays mounted when only the query string changes, so follow it
  useEffect(() => {
    if (isSettingsTab(requestedTab)) setActiveTab(requestedTab)
  }, [requestedTab])

  return (
    <>
      <PageHero
        eyebrow={t`Account`}
        title={t`Settings`}
        subtitle={t`Manage your account and preferences`}
        imageSeed="settings"
        breadcrumb={[{ label: t`Home`, href: '/' }, { label: t`Settings` }]}
      />

      {/* Content */}
      <div className="w-full max-w-page mx-auto px-4 pt-8 pb-8">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Sidebar Tabs */}
          <div className="lg:w-64 shrink-0">
            <div className="bg-ktip-cream border border-ktip-sand-200 rounded-lg p-2">
              <nav data-tutorial="settings-nav" className="space-y-1">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all',
                      activeTab === tab.id
                        ? 'bg-ktip-ocean-50 text-ktip-ocean-700'
                        : 'text-ktip-sand-600 hover:bg-ktip-sand-50 hover:text-ktip-sand-900'
                    )}
                  >
                    <tab.icon size={20} />
                    <div>
                      <div className="font-medium text-sm">{i18n._(tab.label)}</div>
                      <div className="text-xs opacity-70">{i18n._(tab.description)}</div>
                    </div>
                  </button>
                ))}
              </nav>
            </div>
          </div>

          {/* Tab Content */}
          <div data-tutorial="settings-panel" className="flex-1 min-w-0">
            {activeTab === 'profile' && <ProfileSettingsTab />}
            {activeTab === 'security' && <SecuritySettingsTab />}
            {activeTab === 'preferences' && <PreferencesTab />}
            {activeTab === 'personalization' && <PersonalizationTab />}
            {activeTab === 'verification' && <VerificationTab />}
            {activeTab === 'feedback' && <FeedbackTab />}
            {activeTab === 'legal' && <LegalSettingsTab />}
          </div>
        </div>
      </div>
    </>
  )
}
