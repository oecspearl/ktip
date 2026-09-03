import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../../contexts/AuthContext'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Textarea } from '../../components/ui/Textarea'
import { TagInput } from '../../components/ui/TagInput'
import { CollabSelect } from '../../components/ui/CollabSelect'
import { IndustrySelect } from '../../components/ui/IndustrySelect'
import { CountrySelect } from '../../components/ui/CountrySelect'
import { PasswordChecklist } from '../../components/ui/PasswordChecklist'
import { Mail, Lock, UserPlus, CheckCircle, ArrowLeft, ArrowRight, Building2, Cake } from 'lucide-react'
import { OtpInput } from '../../components/ui/OtpInput'
import { signupSchema, signupStep1Schema, todayIso } from '../../lib/validation'
import { supabase } from '../../lib/supabase'
import { roleRequiresMfa } from '../../lib/permissions'
import {
  APP_FULL_NAME,
  SKILL_SUGGESTIONS,
  INTEREST_SUGGESTIONS,
  LIMITS,
  ROLE_LABELS,
} from '../../lib/constants'
import { analytics } from '../../hooks/useAnalytics'
import { AuthSplitShell } from '../../components/auth/AuthSplitShell'
import { RolePicker } from '../../components/auth/RolePicker'
import { FormSection } from '../../components/ui/FormSection'
import { resolveCopy } from '../../i18n/copy'
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
  { title: msg`Verify email`, caption: msg`One code, and the account is yours.` },
]

const HEADINGS = [
  msg`Create an account`,
  msg`About you`,
  msg`Skills & collaboration`,
  msg`Before you join`,
  msg`Check your email`,
]

/** GoTrue refuses a resend inside its own 60-second window, so the button says so. */
const RESEND_COOLDOWN_SECONDS = 60

// Stops the picker offering a future date. The schema rejects one anyway.
const TODAY_ISO = todayIso()

// Every required step-1 field, marked touched at once when the user tries to
// advance with errors still outstanding.
/**
 * Step 1 is two folds: the account, and the role. These are the fields of the
 * first one — the set whose validity decides when it folds away and the role
 * grid comes forward.
 */
const ACCOUNT_FIELDS = ['email', 'password', 'confirm_password', 'date_of_birth'] as const

/**
 * The name a brand-new profile starts life with.
 *
 * Signup asks for no display name at all. handle_new_user() coalesces a missing
 * one to the account's EMAIL ADDRESS, and that address is then what the member
 * directory and every profile card would show — so the local part is sent
 * instead, and never the domain. Members rename themselves in Settings.
 */
const nameFromEmail = (email: string) => {
  const trimmed = email.trim()
  return trimmed.split('@')[0] || trimmed
}

const ALL_STEP1_TOUCHED: Record<string, boolean> = {
  email: true,
  password: true,
  confirm_password: true,
  date_of_birth: true,
  role: true,
}

