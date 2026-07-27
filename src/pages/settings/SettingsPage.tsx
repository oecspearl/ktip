import { useState } from 'react'
import { Link } from 'react-router'
import { usePageTitle } from '../../hooks/usePageTitle'
import { User, Shield, Bell, BadgeCheck, ChevronRight } from 'lucide-react'
import { ProfileSettingsTab } from './ProfileSettingsTab'
import { SecuritySettingsTab } from './SecuritySettingsTab'
import { PreferencesTab } from './PreferencesTab'
import { VerificationTab } from './VerificationTab'
import { cn } from '../../lib/utils'

type SettingsTab = 'profile' | 'security' | 'preferences' | 'verification'

const tabs = [
  { id: 'profile' as const, label: 'Profile', icon: User, description: 'Manage your profile info' },
  { id: 'security' as const, label: 'Security', icon: Shield, description: 'Password & account' },
  { id: 'preferences' as const, label: 'Preferences', icon: Bell, description: 'Notifications & display' },
  { id: 'verification' as const, label: 'Verification', icon: BadgeCheck, description: 'Verify your identity' },
]

export default function SettingsPage() {
  usePageTitle('Settings')
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile')

  return (
    <>
      {/* Dark Hero */}
      <div className="bg-gray-800 min-h-[180px]">
        <div className="container mx-auto px-4 pt-6 pb-10">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-sm text-gray-400 mb-6">
            <Link to="/" className="hover:text-white transition-colors">Home</Link>
            <ChevronRight size={14} className="text-gray-500" />
            <span className="text-gray-200">Settings</span>
          </nav>

          <h1 className="text-3xl font-display font-bold text-white">Settings</h1>
          <p className="text-gray-400 mt-1">Manage your account and preferences</p>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 -mt-4 pb-8">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Sidebar Tabs */}
          <div className="lg:w-64 shrink-0">
            <div className="bg-white border border-gray-200 rounded-lg p-2">
              <nav className="space-y-1">
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
                      <div className="font-medium text-sm">{tab.label}</div>
                      <div className="text-xs opacity-70">{tab.description}</div>
                    </div>
                  </button>
                ))}
              </nav>
            </div>
          </div>

          {/* Tab Content */}
          <div className="flex-1 min-w-0">
            {activeTab === 'profile' && <ProfileSettingsTab />}
            {activeTab === 'security' && <SecuritySettingsTab />}
            {activeTab === 'preferences' && <PreferencesTab />}
            {activeTab === 'verification' && <VerificationTab />}
          </div>
        </div>
      </div>
    </>
  )
}
