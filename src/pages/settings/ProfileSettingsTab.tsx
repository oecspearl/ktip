import { createSignal, createEffect, Show, For } from 'solid-js'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Textarea } from '../../components/ui/Textarea'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { supabase } from '../../lib/supabase'
import { profileUpdateSchema } from '../../lib/validation'
import {
  Camera,
  Save,
  X,
  Plus,
} from 'lucide-solid'
import {
  CARIBBEAN_COUNTRIES,
  ROLE_LABELS,
  SKILL_SUGGESTIONS,
} from '../../lib/constants'
import { getInitials, generateAvatarColor } from '../../lib/utils'
import type { UserRole } from '../../types'

const ALL_ROLES: { value: UserRole; label: string }[] = [
  { value: 'student', label: ROLE_LABELS.student },
  { value: 'mentor', label: ROLE_LABELS.mentor },
  { value: 'investor', label: ROLE_LABELS.investor },
  { value: 'entrepreneur', label: ROLE_LABELS.entrepreneur },
  { value: 'private_sector', label: ROLE_LABELS.private_sector },
]

export function ProfileSettingsTab() {
  const auth = useAuth()
  const toast = useToast()

  const [displayName, setDisplayName] = createSignal(auth.profile()?.display_name || '')
  const [bio, setBio] = createSignal(auth.profile()?.bio || '')
  const [country, setCountry] = createSignal(auth.profile()?.country || '')
  const [roles, setRoles] = createSignal<UserRole[]>(auth.profile()?.roles || [])
  const [skills, setSkills] = createSignal<string[]>(auth.profile()?.skills || [])
  const [skillInput, setSkillInput] = createSignal('')
  const [errors, setErrors] = createSignal<Record<string, string>>({})
  const [saving, setSaving] = createSignal(false)
  const [avatarUploading, setAvatarUploading] = createSignal(false)
  const [initialized, setInitialized] = createSignal(false)

  // Sync form fields when profile loads/changes (handles late profile fetch)
  createEffect(() => {
    const p = auth.profile()
    if (p && !initialized()) {
      setDisplayName(p.display_name || '')
      setBio(p.bio || '')
      setCountry(p.country || '')
      setRoles(p.roles || [])
      setSkills(p.skills || [])
      setInitialized(true)
    }
  })

  const displayNameValue = () => displayName() || 'User'

  const toggleRole = (role: UserRole) => {
    const current = roles()
    if (current.includes(role)) {
      setRoles(current.filter((r) => r !== role))
    } else {
      setRoles([...current, role])
    }
  }

  const handleAvatarUpload = async (e: Event) => {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return

    // Validate file
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB')
      return
    }

    setAvatarUploading(true)
    try {
      const userId = auth.user()!.id
      const fileExt = file.name.split('.').pop()
      const filePath = `${userId}/avatar.${fileExt}`

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true })

      if (uploadError) throw uploadError

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath)

      // Update profile with avatar URL
      await auth.updateProfile({ avatar_url: publicUrl } as any)
      toast.success('Avatar updated!')
    } catch (err: any) {
      toast.error(err.message || 'Failed to upload avatar')
    } finally {
      setAvatarUploading(false)
      input.value = ''
    }
  }

  const handleSave = async () => {
    setErrors({})

    const input = {
      display_name: displayName(),
      bio: bio() || undefined,
      country: country() || undefined,
    }

    const result = profileUpdateSchema.safeParse(input)
    if (!result.success) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of result.error.issues) {
        const field = issue.path[0]?.toString()
        if (field) fieldErrors[field] = issue.message
      }
      setErrors(fieldErrors)
      return
    }

    setSaving(true)
    try {
      await auth.updateProfile({
        display_name: displayName(),
        bio: bio() || null,
        country: country() || null,
        roles: roles() as any,
        skills: skills() as any,
      })
      toast.success('Profile updated!')
    } catch (err: any) {
      toast.error(err.message || 'Failed to update profile')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div class="space-y-6">
      {/* Avatar Section */}
      <Card>
        <h2 class="text-lg font-display font-bold text-ktip-sand-900 mb-4">Profile Photo</h2>
        <div class="flex items-center gap-6">
          <div class="relative">
            <Show
              when={auth.profile()?.avatar_url}
              fallback={
                <div
                  class={`w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold text-white ${generateAvatarColor(displayNameValue())}`}
                >
                  {getInitials(displayNameValue())}
                </div>
              }
            >
              <img
                src={auth.profile()!.avatar_url!}
                alt="Avatar"
                class="w-20 h-20 rounded-full object-cover"
              />
            </Show>
            <label class="absolute -bottom-1 -right-1 w-8 h-8 bg-ktip-ocean-500 rounded-full flex items-center justify-center cursor-pointer hover:bg-ktip-ocean-600 transition-colors shadow-soft">
              <Camera size={14} class="text-white" />
              <input
                type="file"
                accept="image/*"
                class="hidden"
                onChange={handleAvatarUpload}
                disabled={avatarUploading()}
              />
            </label>
          </div>
          <div>
            <p class="text-sm text-ktip-sand-700 font-medium">Upload a photo</p>
            <p class="text-xs text-ktip-sand-500 mt-1">JPG, PNG or GIF. Max 5MB.</p>
            <Show when={avatarUploading()}>
              <p class="text-xs text-ktip-ocean-600 mt-1">Uploading...</p>
            </Show>
          </div>
        </div>
      </Card>

      {/* Profile Info */}
      <Card>
        <h2 class="text-lg font-display font-bold text-ktip-sand-900 mb-4">Profile Information</h2>
        <div class="space-y-4">
          <Input
            label="Display Name"
            value={displayName()}
            onInput={(e) => setDisplayName(e.currentTarget.value)}
            error={errors().display_name}
            fullWidth
          />

          <Textarea
            label="Bio"
            value={bio()}
            onInput={(e) => setBio(e.currentTarget.value)}
            error={errors().bio}
            rows={4}
            placeholder="Tell us about yourself..."
            fullWidth
          />

          <div class="flex flex-col gap-1.5 w-full">
            <label class="text-sm font-medium text-ktip-sand-700">Country</label>
            <select
              value={country()}
              onChange={(e) => setCountry(e.currentTarget.value)}
              class="w-full border border-ktip-sand-200 rounded-xl px-4 py-3 bg-ktip-sand-50/50 transition-all focus:outline-none focus:ring-2 focus:border-ktip-ocean-500 focus:ring-ktip-ocean-500/20 focus:bg-white"
            >
              <option value="">Select a country</option>
              <For each={[...CARIBBEAN_COUNTRIES]}>
                {(c) => <option value={c}>{c}</option>}
              </For>
            </select>
          </div>
        </div>
      </Card>

      {/* Roles */}
      <Card>
        <h2 class="text-lg font-display font-bold text-ktip-sand-900 mb-2">Roles</h2>
        <p class="text-sm text-ktip-sand-600 mb-4">Select the roles that describe you. You can choose multiple.</p>
        <div class="flex flex-wrap gap-2">
          <For each={ALL_ROLES}>
            {(role) => {
              const isSelected = () => roles().includes(role.value)
              return (
                <button
                  type="button"
                  onClick={() => toggleRole(role.value)}
                  class={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full border-2 text-sm font-medium transition-all ${
                    isSelected()
                      ? 'border-ktip-ocean-500 bg-ktip-ocean-50 text-ktip-ocean-700'
                      : 'border-ktip-sand-200 text-ktip-sand-600 hover:border-ktip-ocean-300'
                  }`}
                >
                  <Show when={isSelected()} fallback={<Plus size={14} />}>
                    <X size={14} />
                  </Show>
                  {role.label}
                </button>
              )
            }}
          </For>
        </div>
      </Card>

      {/* Skills */}
      <Card>
        <h2 class="text-lg font-display font-bold text-ktip-sand-900 mb-2">Skills</h2>
        <p class="text-sm text-ktip-sand-600 mb-4">Add skills to help others find you in the directory.</p>

        {/* Current skills */}
        <Show when={skills().length > 0}>
          <div class="flex flex-wrap gap-2 mb-4">
            <For each={skills()}>
              {(skill) => (
                <span class="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium bg-ktip-ocean-50 text-ktip-ocean-700 border border-ktip-ocean-200">
                  {skill}
                  <button
                    type="button"
                    onClick={() => setSkills(skills().filter((s) => s !== skill))}
                    class="ml-0.5 hover:text-red-600 transition-colors"
                  >
                    <X size={14} />
                  </button>
                </span>
              )}
            </For>
          </div>
        </Show>

        {/* Add skill input */}
        <div class="flex gap-2 mb-3">
          <input
            type="text"
            value={skillInput()}
            onInput={(e) => setSkillInput(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                const val = skillInput().trim()
                if (val && !skills().includes(val)) {
                  setSkills([...skills(), val])
                  setSkillInput('')
                }
              }
            }}
            placeholder="Type a skill and press Enter..."
            class="flex-1 border border-ktip-sand-200 rounded-xl px-4 py-2.5 bg-ktip-sand-50/50 transition-all focus:outline-none focus:ring-2 focus:border-ktip-ocean-500 focus:ring-ktip-ocean-500/20 focus:bg-white text-sm"
          />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            icon={<Plus size={14} />}
            onClick={() => {
              const val = skillInput().trim()
              if (val && !skills().includes(val)) {
                setSkills([...skills(), val])
                setSkillInput('')
              }
            }}
          >
            Add
          </Button>
        </div>

        {/* Suggestions */}
        <div class="flex flex-wrap gap-1.5">
          <For each={SKILL_SUGGESTIONS.filter((s) => !skills().includes(s)).slice(0, 12)}>
            {(suggestion) => (
              <button
                type="button"
                onClick={() => setSkills([...skills(), suggestion])}
                class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border border-ktip-sand-200 text-ktip-sand-600 hover:border-ktip-ocean-300 hover:text-ktip-ocean-700 hover:bg-ktip-ocean-50 transition-all"
              >
                <Plus size={12} />
                {suggestion}
              </button>
            )}
          </For>
        </div>
      </Card>

      {/* Save Button */}
      <div class="flex justify-end">
        <Button onClick={handleSave} loading={saving()} icon={<Save size={18} />}>
          Save Changes
        </Button>
      </div>
    </div>
  )
}
