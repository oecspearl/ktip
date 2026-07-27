import { createSignal, createMemo, Show, For, Suspense } from 'solid-js'
import { useParams, useNavigate, A } from '@solidjs/router'
import { MainLayout } from '../../components/layout/MainLayout'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Textarea } from '../../components/ui/Textarea'
import { Modal } from '../../components/ui/Modal'
import { ProjectCard } from '../../components/projects/ProjectCard'
import { EventCard } from '../../components/events/EventCard'
import { useProfile, useUserProjects, useUserEvents } from '../../hooks/useProfile'
import { useAuth } from '../../contexts/AuthContext'
import { profileUpdateSchema } from '../../lib/validation'
import {
  ChevronRight,
  Edit,
  MessageSquare,
  MapPin,
  Calendar,
  CheckCircle,
  FolderKanban,
  User,
  Flag,
} from 'lucide-solid'
import {
  ROLE_LABELS,
  ROLE_COLORS,
  CARIBBEAN_COUNTRIES,
} from '../../lib/constants'
import {
  formatDate,
  getInitials,
  generateAvatarColor,
} from '../../lib/utils'
import { usePageTitle } from '../../hooks/usePageTitle'

export default function ProfilePage() {
  const params = useParams()
  const navigate = useNavigate()
  const auth = useAuth()

  const resolvedId = createMemo(() => {
    if (!params.id || params.id === 'me') return auth.user()?.id
    return params.id
  })

  const { profile, refetch: refetchProfile } = useProfile(resolvedId)
  const { projects } = useUserProjects(resolvedId)
  const { events } = useUserEvents(resolvedId)

  usePageTitle(() => profile()?.display_name ? `${profile()!.display_name}'s Profile` : 'Profile')

  const isOwnProfile = createMemo(() => resolvedId() === auth.user()?.id)

  const [activeTab, setActiveTab] = createSignal<'projects' | 'events'>('projects')
  const [showEditModal, setShowEditModal] = createSignal(false)

  // Edit form state
  const [editName, setEditName] = createSignal('')
  const [editBio, setEditBio] = createSignal('')
  const [editCountry, setEditCountry] = createSignal('')
  const [editErrors, setEditErrors] = createSignal<Record<string, string>>({})
  const [editLoading, setEditLoading] = createSignal(false)

  const openEditModal = () => {
    const p = profile()
    if (p) {
      setEditName(p.display_name || '')
      setEditBio(p.bio || '')
      setEditCountry(p.country || '')
      setEditErrors({})
    }
    setShowEditModal(true)
  }

  const handleSaveProfile = async (e: Event) => {
    e.preventDefault()
    setEditErrors({})

    const input = {
      display_name: editName(),
      bio: editBio() || undefined,
      country: editCountry() || undefined,
    }

    const result = profileUpdateSchema.safeParse(input)
    if (!result.success) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of result.error.issues) {
        const field = issue.path[0]?.toString()
        if (field) fieldErrors[field] = issue.message
      }
      setEditErrors(fieldErrors)
      return
    }

    setEditLoading(true)
    try {
      await auth.updateProfile({
        display_name: editName(),
        bio: editBio() || null,
        country: editCountry() || null,
      })
      setShowEditModal(false)
      refetchProfile()
    } catch (err: any) {
      setEditErrors({ _form: err.message || 'Failed to update profile' })
    } finally {
      setEditLoading(false)
    }
  }

  const displayName = () => profile()?.display_name || 'Unknown User'

  return (
    <MainLayout>
      <Suspense
        fallback={
          <div class="bg-gray-800 min-h-[180px] animate-pulse-soft" />
        }
      >
        <Show
          when={!profile.loading && profile()}
          fallback={
            <div class="container mx-auto px-4 py-12 text-center">
              <div class="w-16 h-16 bg-ktip-sand-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <User size={32} class="text-ktip-sand-400" />
              </div>
              <h2 class="text-2xl font-display font-bold text-ktip-sand-900 mb-2">
                Profile not found
              </h2>
              <p class="text-ktip-sand-600 mb-6">
                This user doesn't exist or their profile is unavailable.
              </p>
              <Button onClick={() => navigate('/')}>
                Back to Home
              </Button>
            </div>
          }
        >
          {/* Dark Hero */}
          <div class="bg-gray-800 min-h-[180px] relative">
            <div class="container mx-auto px-4 pt-6 pb-16">
              {/* Breadcrumb */}
              <nav class="flex items-center gap-1.5 text-sm text-gray-400 mb-6">
                <A href="/" class="hover:text-white transition-colors">Home</A>
                <ChevronRight size={14} class="text-gray-500" />
                <span class="text-gray-400">Profile</span>
                <ChevronRight size={14} class="text-gray-500" />
                <span class="text-gray-200">{displayName()}</span>
              </nav>

              <div class="flex flex-col md:flex-row items-start gap-6">
                {/* Avatar */}
                <Show
                  when={profile()?.avatar_url}
                  fallback={
                    <div
                      class={`w-24 h-24 rounded-full flex items-center justify-center text-3xl font-bold text-white shrink-0 ring-4 ring-gray-700 ${generateAvatarColor(displayName())}`}
                    >
                      {getInitials(displayName())}
                    </div>
                  }
                >
                  <img
                    src={profile()!.avatar_url!}
                    alt={displayName()}
                    class="w-24 h-24 rounded-full object-cover shrink-0 ring-4 ring-gray-700"
                  />
                </Show>

                {/* Name + Country */}
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-3 mb-1 flex-wrap">
                    <h1 class="text-3xl font-display font-bold text-white">
                      {displayName()}
                    </h1>
                    <Show when={profile()!.is_verified}>
                      <span class="flex items-center gap-1 text-ktip-ocean-400" title="Verified">
                        <CheckCircle size={20} />
                      </span>
                    </Show>
                  </div>

                  <Show when={profile()!.country}>
                    <p class="flex items-center gap-1.5 text-gray-300">
                      <MapPin size={16} />
                      {profile()!.country}
                    </p>
                  </Show>
                </div>

                {/* Actions */}
                <div class="flex gap-3 shrink-0">
                  <Show when={isOwnProfile()}>
                    <Button variant="outline" icon={<Edit size={18} />} onClick={openEditModal} class="border-gray-500 text-white hover:bg-gray-700">
                      Edit Profile
                    </Button>
                  </Show>
                  <Show when={!isOwnProfile()}>
                    <A href={`/messages?user=${profile()!.id}`}>
                      <Button variant="outline" icon={<MessageSquare size={18} />} class="border-gray-500 text-white hover:bg-gray-700">
                        Send Message
                      </Button>
                    </A>
                    <A href={`/grievances/report/${profile()!.id}`}>
                      <Button variant="ghost" icon={<Flag size={18} />} class="text-gray-400 hover:bg-red-500/10 hover:text-red-400">
                        Report
                      </Button>
                    </A>
                  </Show>
                </div>
              </div>
            </div>
          </div>

          {/* White Content Below */}
          <div class="container mx-auto px-4 -mt-4">
            {/* Profile Info Section */}
            <div class="bg-white border border-gray-200 rounded-lg p-6 mb-8">
              {/* Role Badges */}
              <Show when={profile()!.roles?.length}>
                <div class="flex flex-wrap gap-2 mb-3">
                  <For each={profile()!.roles}>
                    {(role) => (
                      <Badge class={ROLE_COLORS[role]}>
                        {ROLE_LABELS[role] || role}
                      </Badge>
                    )}
                  </For>
                </div>
              </Show>

              {/* Bio */}
              <Show when={profile()!.bio}>
                <p class="text-ktip-sand-700 whitespace-pre-wrap mb-3">
                  {profile()!.bio}
                </p>
              </Show>

              {/* Skills */}
              <Show when={profile()!.skills?.length}>
                <div class="flex flex-wrap gap-1.5 mb-3">
                  <For each={profile()!.skills}>
                    {(skill) => (
                      <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-ktip-ocean-50 text-ktip-ocean-700 border border-ktip-ocean-200">
                        {skill}
                      </span>
                    )}
                  </For>
                </div>
              </Show>

              {/* Joined date */}
              <p class="flex items-center gap-1.5 text-sm text-ktip-sand-400">
                <Calendar size={14} />
                Joined {formatDate(profile()!.created_at)}
              </p>
            </div>

            {/* Tabs */}
            <div class="border-b border-gray-200 mb-6">
              <div class="flex gap-6" role="tablist" aria-label="Profile content">
                <button
                  role="tab"
                  aria-selected={activeTab() === 'projects'}
                  aria-controls="tabpanel-projects"
                  id="tab-projects"
                  class={`pb-3 text-sm font-medium transition-colors flex items-center gap-2 ${
                    activeTab() === 'projects'
                      ? 'border-b-2 border-ktip-ocean-500 text-ktip-ocean-600'
                      : 'text-ktip-sand-600 hover:text-ktip-sand-900'
                  }`}
                  onClick={() => setActiveTab('projects')}
                >
                  <FolderKanban size={18} />
                  Projects ({projects()?.length || 0})
                </button>
                <button
                  role="tab"
                  aria-selected={activeTab() === 'events'}
                  aria-controls="tabpanel-events"
                  id="tab-events"
                  class={`pb-3 text-sm font-medium transition-colors flex items-center gap-2 ${
                    activeTab() === 'events'
                      ? 'border-b-2 border-ktip-ocean-500 text-ktip-ocean-600'
                      : 'text-ktip-sand-600 hover:text-ktip-sand-900'
                  }`}
                  onClick={() => setActiveTab('events')}
                >
                  <Calendar size={18} />
                  Events ({events()?.length || 0})
                </button>
              </div>
            </div>

            {/* Tab Content */}
            <Show when={activeTab() === 'projects'}>
              <div role="tabpanel" id="tabpanel-projects" aria-labelledby="tab-projects">
              <Show
                when={projects()?.length}
                fallback={
                  <div class="text-center py-12">
                    <div class="w-16 h-16 bg-ktip-sand-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <FolderKanban size={32} class="text-ktip-sand-400" />
                    </div>
                    <p class="text-ktip-sand-600">No projects yet.</p>
                  </div>
                }
              >
                <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <For each={projects()}>
                    {(project) => <ProjectCard project={project} />}
                  </For>
                </div>
              </Show>
              </div>
            </Show>

            <Show when={activeTab() === 'events'}>
              <div role="tabpanel" id="tabpanel-events" aria-labelledby="tab-events">
              <Show
                when={events()?.length}
                fallback={
                  <div class="text-center py-12">
                    <div class="w-16 h-16 bg-ktip-sand-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Calendar size={32} class="text-ktip-sand-400" />
                    </div>
                    <p class="text-ktip-sand-600">No events organized yet.</p>
                  </div>
                }
              >
                <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <For each={events()}>
                    {(event) => <EventCard event={event} />}
                  </For>
                </div>
              </Show>
              </div>
            </Show>

            {/* Bottom spacing */}
            <div class="pb-8" />
          </div>

          {/* Edit Profile Modal */}
          <Modal
            open={showEditModal()}
            onClose={() => setShowEditModal(false)}
            title="Edit Profile"
            description="Update your profile information"
            size="lg"
          >
            <form onSubmit={handleSaveProfile} class="space-y-4">
              <Input
                label="Display Name"
                value={editName()}
                onInput={(e) => setEditName(e.currentTarget.value)}
                error={editErrors().display_name}
                fullWidth
              />
              <Textarea
                label="Bio"
                value={editBio()}
                onInput={(e) => setEditBio(e.currentTarget.value)}
                error={editErrors().bio}
                rows={4}
                placeholder="Tell us about yourself..."
                fullWidth
              />
              <div class="flex flex-col gap-1.5 w-full">
                <label class="text-sm font-medium text-ktip-sand-700">Country</label>
                <select
                  value={editCountry()}
                  onChange={(e) => setEditCountry(e.currentTarget.value)}
                  class="w-full border border-ktip-sand-200 rounded-xl px-4 py-3 bg-ktip-sand-50/50 transition-all focus:outline-none focus:ring-2 focus:border-ktip-ocean-500 focus:ring-ktip-ocean-500/20 focus:bg-white"
                >
                  <option value="">Select a country</option>
                  <For each={[...CARIBBEAN_COUNTRIES]}>
                    {(country) => (
                      <option value={country}>{country}</option>
                    )}
                  </For>
                </select>
              </div>
              <Show when={editErrors()._form}>
                <p class="text-sm text-red-600">{editErrors()._form}</p>
              </Show>
              <div class="flex justify-end gap-3 pt-4">
                <Button variant="secondary" onClick={() => setShowEditModal(false)} type="button">
                  Cancel
                </Button>
                <Button type="submit" loading={editLoading()}>
                  Save Changes
                </Button>
              </div>
            </form>
          </Modal>
        </Show>
      </Suspense>
    </MainLayout>
  )
}
