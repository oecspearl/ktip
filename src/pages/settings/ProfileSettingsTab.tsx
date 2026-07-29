import { useState, useEffect, useCallback, type ChangeEvent } from 'react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Textarea } from '../../components/ui/Textarea'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { profileUpdateSchema } from '../../lib/validation'
import { useFileDrop } from '../../hooks/useFileDrop'
import { uploadOptimizedImage } from '../../lib/storage-upload'
import {
  Camera,
  Save,
  X,
  Plus,
  ShieldCheck,
} from 'lucide-react'
import {
  CARIBBEAN_COUNTRIES,
  SELECTABLE_ROLES,
  SKILL_SUGGESTIONS,
  INTEREST_SUGGESTIONS,
  LIMITS,
  IMAGE_PRESETS,
} from '../../lib/constants'
import { getInitials, generateAvatarColor } from '../../lib/utils'
import { TagInput } from '../../components/ui/TagInput'
import { CollabSelect } from '../../components/ui/CollabSelect'
import { IndustrySelect } from '../../components/ui/IndustrySelect'
import { ROLE_BY_SLUG, ROLE_DEFINITIONS } from '../../lib/permissions'
import type { UserRole } from '../../types'

const IMAGE_ACCEPT = ['image/*'] as const

/** Roles a user may grant themselves; everything else needs a reviewer. */
const SELF_ASSIGNABLE_SLUGS = new Set<string>(
  ROLE_DEFINITIONS.filter((r) => r.selfAssignable).map((r) => r.slug)
)

