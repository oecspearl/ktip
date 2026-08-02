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
import { User, CheckCircle, ArrowLeft, ArrowRight, Building2, Clock, GraduationCap } from 'lucide-react'
import {
  APP_FULL_NAME,
  CARIBBEAN_COUNTRIES,
  SKILL_SUGGESTIONS,
  INTEREST_SUGGESTIONS,
  LIMITS,
  VERIFICATION_GATED_ROLES,
} from '../../lib/constants'
import { analytics } from '../../hooks/useAnalytics'
import { AuthSplitShell } from '../../components/auth/AuthSplitShell'
import { RolePicker } from '../../components/auth/RolePicker'
import { usePageTitle } from '../../hooks/usePageTitle'
import { useRequestStudentVerification } from '../../hooks/useInstitutions'
import type { UserRole } from '../../types'
import { DiamondAvatar } from '../../components/ui/DiamondAvatar'

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
  // Set once a verification-gated role has been queued with the school. The
  // account genuinely has no role until an educator approves, so this replaces
  // the wizard rather than navigating away — there is nowhere to navigate to.
  const [awaitingSchool, setAwaitingSchool] = useState<string | null>(null)
  const prefilled = useRef(false)
  const submitted = useRef(false)

  const { requestVerification } = useRequestStudentVerification()

  // Pre-fill from the OAuth-created profile once it loads
  useEffect(() => {
    if (prefilled.current || !auth.profile) return
    prefilled.current = true
    setDisplayName(auth.profile.display_name || '')
    setOrganization(auth.profile.organization || '')
    setIndustry(auth.profile.industry || '')
    setCountry(auth.profile.country || '')
    setBio(auth.profile.bio || '')
    // Email signup already asked for a role. A verification-gated one never
    // reaches profiles.roles — the insert guard strips it — but it is still on
    // the auth user's metadata, so the answer is carried over rather than
    // asking a student to pick twice.
    const intended = auth.user?.user_metadata?.role
    if (typeof intended === 'string' && intended) setSelectedRole(intended)
  }, [auth.profile, auth.user])

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

    // Student and Faculty are granted by a school, never written from here.
    // Sending them would raise in the 063 guard trigger and strand the account,
    // so the profile is saved without a role and the school is asked instead.
    const needsSchool = VERIFICATION_GATED_ROLES.has(selectedRole)

    setPending(true)
    setErrorMessage('')
    submitted.current = true
    try {
      await auth.updateProfile({
        display_name: displayName.trim(),
        ...(needsSchool ? {} : { roles: [selectedRole as UserRole] }),
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

      if (needsSchool) {
        // Only students have a self-serve request: request_student_verification()
        // matches the account's email domain against a verified institution.
        // Faculty is assigned by an institution admin from their side, so there
        // is nothing to call — we say so rather than pretending to queue it.
        if (selectedRole === 'student') {
          await requestVerification()
        }
        analytics.funnel('onboarding', 'verification_requested', { role: selectedRole })
        setAwaitingSchool(selectedRole)
        return
      }

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

  /** Back out of the pending state to pick a role that needs no approval. */
  const chooseDifferentRole = () => {
    setAwaitingSchool(null)
    setSelectedRole('')
    setErrorMessage('')
    submitted.current = false
    setStep(1)
  }

  // Waiting on a school. Deliberately terminal rather than a redirect: the
  // account holds no role yet, so ProtectedRoute would send it straight back
  // here. Saying so plainly beats a redirect loop.
  if (awaitingSchool) {
    const isStudent = awaitingSchool === 'student'
    return (
      <AuthSplitShell
        step={1}
        steps={STEPS}
        heading={isStudent ? 'Waiting on your school' : 'Your institution adds you'}
        subheading={APP_FULL_NAME}
        heroOffset={3}
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-ktip-ocean-200 bg-ktip-ocean-50 px-4 py-3">
            {isStudent ? (
              <Clock size={18} className="mt-0.5 flex-shrink-0 text-ktip-ocean-600" />
            ) : (
              <GraduationCap size={18} className="mt-0.5 flex-shrink-0 text-ktip-ocean-600" />
            )}
            <div className="text-sm text-ktip-sand-700">
              {isStudent ? (
                <>
                  <p className="font-medium text-ktip-sand-900">Your request has been sent.</p>
                  <p className="mt-1">
                    We matched <strong>{auth.user?.email}</strong> to your institution. An educator
                    there approves it, and that approval is what turns on your student account.
                    You will get an email when it happens.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-medium text-ktip-sand-900">
                    Faculty accounts are set up by your institution.
                  </p>
                  <p className="mt-1">
                    Ask the KTIP administrator at your school or university to add{' '}
                    <strong>{auth.user?.email}</strong> as an educator. Once they do, your faculty
                    account is ready.
                  </p>
                </>
              )}
            </div>
          </div>

          <p className="text-sm text-ktip-sand-600">
            Your profile is saved either way. If you would rather start using KTIP now, pick a role
            that needs no approval — you can still verify with your school later from Settings.
          </p>

          <Button type="button" variant="secondary" fullWidth onClick={chooseDifferentRole}>
            Choose a different role
          </Button>
        </div>
      </AuthSplitShell>
    )
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
              <DiamondAvatar
                src={auth.profile?.avatar_url}
                name={auth.profile?.display_name || auth.user?.email || 'You'}
                size={56}
                colorClass="bg-ktip-ocean-100"
                frameClassName="border-2 border-ktip-ocean-200"
                icon={
                  auth.profile?.display_name ? undefined : (
                    <User size={20} className="text-ktip-ocean-500" />
                  )
                }
              />
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
