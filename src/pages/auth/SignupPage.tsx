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
import { Mail, Lock, User, UserPlus, CheckCircle, ArrowLeft, ArrowRight, Building2, Cake } from 'lucide-react'
import { signupSchema, signupStep1Schema, todayIso } from '../../lib/validation'
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
import { OAuthButtons } from '../../components/auth/OAuthButtons'
import { ConsentDocument } from '../../components/legal/ConsentDocument'
import { CONSENT_BUNDLES } from '../../lib/legal'
import { Trans, useLingui } from '@lingui/react/macro'
import { msg } from '@lingui/core/macro'

const STEPS = [
  { title: msg`Account`, caption: msg`Join the Caribbean’s knowledge and innovation network.` },
  { title: msg`About You`, caption: msg`Tell your story — connect across the OECS.` },
  { title: msg`Skills & Collaboration`, caption: msg`Find collaborators. Build what’s next.` },
  { title: msg`Agreements`, caption: msg`The rules of the road. Read them once, then you’re in.` },
]

const HEADINGS = [
  msg`Create an account`,
  msg`About you`,
  msg`Skills & collaboration`,
  msg`Before you join`,
]

// Stops the picker offering a future date. The schema rejects one anyway.
const TODAY_ISO = todayIso()

// Every required step-1 field, marked touched at once when the user tries to
// advance with errors still outstanding.
const ALL_STEP1_TOUCHED: Record<string, boolean> = {
  display_name: true,
  email: true,
  password: true,
  confirm_password: true,
  date_of_birth: true,
  role: true,
}

