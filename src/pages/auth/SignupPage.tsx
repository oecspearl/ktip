import { useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../../contexts/AuthContext'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Textarea } from '../../components/ui/Textarea'
import { TagInput } from '../../components/ui/TagInput'
import { CollabSelect } from '../../components/ui/CollabSelect'
import { IndustrySelect } from '../../components/ui/IndustrySelect'
import { PasswordChecklist } from '../../components/ui/PasswordChecklist'
import { Mail, Lock, User, UserPlus, CheckCircle, ArrowLeft, ArrowRight, Building2 } from 'lucide-react'
import { signupSchema, signupStep1Schema } from '../../lib/validation'
import {
  APP_FULL_NAME,
  SELECTABLE_ROLES,
  CARIBBEAN_COUNTRIES,
  SKILL_SUGGESTIONS,
  INTEREST_SUGGESTIONS,
  LIMITS,
} from '../../lib/constants'
import { analytics } from '../../hooks/useAnalytics'

const STEPS = [
  { number: 1, title: 'Account' },
  { number: 2, title: 'About You' },
  { number: 3, title: 'Skills & Collaboration' },
] as const

export default function SignupPage() {
  const auth = useAuth()

  const [step, setStep] = useState(1)

  // Step 1 — required account fields
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [selectedRole, setSelectedRole] = useState('')

  // Step 2 — optional
  const [organization, setOrganization] = useState('')
  const [industry, setIndustry] = useState('')
  const [country, setCountry] = useState('')
  const [bio, setBio] = useState('')

  // Step 3 — optional
  const [skills, setSkills] = useState<string[]>([])
  const [interests, setInterests] = useState<string[]>([])
  const [openTo, setOpenTo] = useState<string[]>([])

  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [errorMessage, setErrorMessage] = useState('')
  const [emailSent, setEmailSent] = useState(false)
  const [pending, setPending] = useState(false)

  const markTouched = (field: string) => setTouched((t) => ({ ...t, [field]: true }))

  const step1Values = {
    display_name: displayName,
    email,
    password,
    role: selectedRole,
  }

  // Validate step 1; returns field errors keyed by field name
  const validateStep1 = (): Record<string, string> => {
    const result = signupStep1Schema.safeParse(step1Values)
    if (result.success) return {}
    const fieldErrors: Record<string, string> = {}
    result.error.issues.forEach((issue) => {
      const field = issue.path[0]?.toString()
      if (field && !fieldErrors[field]) fieldErrors[field] = issue.message
    })
    return fieldErrors
  }

  // Live per-field error shown only once the field is touched
  const visibleError = (field: string): string | undefined =>
    touched[field] ? errors[field] : undefined

  const handleBlur = (field: string) => {
    markTouched(field)
    setErrors(validateStep1())
  }

  const goNext = () => {
    if (step === 1) {
      const fieldErrors = validateStep1()
      setErrors(fieldErrors)
      if (Object.keys(fieldErrors).length > 0) {
        setTouched({ display_name: true, email: true, password: true, role: true })
        return
      }
      analytics.funnel('signup', 'step_1_complete', { role: selectedRole })
    }
    if (step === 2) {
      analytics.funnel('signup', 'step_2_complete')
    }
    setStep(step + 1)
  }

  const handleSubmit = async () => {
    const input = {
      ...step1Values,
      organization: organization.trim() || undefined,
      industry: industry.trim() || undefined,
      country: country || undefined,
      bio: bio.trim() || undefined,
      skills: skills.length > 0 ? skills : undefined,
      interests: interests.length > 0 ? interests : undefined,
      open_to: openTo.length > 0 ? openTo : undefined,
    }

    const result = signupSchema.safeParse(input)
    if (!result.success) {
      const fieldErrors: Record<string, string> = {}
      result.error.issues.forEach((issue) => {
        const field = issue.path[0]?.toString()
        if (field && !fieldErrors[field]) fieldErrors[field] = issue.message
      })
      setErrors(fieldErrors)
      // Required-field errors live on step 1 — jump back so user sees them
      if (fieldErrors.display_name || fieldErrors.email || fieldErrors.password || fieldErrors.role) {
        setTouched({ display_name: true, email: true, password: true, role: true })
        setStep(1)
      }
      return
    }

    setPending(true)
    setErrorMessage('')
    try {
      await auth.signUp(email, password, {
        display_name: displayName,
        role: selectedRole,
        ...(input.organization && { organization: input.organization }),
        ...(input.industry && { industry: input.industry }),
        ...(input.country && { country: input.country }),
        ...(input.bio && { bio: input.bio }),
        ...(input.skills && { skills: input.skills }),
        ...(input.interests && { interests: input.interests }),
        ...(input.open_to && { open_to: input.open_to }),
      })
      analytics.conversion('signup_success', { role: selectedRole })
      setEmailSent(true)
    } catch (error: any) {
      setErrorMessage(error.message || 'Failed to create account. Please try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="bg-gray-900 min-h-screen flex items-center justify-center p-4">
      <div className="bg-white rounded-lg p-8 w-full max-w-2xl mx-auto shadow-lg">
        {emailSent ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-ktip-tropical-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={32} className="text-ktip-tropical-600" />
            </div>
            <h2 className="text-2xl font-display font-bold text-ktip-sand-900 mb-2">
              Check your email
            </h2>
            <p className="text-ktip-sand-600 mb-6 max-w-md mx-auto">
              We've sent a confirmation link to <strong className="text-ktip-sand-800">{email}</strong>. Click the link to verify your account and get started.
            </p>
            <Link to="/login">
              <Button variant="secondary">Go to Sign In</Button>
            </Link>
          </div>
        ) : (
          <>
            <div className="text-center mb-6">
              <h1 className="text-4xl font-display font-bold text-ktip-ocean-600 mb-2">
                Join KTIP
              </h1>
              <p className="text-ktip-sand-600">{APP_FULL_NAME}</p>
            </div>

            {/* Step indicator */}
            <div className="flex items-center justify-center gap-2 mb-8">
              {STEPS.map((s, i) => (
                <div key={s.number} className="flex items-center gap-2">
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                        step === s.number
                          ? 'bg-ktip-ocean-500 text-white'
                          : step > s.number
                            ? 'bg-ktip-tropical-500 text-white'
                            : 'bg-ktip-sand-100 text-ktip-sand-500'
                      }`}
                    >
                      {step > s.number ? <CheckCircle size={16} /> : s.number}
                    </div>
                    <span className="text-xs text-ktip-sand-600 mt-1 whitespace-nowrap">{s.title}</span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className={`w-10 h-0.5 mb-5 ${step > s.number ? 'bg-ktip-tropical-400' : 'bg-ktip-sand-200'}`} />
                  )}
                </div>
              ))}
            </div>

            {errorMessage && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm mb-5">
                {errorMessage}
              </div>
            )}

            {step === 1 && (
              <div className="space-y-5">
                <Input
                  type="text"
                  label="Display Name"
                  placeholder="Enter your full name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  onBlur={() => handleBlur('display_name')}
                  error={visibleError('display_name')}
                  icon={<User size={20} />}
                  fullWidth
                  required
                />

                <Input
                  type="email"
                  label="Email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => handleBlur('email')}
                  error={visibleError('email')}
                  icon={<Mail size={20} />}
                  fullWidth
                  required
                />

                <div>
                  <Input
                    type="password"
                    label="Password"
                    placeholder="Create a password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onBlur={() => handleBlur('password')}
                    error={visibleError('password')}
                    icon={<Lock size={20} />}
                    fullWidth
                    required
                  />
                  {(password.length > 0 || touched.password) && (
                    <PasswordChecklist password={password} />
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-ktip-sand-700 mb-2">
                    I am a... <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {SELECTABLE_ROLES.map((role) => (
                      <button
                        key={role.value}
                        type="button"
                        onClick={() => {
                          setSelectedRole(role.value)
                          markTouched('role')
                          setErrors((prev) => {
                            const next = { ...prev }
                            delete next.role
                            return next
                          })
                        }}
                        className={`p-4 rounded-xl border-2 text-left transition-all ${
                          selectedRole === role.value
                            ? 'border-ktip-ocean-500 bg-ktip-ocean-50'
                            : 'border-ktip-sand-200 hover:border-ktip-ocean-300'
                        }`}
                      >
                        <div className="font-medium text-ktip-sand-900">{role.label}</div>
                        <div className="text-sm text-ktip-sand-600 mt-1">{role.description}</div>
                      </button>
                    ))}
                  </div>
                  {visibleError('role') && (
                    <p className="mt-2 text-sm text-red-600">{errors.role}</p>
                  )}
                </div>

                <Button type="button" fullWidth onClick={goNext} icon={<ArrowRight size={20} />}>
                  Next
                </Button>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5">
                <p className="text-sm text-ktip-sand-600 -mt-1">
                  Tell us a bit about yourself. These details are optional — you can add or change them later in Settings.
                </p>

                <Input
                  type="text"
                  label="Organisation"
                  placeholder="Company, university, or institution"
                  value={organization}
                  onChange={(e) => setOrganization(e.target.value)}
                  error={errors.organization}
                  icon={<Building2 size={20} />}
                  fullWidth
                />

                <IndustrySelect value={industry} onChange={setIndustry} />

                <div className="flex flex-col gap-1.5 w-full">
                  <label className="text-sm font-medium text-ktip-sand-700">Country</label>
                  <select
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="w-full border border-ktip-sand-200 rounded-xl px-4 py-3 bg-ktip-sand-50/50 transition-all focus:outline-none focus:ring-2 focus:border-ktip-ocean-500 focus:ring-ktip-ocean-500/20 focus:bg-white"
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
                  error={errors.bio}
                  helperText={`${bio.length}/${LIMITS.MAX_BIO_LENGTH} characters`}
                  rows={4}
                  maxLength={LIMITS.MAX_BIO_LENGTH}
                  placeholder="Tell us about yourself..."
                  fullWidth
                />

                <div className="flex gap-3">
                  <Button type="button" variant="secondary" onClick={() => setStep(1)} icon={<ArrowLeft size={18} />}>
                    Back
                  </Button>
                  <Button type="button" fullWidth onClick={goNext} icon={<ArrowRight size={20} />}>
                    Next
                  </Button>
                </div>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="w-full text-center text-sm text-ktip-sand-500 hover:text-ktip-ocean-600 transition-colors"
                >
                  Skip for now
                </button>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-6">
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
                  <Button type="button" variant="secondary" onClick={() => setStep(2)} icon={<ArrowLeft size={18} />}>
                    Back
                  </Button>
                  <Button
                    type="button"
                    fullWidth
                    loading={pending}
                    onClick={handleSubmit}
                    icon={<UserPlus size={20} />}
                  >
                    Create Account
                  </Button>
                </div>
              </div>
            )}

            <p className="mt-8 text-center text-sm text-ktip-sand-600">
              Already have an account?{' '}
              <Link to="/login" className="font-medium text-ktip-ocean-600 hover:text-ktip-ocean-700">
                Sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
