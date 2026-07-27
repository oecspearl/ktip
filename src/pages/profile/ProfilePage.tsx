import { useState, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Textarea } from '../../components/ui/Textarea'
import { Modal } from '../../components/ui/Modal'
import { ProjectCard } from '../../components/projects/ProjectCard'
import { EventCard } from '../../components/events/EventCard'
import { useProfile, useUserProjects, useUserEvents } from '../../hooks/useProfile'
import { useAuth } from '../../contexts/AuthContext'
import { useUserBadges } from '../../hooks/useBadges'
import { useMyConnections, useConnectionMutations } from '../../hooks/useConnections'
import { ConnectButton } from '../../components/directory/ConnectButton'
import { AchievementBadge } from '../../components/ui/AchievementBadge'
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
  Users,
  UserX,
} from 'lucide-react'
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

  const resolvedId = useMemo(() => {
    if (!params.id || params.id === 'me') return auth.user?.id
    return params.id
  }, [params.id, auth.user?.id])

  const { profile, loading: profileLoading, refetch: refetchProfile } = useProfile(resolvedId)
  const { projects } = useUserProjects(resolvedId)
  const { events } = useUserEvents(resolvedId)

  usePageTitle(profile?.display_name ? `${profile.display_name}'s Profile` : 'Profile')

  const isOwnProfile = resolvedId === auth.user?.id

  const { badges } = useUserBadges(resolvedId)
  const { connections } = useMyConnections(isOwnProfile ? resolvedId : undefined)
  const { removeConnection } = useConnectionMutations()

  const [activeTab, setActiveTab] = useState<'projects' | 'events' | 'connections'>('projects')
  const [showEditModal, setShowEditModal] = useState(false)

  // Edit form state
  const [editName, setEditName] = useState('')
  const [editBio, setEditBio] = useState('')
  const [editCountry, setEditCountry] = useState('')
  const [editErrors, setEditErrors] = useState<Record<string, string>>({})
  const [editLoading, setEditLoading] = useState(false)

  const openEditModal = () => {
    const p = profile
    if (p) {
      setEditName(p.display_name || '')
      setEditBio(p.bio || '')
      setEditCountry(p.country || '')
      setEditErrors({})
    }
    setShowEditModal(true)
  }

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setEditErrors({})

    const input = {
      display_name: editName,
      bio: editBio || undefined,
      country: editCountry || undefined,
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
        display_name: editName,
        bio: editBio || null,
        country: editCountry || null,
      })
      setShowEditModal(false)
      refetchProfile()
    } catch (err: any) {
      setEditErrors({ _form: err.message || 'Failed to update profile' })
    } finally {
      setEditLoading(false)
    }
  }

  const displayName = profile?.display_name || 'Unknown User'

  if (!profileLoading && !profile) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <div className="w-16 h-16 bg-ktip-sand-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <User size={32} className="text-ktip-sand-400" />
        </div>
        <h2 className="text-2xl font-display font-bold text-ktip-sand-900 mb-2">
          Profile not found
        </h2>
        <p className="text-ktip-sand-600 mb-6">
          This user doesn't exist or their profile is unavailable.
        </p>
        <Button onClick={() => navigate('/')}>
          Back to Home
        </Button>
      </div>
    )
  }

  if (profileLoading || !profile) {
    return <div className="bg-gray-800 min-h-[180px] animate-pulse-soft" />
  }

  return (
    <>
      {/* Dark Hero */}
      <div className="bg-gray-800 min-h-[180px] relative">
        <div className="container mx-auto px-4 pt-6 pb-16">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-sm text-gray-400 mb-6">
            <Link to="/" className="hover:text-white transition-colors">Home</Link>
            <ChevronRight size={14} className="text-gray-500" />
            <span className="text-gray-400">Profile</span>
            <ChevronRight size={14} className="text-gray-500" />
            <span className="text-gray-200">{displayName}</span>
          </nav>

          <div className="flex flex-col md:flex-row items-start gap-6">
            {/* Avatar */}
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={displayName}
                className="w-24 h-24 rounded-full object-cover shrink-0 ring-4 ring-gray-700"
              />
            ) : (
              <div
                className={`w-24 h-24 rounded-full flex items-center justify-center text-3xl font-bold text-white shrink-0 ring-4 ring-gray-700 ${generateAvatarColor(displayName)}`}
              >
                {getInitials(displayName)}
              </div>
            )}

            {/* Name + Country */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1 flex-wrap">
                <h1 className="text-3xl font-display font-bold text-white">
                  {displayName}
                </h1>
                {profile.is_verified && (
                  <span className="flex items-center gap-1 text-ktip-ocean-400" title="Verified">
                    <CheckCircle size={20} />
                  </span>
                )}
              </div>

              {profile.country && (
                <p className="flex items-center gap-1.5 text-gray-300">
                  <MapPin size={16} />
                  {profile.country}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 shrink-0">
              {isOwnProfile && (
                <Button variant="outline" icon={<Edit size={18} />} onClick={openEditModal} className="border-gray-500 text-white hover:bg-gray-700">
                  Edit Profile
                </Button>
              )}
              {!isOwnProfile && (
                <>
                  <ConnectButton otherUserId={profile.id} />
                  <Link to={`/messages?user=${profile.id}`}>
                    <Button variant="outline" icon={<MessageSquare size={18} />} className="border-gray-500 text-white hover:bg-gray-700">
                      Send Message
                    </Button>
                  </Link>
                  <Link to={`/grievances/report/${profile.id}`}>
                    <Button variant="ghost" icon={<Flag size={18} />} className="text-gray-400 hover:bg-red-500/10 hover:text-red-400">
                      Report
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* White Content Below */}
      <div className="container mx-auto px-4 -mt-4">
        {/* Profile Info Section */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-8">
          {/* Role Badges */}
          {profile.roles?.length ? (
            <div className="flex flex-wrap gap-2 mb-3">
              {profile.roles.map((role) => (
                <Badge key={role} className={ROLE_COLORS[role]}>
                  {ROLE_LABELS[role] || role}
                </Badge>
              ))}
            </div>
          ) : null}

          {/* Achievement Badges */}
          {badges?.length ? (
            <div className="flex flex-wrap gap-2 mb-3">
              {badges.map((userBadge) => (
                <AchievementBadge key={userBadge.id} userBadge={userBadge} />
              ))}
            </div>
          ) : null}

          {/* Bio */}
          {profile.bio && (
            <p className="text-ktip-sand-700 whitespace-pre-wrap mb-3">
              {profile.bio}
            </p>
          )}

          {/* Skills */}
          {profile.skills?.length ? (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {profile.skills.map((skill) => (
                <span key={skill} className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-ktip-ocean-50 text-ktip-ocean-700 border border-ktip-ocean-200">
                  {skill}
                </span>
              ))}
            </div>
          ) : null}

          {/* Joined date */}
          <p className="flex items-center gap-1.5 text-sm text-ktip-sand-400">
            <Calendar size={14} />
            Joined {formatDate(profile.created_at)}
          </p>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <div className="flex gap-6" role="tablist" aria-label="Profile content">
            <button
              role="tab"
              aria-selected={activeTab === 'projects'}
              aria-controls="tabpanel-projects"
              id="tab-projects"
              className={`pb-3 text-sm font-medium transition-colors flex items-center gap-2 ${
                activeTab === 'projects'
                  ? 'border-b-2 border-ktip-ocean-500 text-ktip-ocean-600'
                  : 'text-ktip-sand-600 hover:text-ktip-sand-900'
              }`}
              onClick={() => setActiveTab('projects')}
            >
              <FolderKanban size={18} />
              Projects ({projects?.length || 0})
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'events'}
              aria-controls="tabpanel-events"
              id="tab-events"
              className={`pb-3 text-sm font-medium transition-colors flex items-center gap-2 ${
                activeTab === 'events'
                  ? 'border-b-2 border-ktip-ocean-500 text-ktip-ocean-600'
                  : 'text-ktip-sand-600 hover:text-ktip-sand-900'
              }`}
              onClick={() => setActiveTab('events')}
            >
              <Calendar size={18} />
              Events ({events?.length || 0})
            </button>
            {isOwnProfile && (
              <button
                role="tab"
                aria-selected={activeTab === 'connections'}
                aria-controls="tabpanel-connections"
                id="tab-connections"
                className={`pb-3 text-sm font-medium transition-colors flex items-center gap-2 ${
                  activeTab === 'connections'
                    ? 'border-b-2 border-ktip-ocean-500 text-ktip-ocean-600'
                    : 'text-ktip-sand-600 hover:text-ktip-sand-900'
                }`}
                onClick={() => setActiveTab('connections')}
              >
                <Users size={18} />
                Connections ({connections?.length || 0})
              </button>
            )}
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'projects' && (
          <div role="tabpanel" id="tabpanel-projects" aria-labelledby="tab-projects">
            {projects?.length ? (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {projects.map((project) => (
                  <ProjectCard key={project.id} project={project} />
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-ktip-sand-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FolderKanban size={32} className="text-ktip-sand-400" />
                </div>
                <p className="text-ktip-sand-600">No projects yet.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'events' && (
          <div role="tabpanel" id="tabpanel-events" aria-labelledby="tab-events">
            {events?.length ? (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {events.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-ktip-sand-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Calendar size={32} className="text-ktip-sand-400" />
                </div>
                <p className="text-ktip-sand-600">No events organized yet.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'connections' && isOwnProfile && (
          <div role="tabpanel" id="tabpanel-connections" aria-labelledby="tab-connections">
            {connections?.length ? (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {connections.map((connection) => {
                  const other =
                    connection.requester_id === auth.user?.id
                      ? connection.addressee
                      : connection.requester
                  const otherId =
                    connection.requester_id === auth.user?.id
                      ? connection.addressee_id
                      : connection.requester_id
                  const otherName = other?.display_name || 'Unknown User'
                  return (
                    <div
                      key={connection.id}
                      className="flex items-center justify-between gap-3 bg-white border border-gray-200 rounded-lg p-4"
                    >
                      <Link to={`/profile/${otherId}`} className="flex items-center gap-3 min-w-0 group">
                        {other?.avatar_url ? (
                          <img
                            src={other.avatar_url}
                            alt={otherName}
                            className="w-11 h-11 rounded-full object-cover shrink-0"
                          />
                        ) : (
                          <div
                            className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 ${generateAvatarColor(otherName)}`}
                          >
                            {getInitials(otherName)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-ktip-sand-900 truncate group-hover:text-ktip-ocean-600 transition-colors">
                            {otherName}
                          </p>
                          {other?.country && (
                            <p className="text-xs text-gray-500 truncate">{other.country}</p>
                          )}
                        </div>
                      </Link>
                      <button
                        onClick={() => removeConnection(connection.id)}
                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                        aria-label={`Remove connection with ${otherName}`}
                        title="Remove connection"
                      >
                        <UserX size={16} />
                      </button>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-ktip-sand-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Users size={32} className="text-ktip-sand-400" />
                </div>
                <p className="text-ktip-sand-600 mb-2">No connections yet.</p>
                <Link to="/directory" className="text-sm text-ktip-ocean-600 hover:underline">
                  Browse the member directory
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Bottom spacing */}
        <div className="pb-8" />
      </div>

      {/* Edit Profile Modal */}
      <Modal
        open={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Edit Profile"
        description="Update your profile information"
        size="lg"
      >
        <form onSubmit={handleSaveProfile} className="space-y-4">
          <Input
            label="Display Name"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            error={editErrors.display_name}
            fullWidth
          />
          <Textarea
            label="Bio"
            value={editBio}
            onChange={(e) => setEditBio(e.target.value)}
            error={editErrors.bio}
            rows={4}
            placeholder="Tell us about yourself..."
            fullWidth
          />
          <div className="flex flex-col gap-1.5 w-full">
            <label className="text-sm font-medium text-ktip-sand-700">Country</label>
            <select
              value={editCountry}
              onChange={(e) => setEditCountry(e.target.value)}
              className="w-full border border-ktip-sand-200 rounded-xl px-4 py-3 bg-ktip-sand-50/50 transition-all focus:outline-none focus:ring-2 focus:border-ktip-ocean-500 focus:ring-ktip-ocean-500/20 focus:bg-white"
            >
              <option value="">Select a country</option>
              {[...CARIBBEAN_COUNTRIES].map((country) => (
                <option key={country} value={country}>{country}</option>
              ))}
            </select>
          </div>
          {editErrors._form && (
            <p className="text-sm text-red-600">{editErrors._form}</p>
          )}
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" onClick={() => setShowEditModal(false)} type="button">
              Cancel
            </Button>
            <Button type="submit" loading={editLoading}>
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
