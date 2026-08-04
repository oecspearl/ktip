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
import { TagInput } from '../../components/ui/TagInput'
import { CollabSelect } from '../../components/ui/CollabSelect'
import { IndustrySelect } from '../../components/ui/IndustrySelect'
import { ROLE_BY_SLUG, ROLE_DEFINITIONS } from '../../lib/permissions'
import type { UserRole } from '../../types'
import { DiamondAvatar } from '../../components/ui/DiamondAvatar'
import { BannerStudio } from '../../components/profile/BannerStudio'
import { Trans, useLingui } from '@lingui/react/macro'
import { resolveCopy } from '../../i18n/copy'

const IMAGE_ACCEPT = ['image/*'] as const

/** Roles a user may grant themselves; everything else needs a reviewer. */
const SELF_ASSIGNABLE_SLUGS = new Set<string>(
  ROLE_DEFINITIONS.filter((r) => r.selfAssignable).map((r) => r.slug)
)

export function ProfileSettingsTab() {
    const { t, i18n } = useLingui()
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
  // 082. These three feed the CV — see buildKtipResumeData in api/_lib/cv-build.ts.
  const [phone, setPhone] = useState(auth.profile?.phone || '')
  const [website, setWebsite] = useState(auth.profile?.website || '')
  const [languages, setLanguages] = useState<string[]>(auth.profile?.languages || [])
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
      setPhone(p.phone || '')
      setWebsite(p.website || '')
      setLanguages(p.languages || [])
      setInitialized(true)
    }
  }, [auth.profile, initialized])

  const displayNameValue = displayName || t`User`

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
        toast.error(t`Please select an image file`)
        return
      }
      // Checked before optimization so a huge file is never handed to the decoder.
      if (file.size > 5 * 1024 * 1024) {
        toast.error(t`Image must be less than 5MB`)
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
        toast.success(t`Avatar updated!`)
      } catch (err: any) {
        toast.error(err.message || t`Failed to upload avatar`)
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
      phone: phone || undefined,
      website: website || undefined,
      languages,
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
        phone: phone || null,
        website: website || null,
        languages,
      })
      toast.success(t`Profile updated!`)
    } catch (err: any) {
      toast.error(err.message || t`Failed to update profile`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Avatar Section */}
      <Card id="photo" data-spy="Photo" className="scroll-mt-24">
        <h2 className="text-lg font-display font-bold text-ktip-sand-900 mb-4"><Trans>Profile Photo</Trans></h2>
        <div className="flex items-center gap-6" {...avatarDropProps}>
          {/* The camera lives in the hover scrim rather than a corner chip: a
              diamond has no corner to pin a chip to without it floating off the
              silhouette. The whole label is the drop/click target. */}
          <label className="cursor-pointer">
            <DiamondAvatar
              src={auth.profile?.avatar_url}
              name={displayNameValue || t`You`}
              size={80}
              frameClassName={
                avatarDragging ? 'ring-2 ring-ktip-ocean-400 ring-offset-2' : undefined
              }
              overlay={<Camera size={20} className="text-white" />}
            />
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarUpload}
              disabled={avatarUploading}
            />
          </label>
          <div>
            <p className="text-sm text-ktip-sand-700 font-medium">
              {avatarDragging ? t`Drop photo to upload` : t`Upload a photo`}
            </p>
            <p className="text-xs text-ktip-sand-500 mt-1">
              <Trans>JPG, PNG, GIF or WebP. Max 5MB. Click or drag &amp; drop — large images are resized and optimized automatically.</Trans>
            </p>
            {avatarUploading && (
              <p className="text-xs text-ktip-ocean-600 mt-1"><Trans>Uploading...</Trans></p>
            )}
          </div>
        </div>
      </Card>

      {/* Banner — photo, built-in design or aurora gradient, with live
          previews of every surface that shows it (104). */}
      <BannerStudio />

      {/* Profile Info */}
      <Card id="profile-info" data-spy="Profile" className="scroll-mt-24">
        <h2 className="text-lg font-display font-bold text-ktip-sand-900 mb-4"><Trans>Profile Information</Trans></h2>
        <div className="space-y-4">
          <Input
            label={t`Display Name`}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            error={errors.display_name}
            fullWidth
          />

          <Textarea
            label={t`Bio`}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            error={errors.bio}
            rows={4}
            placeholder={t`Tell us about yourself...`}
            fullWidth
          />

          <Input
            label={t`Organisation`}
            value={organization}
            onChange={(e) => setOrganization(e.target.value)}
            error={errors.organization}
            placeholder={t`Company, university, or institution`}
            fullWidth
          />

          <IndustrySelect value={industry} onChange={setIndustry} />

          {/* Both land on the CV — phone in the contact block, website as the
              "Website" social. Kept here rather than in the CV editor so the
              directory and a public profile can read the same value. */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label={t`Phone`}
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              error={errors.phone}
              placeholder="+1 758 000 0000"
              helperText={t`Shown on your CV. Never shown in the member directory.`}
              fullWidth
            />
            <Input
              label={t`Website`}
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              error={errors.website}
              placeholder="https://example.org"
              fullWidth
            />
          </div>

          <div className="flex flex-col gap-1.5 w-full">
            <label className="text-sm font-medium text-ktip-sand-700"><Trans>Country</Trans></label>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full border border-ktip-sand-200 rounded-xl px-4 py-3 bg-ktip-sand-50/50 transition-all focus:outline-none focus:ring-2 focus:border-ktip-ocean-500 focus:ring-ktip-ocean-500/20 focus:bg-ktip-cream"
            >
              <option value=""><Trans>Select a country</Trans></option>
              {[...CARIBBEAN_COUNTRIES].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Roles */}
      <Card id="roles" data-spy="Roles" className="scroll-mt-24">
        <h2 className="text-lg font-display font-bold text-ktip-sand-900 mb-2"><Trans>Roles</Trans></h2>
        <p className="text-sm text-ktip-sand-600 mb-4"><Trans>Select the roles that describe you. You can choose multiple.</Trans></p>
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
                {resolveCopy(i18n, role.label)}
              </button>
            )
          })}
        </div>

        {verifiedRoles.length > 0 && (
          <div className="mt-4 pt-4 border-t border-ktip-sand-100">
            <p className="text-sm text-ktip-sand-600 mb-2">
              <Trans>Granted by verification. These can only be changed by your institution, your Chamber of Commerce, or an OECS administrator.</Trans>
            </p>
            <div className="flex flex-wrap gap-2">
              {verifiedRoles.map((slug) => (
                <span
                  key={slug}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border-2 border-ktip-tropical-200 bg-ktip-tropical-50 text-sm font-medium text-ktip-tropical-800"
                >
                  <ShieldCheck size={14} />
                  {ROLE_BY_SLUG[slug]?.label ? resolveCopy(i18n, ROLE_BY_SLUG[slug].label) : slug}
                </span>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Skills */}
      <Card id="skills" data-spy="Skills" className="scroll-mt-24">
        <h2 className="text-lg font-display font-bold text-ktip-sand-900 mb-2"><Trans>Skills</Trans></h2>
        <TagInput
          description={t`Add skills to help others find you in the directory.`}
          values={skills}
          onChange={setSkills}
          suggestions={SKILL_SUGGESTIONS}
          max={LIMITS.MAX_SKILLS}
          placeholder={t`Type a skill and press Enter...`}
        />
      </Card>

      {/* Interests */}
      <Card id="interests" data-spy="Interests" className="scroll-mt-24">
        <h2 className="text-lg font-display font-bold text-ktip-sand-900 mb-2"><Trans>Interests</Trans></h2>
        <TagInput
          description={t`Topics you care about — used to surface relevant people and opportunities.`}
          values={interests}
          onChange={setInterests}
          suggestions={INTEREST_SUGGESTIONS}
          max={LIMITS.MAX_INTERESTS}
          placeholder={t`Type an interest and press Enter...`}
        />
      </Card>

      {/* Languages */}
      <Card id="languages" data-spy="Languages" className="scroll-mt-24">
        <h2 className="text-lg font-display font-bold text-ktip-sand-900 mb-2"><Trans>Languages</Trans></h2>
        <TagInput
          description={t`Languages you speak. These appear on your CV — without them it can only guess one from your Virtual Campus locale.`}
          values={languages}
          onChange={setLanguages}
          max={12}
          placeholder={t`Type a language and press Enter...`}
        />
      </Card>

      {/* Openness to Collaborate */}
      <Card id="collaborate" data-spy="Collaborate" className="scroll-mt-24">
        <h2 className="text-lg font-display font-bold text-ktip-sand-900 mb-2"><Trans>Openness to Collaborate</Trans></h2>
        <p className="text-sm text-ktip-sand-600 mb-4"><Trans>Let others know what kinds of collaboration you're open to.</Trans></p>
        <CollabSelect values={openTo} onChange={setOpenTo} />
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} loading={saving} icon={<Save size={18} />}>
          <Trans>Save Changes</Trans>
        </Button>
      </div>
    </div>
  )
}