export default function SignupPage() {
    const { t, i18n } = useLingui()
  const auth = useAuth()
  const navigate = useNavigate()

  const [step, setStep] = useState(1)

  // Step 1 — required account fields
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [selectedRole, setSelectedRole] = useState('')

  // Which of step 1's two folds is open. The account comes first and the role
  // grid waits folded underneath it, so a new visitor sees five fields rather
  // than five fields and fourteen cards. Leaving the last account field with
  // everything valid swaps them; either header reopens its section by hand.
  const [accountOpen, setAccountOpen] = useState(true)
  const [roleOpen, setRoleOpen] = useState(false)

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
  const [pending, setPending] = useState(false)

  // Step 5 — the email one-time code (118). This replaced the old "we sent you a
  // confirmation link" dead end, and the reason is session continuity rather
  // than taste: under PKCE the link is only redeemable in the browser that asked
  // for it, and signUp() returns no session at all. verifyOtp() returns a live
  // one, which is what makes it possible to walk straight into MFA enrolment in
  // the same tab.
  const [otpSent, setOtpSent] = useState(false)
  const [otpCode, setOtpCode] = useState('')
  const [otpError, setOtpError] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [resendIn, setResendIn] = useState(0)

  // Counts the resend button down rather than letting the member press it and
  // get GoTrue's refusal back as an error.
  useEffect(() => {
    if (resendIn <= 0) return
    const timer = window.setTimeout(() => setResendIn((seconds) => seconds - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [resendIn])

  const markTouched = (field: string) => setTouched((t) => ({ ...t, [field]: true }))

  const step1Values = {
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

  const accountValid = (fieldErrors: Record<string, string>) =>
    ACCOUNT_FIELDS.every((field) => !fieldErrors[field])

  // Live, from the values themselves rather than from `errors` — that map is
  // only refreshed on blur, and autofill or a click straight into a later field
  // never blurs the earlier ones. The tick would otherwise wait on a ritual.
  const accountComplete = accountValid(validateStep1())

  // Date of birth is the last account field, so leaving it is the natural
  // "done with this part" moment. The fold only swaps when everything above is
  // valid — an account section that folds over a bad email hides the error
  // instead of showing it.
  const handleDobBlur = () => {
    markTouched('date_of_birth')
    const fieldErrors = validateStep1()
    setErrors(fieldErrors)
    if (accountValid(fieldErrors)) {
      setAccountOpen(false)
      setRoleOpen(true)
    }
  }

  const goNext = () => {
    if (step === 1) {
      const fieldErrors = validateStep1()
      setErrors(fieldErrors)
      if (Object.keys(fieldErrors).length > 0) {
        setTouched(ALL_STEP1_TOUCHED)
        // An error inside a folded section is an error nobody can see.
        if (!accountValid(fieldErrors)) setAccountOpen(true)
        if (fieldErrors.role) setRoleOpen(true)
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
        // Derived, not asked for — see nameFromEmail.
        display_name: nameFromEmail(email),
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
      analytics.funnel('signup', 'otp_sent', { role: selectedRole })
      setOtpSent(true)
      setResendIn(RESEND_COOLDOWN_SECONDS)
    } catch (error: any) {
      setErrorMessage(error.message || t`Failed to create account. Please try again.`)
    } finally {
      setPending(false)
    }
  }

  const verifyCode = async (code: string) => {
    if (code.length !== 6 || verifying) return
    setVerifying(true)
    setOtpError('')
    try {
      // 'email' rather than the deprecated 'signup'. This both confirms the
      // address and returns a session, so the account is signed in right here.
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: code,
        type: 'email',
      })
      if (error) throw error

      analytics.funnel('signup', 'otp_verified', { role: selectedRole })

      // Navigate straight to enrolment rather than letting ProtectedRoute bounce
      // them there, purely so there is no flash of the dashboard. If the
      // compiled role catalog ever disagrees with role_definitions the gate
      // still catches it — a flash, never a bypass.
      navigate(roleRequiresMfa(selectedRole) ? '/security/set-up' : '/', { replace: true })
    } catch (error: any) {
      setOtpCode('')
      const message: string = error?.message ?? ''
      setOtpError(
        /expired/i.test(message)
          ? t`That code has expired. Send a new one.`
          : t`That code was not accepted. Check the digits and try again.`,
      )
    } finally {
      setVerifying(false)
    }
  }

  const resendCode = async () => {
    if (resendIn > 0) return
    setOtpError('')
    setResendIn(RESEND_COOLDOWN_SECONDS)
    const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim() })
    if (error) setOtpError(error.message)
  }

  const steps = STEPS.map((s) => ({ title: i18n._(s.title), caption: i18n._(s.caption) }))
  const shellStep = otpSent ? STEPS.length : step

  return (
    <AuthSplitShell
        step={shellStep}
        steps={steps}
        heading={i18n._(HEADINGS[shellStep - 1])}
        subheading={!otpSent && step === 1 ? APP_FULL_NAME : undefined}
        topLink={
          otpSent ? undefined : (
            <Trans>
              Already have an account?{' '}
              <Link to="/login" className="font-medium text-ktip-ocean-600 hover:text-ktip-ocean-700">
                Log in
              </Link>
            </Trans>
          )
        }
      >
        {otpSent ? (
          <div className="space-y-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 shrink-0 bg-ktip-tropical-100 rounded-full flex items-center justify-center">
                <CheckCircle size={20} className="text-ktip-tropical-600" />
              </div>
              <p className="text-ktip-sand-600">
                <Trans>
                  We've sent a 6-digit code to{' '}
                  <strong className="text-ktip-sand-800">{email}</strong>. Enter it below to finish
                  creating your account.
                </Trans>
              </p>
            </div>

            <OtpInput
              label={t`Verification code`}
              value={otpCode}
              onChange={setOtpCode}
              onComplete={verifyCode}
              disabled={verifying}
              error={otpError}
              autoFocus
            />

            <Button
              type="button"
              fullWidth
              loading={verifying}
              disabled={otpCode.length !== 6}
              onClick={() => void verifyCode(otpCode)}
            >
              <Trans>Verify and continue</Trans>
            </Button>

            <div className="flex items-center justify-between text-body-sm">
              <button
                type="button"
                onClick={() => void resendCode()}
                disabled={resendIn > 0}
                className="text-ktip-ocean-600 hover:text-ktip-ocean-700 font-medium disabled:text-ktip-sand-400 disabled:cursor-not-allowed"
              >
                {resendIn > 0 ? t`Send another code in ${resendIn}s` : t`Send another code`}
              </button>
              <Link to="/login" className="text-ktip-sand-500 hover:text-ktip-sand-700">
                <Trans>Go to Sign In</Trans>
              </Link>
            </div>
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
                <FormSection
                  title={t`Your account`}
                  summary={email.trim() || t`Email, password and date of birth`}
                  open={accountOpen}
                  onToggle={() => setAccountOpen((o) => !o)}
                  complete={accountComplete}
                >
                  <div className="space-y-3">
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
                    onBlur={handleDobBlur}
                    error={visibleError('date_of_birth')}
                    helperText={t`Members under 18 get extra protections on their account.`}
                    icon={<Cake size={20} />}
                    max={TODAY_ISO}
                    fullWidth
                    required
                  />
                  </div>
                </FormSection>

                <FormSection
                  title={t`Your role`}
                  summary={
                    selectedRole
                      ? resolveCopy(i18n, ROLE_LABELS[selectedRole] ?? selectedRole)
                      : t`Not chosen yet`
                  }
                  open={roleOpen}
                  onToggle={() => setRoleOpen((o) => !o)}
                  complete={!!selectedRole}
                >
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
                </FormSection>

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

                <CountrySelect value={country} onChange={setCountry} />

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
