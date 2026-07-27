import { createSignal, Show, For } from 'solid-js'
import { A } from '@solidjs/router'
import { MainLayout } from '../../components/layout/MainLayout'
import { usePageTitle } from '../../hooks/usePageTitle'
import { User, Shield, Bell, ChevronRight } from 'lucide-solid'
import { ProfileSettingsTab } from './ProfileSettingsTab'
import { SecuritySettingsTab } from './SecuritySettingsTab'
import { PreferencesTab } from './PreferencesTab'
import { cn } from '../../lib/utils'

type SettingsTab = 'profile' | 'security' | 'preferences'

const tabs = [
  { id: 'profile' as const, label: 'Profile', icon: User, description: 'Manage your profile info' },
  { id: 'security' as const, label: 'Security', icon: Shield, description: 'Password & account' },
  { id: 'preferences' as const, label: 'Preferences', icon: Bell, description: 'Notifications & display' },
]

export default function SettingsPage() {
  usePageTitle(() => 'Settings')
  const [activeTab, setActiveTab] = createSignal<SettingsTab>('profile')

  return (
    <MainLayout>
      {/* Dark Hero */}
      <div class="bg-gray-800 min-h-[180px]">
        <div class="container mx-auto px-4 pt-6 pb-10">
          {/* Breadcrumb */}
          <nav class="flex items-center gap-1.5 text-sm text-gray-400 mb-6">
            <A href="/" class="hover:text-white transition-colors">Home</A>
            <ChevronRight size={14} class="text-gray-500" />
            <span class="text-gray-200">Settings</span>
          </nav>

          <h1 class="text-3xl font-display font-bold text-white">Settings</h1>
          <p class="text-gray-400 mt-1">Manage your account and preferences</p>
        </div>
      </div>

      {/* Content */}
      <div class="container mx-auto px-4 -mt-4 pb-8">
        <div class="flex flex-col lg:flex-row gap-6">
          {/* Sidebar Tabs */}
          <div class="lg:w-64 shrink-0">
            <div class="bg-white border border-gray-200 rounded-lg p-2">
              <nav class="space-y-1">
                <For each={tabs}>
                  {(tab) => (
                    <button
                      onClick={() => setActiveTab(tab.id)}
                      class={cn(
                        'w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all',
                        activeTab() === tab.id
                          ? 'bg-ktip-ocean-50 text-ktip-ocean-700'
                          : 'text-ktip-sand-600 hover:bg-ktip-sand-50 hover:text-ktip-sand-900'
                      )}
                    >
                      <tab.icon size={20} />
                      <div>
                        <div class="font-medium text-sm">{tab.label}</div>
                        <div class="text-xs opacity-70">{tab.description}</div>
                      </div>
                    </button>
                  )}
                </For>
              </nav>
            </div>
          </div>

          {/* Tab Content */}
          <div class="flex-1 min-w-0">
            <Show when={activeTab() === 'profile'}>
              <ProfileSettingsTab />
            </Show>
            <Show when={activeTab() === 'security'}>
              <SecuritySettingsTab />
            </Show>
            <Show when={activeTab() === 'preferences'}>
              <PreferencesTab />
            </Show>
          </div>
        </div>
      </div>
    </MainLayout>
  )
}