export function ProfileSettingsTab() {
  const auth = useAuth()
  const toast = useToast()

  const [displayName, setDisplayName] = useState(auth.profile?.display_name || '')
  const [bio, setBio] = useState(auth.profile?.bio || '')
  const [country, setCountry] = useState(auth.profile?.country || '')
  const [organization, setOrganization] = useState(auth.profile?.organization || '')
  const [industry, setIndustry] = useState(auth.profile?.industry || '')
  const [roles, setRoles] = useState<UserRole[]>(auth.profile?.roles || [])
  const [skills, setSkills] = useState<string[]>(auth.profile?.skills || [])
  const [interests, setInterests] = useState<string[]>(auth.profile?.interests || [])
  const [openTo, setOpenTo] = useState<string[]>(auth.profile?.open_to || [])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [initialized, setInitialized] = useState(false)

  // Sync form fields when profile loads/changes (handles late profile fetch)
  useEffect(() => {
    const p = auth.profile
    if (p && !initialized) {
      setDisplayName(p.display_name || '')
      setBio(p.bio || '')
      setCountry(p.country || '')
      setOrganization(p.organization || '')
      setIndustry(p.industry || '')
      setRoles(p.roles || [])
      setSkills(p.skills || [])
      setInterests(p.interests || [])
      setOpenTo(p.open_to || [])
      setInitialized(true)
    }
  }, [auth.profile, initialized])

  const displayNameValue = displayName || 'User'

  const verifiedRoles = (auth.profile?.roles || []).filter((r) => !SELF_ASSIGNABLE_SLUGS.has(r))

  const toggleRole = (role: UserRole) => {
    if (roles.includes(role)) {
      setRoles(roles.filter((r) => r !== role))
    } else {
      setRoles([...roles, role])
    }
  }

  const handleAvatarFile = useCallback(
    async (file: File) => {
      // Validate file
      if (!file.type.startsWith('image/')) {
        toast.error('Please select an image file')
        return
      }
      // Checked before optimization so a huge file is never handed to the decoder.
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Image must be less than 5MB')
        return
      }

      setAvatarUploading(true)
      try {
        const publicUrl = await uploadOptimizedImage({
          bucket: 'avatars',
          basePath: `${auth.user!.id}/avatar`,
          file,
          preset: IMAGE_PRESETS.AVATAR,
        })

        await auth.updateProfile({ avatar_url: publicUrl } as any)
        toast.success('Avatar updated!')
      } catch (err: any) {
        toast.error(err.message || 'Failed to upload avatar')
      } finally {
        setAvatarUploading(false)
      }
    },
    [auth, toast]
  )

  const handleAvatarUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.target
    const file = input.files?.[0]
    input.value = ''
    if (file) await handleAvatarFile(file)
  }

  const { isDragging: avatarDragging, dropProps: avatarDropProps } = useFileDrop({
    onFiles: (files) => void handleAvatarFile(files[0]),
    accept: IMAGE_ACCEPT,
    disabled: avatarUploading,
  })

  const handleSave = async () => {
    setErrors({})

    const input = {
      display_name: displayName,
      bio: bio || undefined,
      country: country || undefined,
      organization: organization || undefined,
      industry: industry || undefined,
      skills,
      interests,
      open_to: openTo as any,
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
        display_name: displayName,
        bio: bio || null,
        country: country || null,
        organization: organization || null,
        industry: industry || null,
        // Only self-assignable roles are submitted. Verification-gated roles
        // (student, faculty, sme, …) are granted by an institution, a chamber
        // or an admin, and the profiles guard trigger rejects a self-grant —
        // sending the full array here would make every save fail.
        roles: [
          ...(auth.profile?.roles || []).filter((r) => !SELF_ASSIGNABLE_SLUGS.has(r)),
          ...roles.filter((r) => SELF_ASSIGNABLE_SLUGS.has(r)),
        ],
        skills,
        interests,
        open_to: openTo,
      })
      toast.success('Profile updated!')
    } catch (err: any) {
      toast.error(err.message || 'Failed to update profile')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Avatar Section */}
      <Card>
        <h2 className="text-lg font-display font-bold text-ktip-sand-900 mb-4">Profile Photo</h2>
        <div className="flex items-center gap-6" {...avatarDropProps}>
          <div
            className={`relative rounded-full transition-shadow ${avatarDragging ? 'ring-2 ring-ktip-ocean-400 ring-offset-2' : ''}`}
          >
            {auth.profile?.avatar_url ? (
              <img
                src={auth.profile.avatar_url}
                alt="Avatar"
                className="w-20 h-20 rounded-full object-cover"
              />
            ) : (
              <div
                className={`w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold text-white ${generateAvatarColor(displayNameValue)}`}
              >
                {getInitials(displayNameValue)}
              </div>
            )}
            <label className="absolute -bottom-1 -right-1 w-8 h-8 bg-ktip-ocean-500 rounded-full flex items-center justify-center cursor-pointer hover:bg-ktip-ocean-600 transition-colors shadow-soft">
              <Camera size={14} className="text-white" />
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarUpload}
                disabled={avatarUploading}
              />
            </label>
          </div>
          <div>
            <p className="text-sm text-ktip-sand-700 font-medium">
              {avatarDragging ? 'Drop photo to upload' : 'Upload a photo'}
            </p>
            <p className="text-xs text-ktip-sand-500 mt-1">
              JPG, PNG, GIF or WebP. Max 5MB. Click or drag &amp; drop — large images are resized
              and optimized automatically.
            </p>
            {avatarUploading && (
              <p className="text-xs text-ktip-ocean-600 mt-1">Uploading...</p>
            )}
          </div>
        </div>
      </Card>

      {/* Profile Info */}
      <Card>
        <h2 className="text-lg font-display font-bold text-ktip-sand-900 mb-4">Profile Information</h2>
        <div className="space-y-4">
          <Input
            label="Display Name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            error={errors.display_name}
            fullWidth
          />

          <Textarea
            label="Bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            error={errors.bio}
            rows={4}
            placeholder="Tell us about yourself..."
            fullWidth
          />

          <Input
            label="Organisation"
            value={organization}
            onChange={(e) => setOrganization(e.target.value)}
            error={errors.organization}
            placeholder="Company, university, or institution"
            fullWidth
          />

          <IndustrySelect value={industry} onChange={setIndustry} />

          <div className="flex flex-col gap-1.5 w-full">
            <label className="text-sm font-medium text-ktip-sand-700">Country</label>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full border border-ktip-sand-200 rounded-xl px-4 py-3 bg-ktip-sand-50/50 transition-all focus:outline-none focus:ring-2 focus:border-ktip-ocean-500 focus:ring-ktip-ocean-500/20 focus:bg-ktip-cream"
            >
              <option value="">Select a country</option>
              {[...CARIBBEAN_COUNTRIES].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Roles */}
      <Card>
        <h2 className="text-lg font-display font-bold text-ktip-sand-900 mb-2">Roles</h2>
        <p className="text-sm text-ktip-sand-600 mb-4">Select the roles that describe you. You can choose multiple.</p>
        <div className="flex flex-wrap gap-2">
          {SELECTABLE_ROLES.filter((role) => SELF_ASSIGNABLE_SLUGS.has(role.value)).map((role) => {
            const isSelected = roles.includes(role.value)
            return (
              <button
                key={role.value}
                type="button"
                onClick={() => toggleRole(role.value)}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full border-2 text-sm font-medium transition-all ${
                  isSelected
                    ? 'border-ktip-ocean-500 bg-ktip-ocean-50 text-ktip-ocean-700'
                    : 'border-ktip-sand-200 text-ktip-sand-600 hover:border-ktip-ocean-300'
                }`}
              >
                {isSelected ? <X size={14} /> : <Plus size={14} />}
                {role.label}
              </button>
            )
          })}
        </div>

        {verifiedRoles.length > 0 && (
          <div className="mt-4 pt-4 border-t border-ktip-sand-100">
            <p className="text-sm text-ktip-sand-600 mb-2">
              Granted by verification. These can only be changed by your institution, your Chamber
              of Commerce, or an OECS administrator.
            </p>
            <div className="flex flex-wrap gap-2">
              {verifiedRoles.map((slug) => (
                <span
                  key={slug}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border-2 border-ktip-tropical-200 bg-ktip-tropical-50 text-sm font-medium text-ktip-tropical-800"
                >
                  <ShieldCheck size={14} />
                  {ROLE_BY_SLUG[slug]?.label ?? slug}
                </span>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Skills */}
      <Card>
        <h2 className="text-lg font-display font-bold text-ktip-sand-900 mb-2">Skills</h2>
        <TagInput
          description="Add skills to help others find you in the directory."
          values={skills}
          onChange={setSkills}
          suggestions={SKILL_SUGGESTIONS}
          max={LIMITS.MAX_SKILLS}
          placeholder="Type a skill and press Enter..."
        />
      </Card>

      {/* Interests */}
      <Card>
        <h2 className="text-lg font-display font-bold text-ktip-sand-900 mb-2">Interests</h2>
        <TagInput
          description="Topics you care about — used to surface relevant people and opportunities."
          values={interests}
          onChange={setInterests}
          suggestions={INTEREST_SUGGESTIONS}
          max={LIMITS.MAX_INTERESTS}
          placeholder="Type an interest and press Enter..."
        />
      </Card>

      {/* Openness to Collaborate */}
      <Card>
        <h2 className="text-lg font-display font-bold text-ktip-sand-900 mb-2">Openness to Collaborate</h2>
        <p className="text-sm text-ktip-sand-600 mb-4">Let others know what kinds of collaboration you're open to.</p>
        <CollabSelect values={openTo} onChange={setOpenTo} />
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} loading={saving} icon={<Save size={18} />}>
          Save Changes
        </Button>
      </div>
    </div>
  )
}
