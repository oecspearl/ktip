import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Textarea } from '../../components/ui/Textarea'
import { TagInput } from '../../components/ui/TagInput'
import { CollabSelect } from '../../components/ui/CollabSelect'
import { IndustrySelect } from '../../components/ui/IndustrySelect'
import { User, CheckCircle, ArrowLeft, ArrowRight, Building2 } from 'lucide-react'
import {
  APP_FULL_NAME,
  CARIBBEAN_COUNTRIES,
  SKILL_SUGGESTIONS,
  INTEREST_SUGGESTIONS,
  LIMITS,
} from '../../lib/constants'
import { analytics } from '../../hooks/useAnalytics'
import { AuthSplitShell } from '../../components/auth/AuthSplitShell'
import { RolePicker } from '../../components/auth/RolePicker'
import { usePageTitle } from '../../hooks/usePageTitle'
import type { UserRole } from '../../types'

const STEPS = [
  { title: 'About You', caption: 'Almost there — set up your KTIP profile.' },
  { title: 'Skills & Collaboration', caption: 'Find collaborators. Build what’s next.' },
]

const HEADINGS = ['Complete your profile', 'Skills & collaboration']

/**
 * Post-OAuth profile completion. Name and avatar are pre-filled from the
 * Google/Microsoft account; the user picks a role (required) and can fill
 * the same optional fields as the email signup wizard.
 */
export default function OnboardingPage() {
  usePageTitle('Complete Your Profile')
  const auth = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const [step, setStep] = useState(1)

  const [displayName, setDisplayName] = useState('')
  const [selectedRole, setSelectedRole] = useState('')
  const [organization, setOrganization] = useState('')
  const [industry, setIndustry] = useState('')
  const [country, setCountry] = useState('')
  const [bio, setBio] = useState('')
  const [skills, setSkills] = useState<string[]>([])
  const [interests, setInterests] = useState<string[]>([])
  const [openTo, setOpenTo] = useState<string[]>([])

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [errorMessage, setErrorMessage] = useState('')
  const [pending, setPending] = useState(false)
  const prefilled = useRef(false)
  const submitted = useRef(false)

  // Pre-fill from the OAuth-created profile once it loads
  useEffect(() => {
    if (prefilled.current || !auth.profile) return
    prefilled.current = true
    setDisplayName(auth.profile.display_name || '')
    setOrganization(auth.profile.organization || '')
    setIndustry(auth.profile.industry || '')
    setCountry(auth.profile.country || '')
    setBio(auth.profile.bio || '')
  }, [auth.profile])

  if (!auth.loading && !auth.user) {
    return <Navigate to="/login" replace />
  }

  // Already onboarded (role set) and not mid-submit — nothing to do here
  if (auth.profile && auth.profile.roles.length > 0 && !submitted.current) {
    return <Navigate to="/" replace />
  }

  const validateStep1 = (): boolean => {
    const fieldErrors: Record<string, string> = {}
    if (!displayName.trim()) fieldErrors.display_name = 'Display name is required'
    if (!selectedRole) fieldErrors.role = 'Please select a role'
    setErrors(fieldErrors)
    return Object.keys(fieldErrors).length === 0
  }

  const goNext = () => {
    if (!validateStep1()) return
    analytics.funnel('onboarding', 'step_1_complete', { role: selectedRole })
    setStep(2)
  }

  const saveProfile = async (includeStep2: boolean) => {
    if (!validateStep1()) {
      setStep(1)
      return
    }
    setPending(true)
    setErrorMessage('')
    submitted.current = true
    try {
      await auth.updateProfile({
        display_name: displayName.trim(),
        roles: [selectedRole as UserRole],
        organization: organization.trim() || null,
        industry: industry.trim() || null,
        country: country || null,
        bio: bio.trim() || null,
        ...(includeStep2 && {
          skills,
          interests,
          open_to: openTo,
        }),
      })
      analytics.conversion('onboarding_complete', { role: selectedRole })
      toast.success('Welcome to KTIP!')
      navigate('/', { replace: true })
    } catch (error: any) {
      submitted.current = false
      setErrorMessage(error.message || 'Failed to save your profile. Please try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthSplitShell
      step={step}
      steps={STEPS}
      heading={HEADINGS[step - 1]}
      subheading={step === 1 ? APP_FULL_NAME : undefined}
      heroOffset={3}
    >
      {errorMessage && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm mb-5">
            {errorMessage}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              {auth.profile?.avatar_url ? (
                <img
                  src={auth.profile.avatar_url}
                  alt="Your avatar"
                  referrerPolicy="no-referrer"
                  className="w-14 h-14 rounded-full object-cover border-2 border-ktip-ocean-200"
                />
              ) : (
                <div className="w-14 h-14 rounded-full bg-ktip-ocean-100 flex items-center justify-center">
                  <User size={24} className="text-ktip-ocean-500" />
                </div>
              )}
              <p className="text-sm text-ktip-sand-600">
                Signed in as <strong className="text-ktip-sand-800">{auth.user?.email}</strong>.
                We pre-filled your details from your account — review and finish up below.
              </p>
            </div>

            <Input
              type="text"
              label="Display Name"
              placeholder="Enter your full name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              error={errors.display_name}
              icon={<User size={20} />}
              fullWidth
              required
            />

            <RolePicker
              value={selectedRole}
              onChange={(value) => {
                setSelectedRole(value)
                setErrors((prev) => {
                  const next = { ...prev }
                  delete next.role
                  return next
                })
              }}
              error={errors.role}
            />

            <Input
              type="text"
              label="Organisation"
              placeholder="Company, university, or institution"
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              icon={<Building2 size={20} />}
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

            <Textarea
              label="Bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              helperText={`${bio.length}/${LIMITS.MAX_BIO_LENGTH} characters`}
              rows={3}
              maxLength={LIMITS.MAX_BIO_LENGTH}
              placeholder="Tell us about yourself..."
              fullWidth
            />

            <Button type="button" fullWidth onClick={goNext} icon={<ArrowRight size={20} />}>
              Next
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-ktip-sand-600 -mt-1">
              Help others find and collaborate with you. Optional — editable later in Settings.
            </p>

            <TagInput
              label="Skills"
              values={skills}
              onChange={setSkills}
              suggestions={SKILL_SUGGESTIONS}
              max={LIMITS.MAX_SKILLS}
              placeholder="Type a skill and press Enter..."
            />

            <TagInput
              label="Interests"
              values={interests}
              onChange={setInterests}
              suggestions={INTEREST_SUGGESTIONS}
              max={LIMITS.MAX_INTERESTS}
              placeholder="Type an interest and press Enter..."
            />

            <div>
              <label className="block text-sm font-medium text-ktip-sand-700 mb-2">
                Openness to Collaborate
              </label>
              <CollabSelect values={openTo} onChange={setOpenTo} />
            </div>

            <div className="flex gap-3">
              <Button type="button" variant="secondary" onClick={() => setStep(1)} icon={<ArrowLeft size={18} />}>
                Back
              </Button>
              <Button
                type="button"
                fullWidth
                loading={pending}
                onClick={() => saveProfile(true)}
                icon={<CheckCircle size={20} />}
              >
                Finish
              </Button>
            </div>
            <button
              type="button"
              onClick={() => saveProfile(false)}
              disabled={pending}
              className="w-full text-center text-sm text-ktip-sand-500 hover:text-ktip-ocean-600 transition-colors"
            >
              Skip for now
            </button>
          </div>
        )}
    </AuthSplitShell>
  )
}