export default function SignupPage() {
    const { t, i18n } = useLingui()
  const auth = useAuth()

  const [step, setStep] = useState(1)

  // Step 1 — required account fields
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
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

  // Step 4 — required. Set by ConsentDocument once the reader has scrolled to
  // the end of the agreement AND ticked the box.
  const [consentAccepted, setConsentAccepted] = useState(false)

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
    confirm_password: confirmPassword,
    role: selectedRole,
    date_of_birth: dateOfBirth,
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

  // Derived rather than read off `errors`, so the message clears the moment
  // either password field changes instead of waiting for the next blur.
  const mismatch = confirmPassword.length > 0 && confirmPassword !== password

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
        setTouched(ALL_STEP1_TOUCHED)
        return
      }
      analytics.funnel('signup', 'step_1_complete', { role: selectedRole })
    }
    if (step === 2) {
      analytics.funnel('signup', 'step_2_complete')
    }
    if (step === 3) {
      analytics.funnel('signup', 'step_3_complete')
    }
    setStep(step + 1)
  }

  const handleSubmit = async () => {
    // Belt and braces — the button is already gated on this. If it were ever
    // reachable without consent, handle_new_user() would leave the account
    // owing one and ProtectedRoute would route it to onboarding rather than
    // letting it through unagreed.
    if (!consentAccepted) return

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
      if (Object.keys(ALL_STEP1_TOUCHED).some((field) => fieldErrors[field])) {
        setTouched(ALL_STEP1_TOUCHED)
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
        // Seeds account_age via handle_new_user (091). Never lands on `profiles`.
        date_of_birth: dateOfBirth,
        // Seeds user_consents via handle_new_user (115), exactly as the date of
        // birth seeds account_age — and for a reason that is not stylistic
        // symmetry. With email confirmation on, signUp() returns NO SESSION, so
        // auth.uid() is null and record_consent() would refuse; meanwhile the
        // auth user and its profile already exist, because the trigger fired.
        // An RPC here would leave the account with no consent on file for as
        // long as the confirmation email went unread.
        legal_consent: CONSENT_BUNDLES.account,
        legal_consent_locale: i18n.locale,
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
      setErrorMessage(error.message || t`Failed to create account. Please try again.`)
    } finally {
      setPending(false)
    }
  }

  const steps = STEPS.map((s) => ({ title: i18n._(s.title), caption: i18n._(s.caption) }))

  return (
    <AuthSplitShell
        step={step}
        steps={steps}
        heading={emailSent ? t`Check your email` : i18n._(HEADINGS[step - 1])}
        subheading={!emailSent && step === 1 ? APP_FULL_NAME : undefined}
        topLink={
          emailSent ? undefined : (
            <Trans>
              Already have an account?{' '}
              <Link to="/login" className="font-medium text-ktip-ocean-600 hover:text-ktip-ocean-700">
                Log in
              </Link>
            </Trans>
          )
        }
      >
        {emailSent ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-ktip-tropical-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={32} className="text-ktip-tropical-600" />
            </div>
            <p className="text-ktip-sand-600 mb-6 max-w-md mx-auto">
              <Trans>
                We've sent a confirmation link to <strong className="text-ktip-sand-800">{email}</strong>. Click the link to verify your account and get started.
              </Trans>
            </p>
            <Link to="/login">
              <Button variant="secondary"><Trans>Go to Sign In</Trans></Button>
            </Link>
          </div>
        ) : (
          <>
            {errorMessage && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm mb-5">
                {errorMessage}
              </div>
            )}

            {step === 1 && (
              <div className="space-y-3">
                <Input
                  type="text"
                  label={t`Display Name`}
                  placeholder={t`Enter your full name`}
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
                  label={t`Email`}
                  placeholder={t`Enter your email`}
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
                    label={t`Password`}
                    placeholder={t`Create a password`}
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

                <Input
                  type="password"
                  label={t`Confirm Password`}
                  placeholder={t`Re-enter your password`}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onBlur={() => handleBlur('confirm_password')}
                  error={
                    touched.confirm_password && mismatch
                      ? t`Passwords do not match`
                      : visibleError('confirm_password')
                  }
                  icon={<Lock size={20} />}
                  fullWidth
                  required
                />

                <Input
                  type="date"
                  label={t`Date of Birth`}
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  onBlur={() => handleBlur('date_of_birth')}
                  error={visibleError('date_of_birth')}
                  helperText={t`Members under 18 get extra protections on their account.`}
                  icon={<Cake size={20} />}
                  max={TODAY_ISO}
                  fullWidth
                  required
                />

                <RolePicker
                  value={selectedRole}
                  onChange={(value) => {
                    setSelectedRole(value)
                    markTouched('role')
                    setErrors((prev) => {
                      const next = { ...prev }
                      delete next.role
                      return next
                    })
                  }}
                  error={visibleError('role')}
                />

                <Button type="button" fullWidth onClick={goNext} icon={<ArrowRight size={20} />}>
                  <Trans>Next</Trans>
                </Button>

                {/* Said here rather than sprung at step 4. Someone who is not
                    willing to accept the Terms should find that out before
                    typing three screens of profile, and the links open in a new
                    tab so reading them does not cost the form. */}
                <p className="text-center text-xs leading-relaxed text-ktip-sand-500">
                  <Trans>
                    You will be asked to accept our{' '}
                    <Link
                      to="/legal/terms"
                      target="_blank"
                      className="font-medium text-ktip-ocean-600 hover:text-ktip-ocean-700"
                    >
                      Terms of Use
                    </Link>{' '}
                    and{' '}
                    <Link
                      to="/legal/privacy"
                      target="_blank"
                      className="font-medium text-ktip-ocean-600 hover:text-ktip-ocean-700"
                    >
                      Privacy Policy
                    </Link>{' '}
                    before your account is created.
                  </Trans>
                </p>

                <OAuthButtons label={t`Or sign up with`} onError={setErrorMessage} />
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <p className="text-sm text-ktip-sand-600 -mt-1">
                  <Trans>Tell us a bit about yourself. These details are optional — you can add or change them later in Settings.</Trans>
                </p>

                <Input
                  type="text"
                  label={t`Organisation`}
                  placeholder={t`Company, university, or institution`}
                  value={organization}
                  onChange={(e) => setOrganization(e.target.value)}
                  error={errors.organization}
                  icon={<Building2 size={20} />}
                  fullWidth
                />

                <IndustrySelect value={industry} onChange={setIndustry} />

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

                <Textarea
                  label={t`Bio`}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  error={errors.bio}
                  helperText={t`${bio.length}/${LIMITS.MAX_BIO_LENGTH} characters`}
                  rows={4}
                  maxLength={LIMITS.MAX_BIO_LENGTH}
                  placeholder={t`Tell us about yourself...`}
                  fullWidth
                />

                <div className="flex gap-3">
                  <Button type="button" variant="secondary" onClick={() => setStep(1)} icon={<ArrowLeft size={18} />}>
                    <Trans>Back</Trans>
                  </Button>
                  <Button type="button" fullWidth onClick={goNext} icon={<ArrowRight size={20} />}>
                    <Trans>Next</Trans>
                  </Button>
                </div>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="w-full text-center text-sm text-ktip-sand-500 hover:text-ktip-ocean-600 transition-colors"
                >
                  <Trans>Skip for now</Trans>
                </button>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <p className="text-sm text-ktip-sand-600 -mt-1">
                  <Trans>Help others find and collaborate with you. Optional — editable later in Settings.</Trans>
                </p>

                <TagInput
                  label={t`Skills`}
                  values={skills}
                  onChange={setSkills}
                  suggestions={SKILL_SUGGESTIONS}
                  max={LIMITS.MAX_SKILLS}
                  placeholder={t`Type a skill and press Enter...`}
                />

                <TagInput
                  label={t`Interests`}
                  values={interests}
                  onChange={setInterests}
                  suggestions={INTEREST_SUGGESTIONS}
                  max={LIMITS.MAX_INTERESTS}
                  placeholder={t`Type an interest and press Enter...`}
                />

                <div>
                  <label className="block text-sm font-medium text-ktip-sand-700 mb-2">
                    <Trans>Openness to Collaborate</Trans>
                  </label>
                  <CollabSelect values={openTo} onChange={setOpenTo} />
                </div>

                <div className="flex gap-3">
                  <Button type="button" variant="secondary" onClick={() => setStep(2)} icon={<ArrowLeft size={18} />}>
                    <Trans>Back</Trans>
                  </Button>
                  <Button type="button" fullWidth onClick={goNext} icon={<ArrowRight size={20} />}>
                    <Trans>Next</Trans>
                  </Button>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-4">
                <p className="-mt-1 text-sm text-ktip-sand-600">
                  <Trans>
                    Four documents govern your account. Read them, then accept to finish creating
                    it.
                  </Trans>
                </p>

                <ConsentDocument bundle="account" onAcceptedChange={setConsentAccepted} />

                <div className="flex gap-3">
                  <Button type="button" variant="secondary" onClick={() => setStep(3)} icon={<ArrowLeft size={18} />}>
                    <Trans>Back</Trans>
                  </Button>
                  <Button
                    type="button"
                    fullWidth
                    loading={pending}
                    disabled={!consentAccepted}
                    onClick={handleSubmit}
                    icon={<UserPlus size={20} />}
                  >
                    <Trans>Agree & Create Account</Trans>
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
    </AuthSplitShell>
  )
}
