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
import { CountrySelect } from '../../components/ui/CountrySelect'
import { User, CheckCircle, ArrowLeft, ArrowRight, Building2, Clock, GraduationCap, Cake } from 'lucide-react'
import { dateOfBirthSchema, todayIso } from '../../lib/validation'
import { supabase } from '../../lib/supabase'
import {
  APP_FULL_NAME,
  SKILL_SUGGESTIONS,
  INTEREST_SUGGESTIONS,
  LIMITS,
  VERIFICATION_GATED_ROLES,
} from '../../lib/constants'
import { analytics } from '../../hooks/useAnalytics'
import { ROLE_BY_SLUG, roleRequiresMfa } from '../../lib/permissions'
import { AuthSplitShell } from '../../components/auth/AuthSplitShell'
import { RolePicker } from '../../components/auth/RolePicker'
import { usePageTitle } from '../../hooks/usePageTitle'
import { useRequestStudentVerification } from '../../hooks/useInstitutions'
import { useMyVerificationRequest, useRequestOrgRole } from '../../hooks/useVerification'
import { resolveCopy } from '../../i18n/copy'
import type { RoleSlug, UserRole } from '../../types'
import { DiamondAvatar } from '../../components/ui/DiamondAvatar'
import { ConsentDocument } from '../../components/legal/ConsentDocument'
import { CONSENT_BUNDLES, bundleVersion } from '../../lib/legal'
import { Trans, useLingui } from '@lingui/react/macro'

const TODAY_ISO = todayIso()

/**
 * Whether a picked role is reviewed by a KTIP administrator rather than by a
 * school. Read off the catalogue tier rather than a second list, so adding an
 * organisation role to the grid needs no change here.
 */
function isOrgRole(slug: string): boolean {
  return ROLE_BY_SLUG[slug]?.tier === 'organization'
}

/**
 * Post-OAuth profile completion. Name and avatar are pre-filled from the
 * Google/Microsoft account; the user picks a role (required) and can fill
 * the same optional fields as the email signup wizard.
 */
export default function OnboardingPage() {
  const { t, i18n } = useLingui()
  usePageTitle(t`Complete Your Profile`)
  const auth = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const [step, setStep] = useState(1)

  const [displayName, setDisplayName] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
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
  // Set once a verification-gated role has been queued with whoever reviews
  // it — a school for student and faculty, a KTIP administrator for an
  // organisation. The account genuinely has no role until that approval, so
  // this replaces the wizard rather than navigating away: there is nowhere to
  // navigate to.
  const [awaitingReview, setAwaitingReview] = useState<string | null>(null)
  const prefilled = useRef(false)
  const submitted = useRef(false)

  // Step 3 (agreements) is reachable from either of step 2's buttons, and they
  // differ only in whether the optional fields are saved. Held in a ref rather
  // than state because nothing renders from it.
  const includeStep2 = useRef(true)
  const [consentAccepted, setConsentAccepted] = useState(false)

  const { requestVerification } = useRequestStudentVerification()
  const { requestOrgRole } = useRequestOrgRole()

  // An organisation request is a row, not a piece of local state: someone who
  // reloads before the reviewer answers would otherwise be shown the picker
  // again, ask a second time, and trip the one-open-request index.
  const { request: myRequest } = useMyVerificationRequest(auth.user?.id)

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

  // Accounts created before 091 have this false and are never asked; a Google or
  // Microsoft signup arrives with no birthday claim at all, so this is the only
  // point at which their age can be established.
  const needsDob = auth.profile?.requires_age_declaration === true

  // Same shape as needsDob: an OAuth account never saw the agreements, so it
  // arrives owing them. False for every account created before 111.
  const needsConsent = auth.profile?.requires_consent === true

  // Already onboarded (role set) and not mid-submit — nothing to do here.
  // An outstanding age declaration keeps them here regardless of role, or
  // ProtectedRoute would bounce them straight back and the two would loop.
  //
  // `!needsConsent` is here for exactly that reason and is easy to leave out:
  // without it, an account with a role but outstanding agreements is sent to
  // '/', bounced back by ProtectedRoute, and the two redirect at each other
  // forever.
  if (
    auth.profile &&
    auth.profile.roles.length > 0 &&
    !needsDob &&
    !needsConsent &&
    !submitted.current
  ) {
    return <Navigate to="/" replace />
  }

  const steps = [
    { title: t`About You`, caption: t`Almost there — set up your KTIP profile.` },
    { title: t`Skills & Collaboration`, caption: t`Find collaborators. Build what’s next.` },
    ...(needsConsent
      ? [{ title: t`Agreements`, caption: t`The rules of the road. Read them once, then you’re in.` }]
      : []),
  ]
  const headings = [
    t`Complete your profile`,
    t`Skills & collaboration`,
    ...(needsConsent ? [t`Before you join`] : []),
  ]

  const validateStep1 = (): boolean => {
    const fieldErrors: Record<string, string> = {}
    if (!displayName.trim()) fieldErrors.display_name = t`Display name is required`
    if (needsDob) {
      const dob = dateOfBirthSchema.safeParse(dateOfBirth)
      if (!dob.success) fieldErrors.date_of_birth = dob.error.issues[0]?.message ?? t`Enter a valid date of birth`
    }
    if (!selectedRole) fieldErrors.role = t`Please select a role`
    setErrors(fieldErrors)
    return Object.keys(fieldErrors).length === 0
  }

  const goNext = () => {
    if (!validateStep1()) return
    analytics.funnel('onboarding', 'step_1_complete', { role: selectedRole })
    setStep(2)
  }

  const saveProfile = async (withStep2: boolean) => {
    if (!validateStep1()) {
      setStep(1)
      return
    }
    if (needsConsent && !consentAccepted) {
      setStep(3)
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
      // First, and through an RPC rather than a table write: the declaration
      // lands in account_age, which has no INSERT policy, and the trigger there
      // is what derives is_minor and clears requires_age_declaration. Doing it
      // before updateProfile means the profile refetch that follows already sees
      // the cleared flag, so ProtectedRoute does not bounce them back here.
      if (needsDob) {
        const { data, error } = await (supabase as any).rpc('declare_date_of_birth', {
          p_dob: dateOfBirth,
          p_source: 'onboarding',
        })
        if (error) throw error
        if (data?.ok !== true && data?.reason !== 'already_declared') {
          throw new Error(
            data?.reason === 'under_minimum_age'
              ? t`You must be at least 13 to use KTIP.`
              : t`We could not save your date of birth. Please check it and try again.`
          )
        }
      }

      // Before updateProfile, for the same reason the declaration above is:
      // record_consent() clears profiles.requires_consent, and the profile
      // refetch that updateProfile triggers has to see it already cleared or
      // ProtectedRoute bounces them straight back here.
      //
      // An RPC is correct here and wrong at signup — this account has a live
      // session, so auth.uid() resolves.
      if (needsConsent) {
        const { data, error } = await (supabase as any).rpc('record_consent', {
          p_keys: CONSENT_BUNDLES.account,
          p_locale: i18n.locale,
          p_context: 'onboarding',
          p_user_agent: typeof navigator === 'undefined' ? null : navigator.userAgent,
          p_expected_version: bundleVersion('account'),
        })
        if (error) throw error
        if (data?.ok !== true) {
          throw new Error(
            data?.reason === 'version_mismatch'
              ? t`These agreements have been updated. Please reload the page and read the current version.`
              : t`We could not record your agreement. Please try again.`
          )
        }
      }

      await auth.updateProfile({
        display_name: displayName.trim(),
        ...(needsSchool ? {} : { roles: [selectedRole as UserRole] }),
        organization: organization.trim() || null,
        industry: industry.trim() || null,
        country: country || null,
        bio: bio.trim() || null,
        ...(withStep2 && {
          skills,
          interests,
          open_to: openTo,
        }),
      })

      if (needsSchool) {
        // Three different reviewers behind one flag:
        //
        //   student — request_student_verification() matches the account's
        //     email domain against a verified institution.
        //   faculty — assigned by an institution admin from their side, so
        //     there is nothing to call. We say so rather than pretending to
        //     queue it.
        //   organisation — a verification request carrying the role, which a
        //     KTIP administrator grants at /admin/verification (migration 125).
        if (selectedRole === 'student') {
          await requestVerification()
        } else if (isOrgRole(selectedRole) && auth.user) {
          await requestOrgRole({
            userId: auth.user.id,
            role: selectedRole as RoleSlug,
            note: organization.trim() || undefined,
          })
        }
        analytics.funnel('onboarding', 'verification_requested', { role: selectedRole })
        setAwaitingReview(selectedRole)
        return
      }

      analytics.conversion('onboarding_complete', { role: selectedRole })

      // 118: read the requirement off the role just chosen, NOT off the profile.
      // updateProfile invalidates the profile query but does not await the
      // refetch, so auth.profile.requires_mfa_enrollment is still the pre-write
      // value here and would send an entrepreneur to the dashboard.
      //
      // roleRequiresMfa is the compiled mirror of role_definitions.requires_mfa.
      // If an operator has toggled a role on that this bundle does not know
      // about, the member lands on '/' and ProtectedRoute bounces them — a
      // flash, never a bypass.
      if (roleRequiresMfa(selectedRole)) {
        navigate('/security/set-up', { replace: true })
        return
      }

      toast.success(t`Welcome to KTIP!`)
      navigate('/', { replace: true })
    } catch (error: any) {
      submitted.current = false
      setErrorMessage(error.message || t`Failed to save your profile. Please try again.`)
    } finally {
      setPending(false)
    }
  }

  /** Back out of the pending state to pick a role that needs no approval. */
  const chooseDifferentRole = () => {
    setAwaitingReview(null)
    setSelectedRole('')
    setErrorMessage('')
    submitted.current = false
    setStep(1)
  }

  // Waiting on a reviewer. Deliberately terminal rather than a redirect: the
  // account holds no role yet, so ProtectedRoute would send it straight back
  // here. Saying so plainly beats a redirect loop.
  //
  // `pendingOrgRequest` is what makes it survive a reload — the row outlives
  // the component, and without it a returning organisation would be shown the
  // picker as though it had never asked.
  const pendingOrgRequest =
    myRequest?.status === 'pending' && myRequest.requested_role ? myRequest.requested_role : null
  const waitingOn = awaitingReview ?? (auth.profile?.roles.length ? null : pendingOrgRequest)

  if (waitingOn) {
    const isStudent = waitingOn === 'student'
    const isOrg = isOrgRole(waitingOn)
    const orgLabel = isOrg ? resolveCopy(i18n, ROLE_BY_SLUG[waitingOn]?.label ?? waitingOn) : ''
    return (
      <AuthSplitShell
        step={1}
        steps={steps}
        heading={
          isOrg
            ? t`Waiting on KTIP review`
            : isStudent
              ? t`Waiting on your school`
              : t`Your institution adds you`
        }
        subheading={APP_FULL_NAME}
        heroOffset={3}
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-ktip-ocean-200 bg-ktip-ocean-50 px-4 py-3">
            {isOrg ? (
              <Building2 size={18} className="mt-0.5 flex-shrink-0 text-ktip-ocean-600" />
            ) : isStudent ? (
              <Clock size={18} className="mt-0.5 flex-shrink-0 text-ktip-ocean-600" />
            ) : (
              <GraduationCap size={18} className="mt-0.5 flex-shrink-0 text-ktip-ocean-600" />
            )}
            <div className="text-sm text-ktip-sand-700">
              {isOrg ? (
                <>
                  <p className="font-medium text-ktip-sand-900">
                    <Trans>Your request has been sent.</Trans>
                  </p>
                  <p className="mt-1">
                    <Trans>
                      You asked to join as <strong>{orgLabel}</strong>. A KTIP administrator
                      confirms that <strong>{auth.user?.email}</strong> speaks for the organisation,
                      and that approval is what turns on the account. You will get an email when it
                      happens.
                    </Trans>
                  </p>
                </>
              ) : isStudent ? (
                <>
                  <p className="font-medium text-ktip-sand-900"><Trans>Your request has been sent.</Trans></p>
                  <p className="mt-1">
                    <Trans>
                      We matched <strong>{auth.user?.email}</strong> to your institution. An educator
                      there approves it, and that approval is what turns on your student account.
                      You will get an email when it happens.
                    </Trans>
                  </p>
                </>
              ) : (
                <>
                  <p className="font-medium text-ktip-sand-900">
                    <Trans>Faculty accounts are set up by your institution.</Trans>
                  </p>
                  <p className="mt-1">
                    <Trans>
                      Ask the KTIP administrator at your school or university to add{' '}
                      <strong>{auth.user?.email}</strong> as an educator. Once they do, your faculty
                      account is ready.
                    </Trans>
                  </p>
                </>
              )}
            </div>
          </div>

          <p className="text-sm text-ktip-sand-600">
            {isOrg ? (
              <Trans>Your profile is saved either way. If you would rather start using KTIP now, pick a role that needs no approval — the organisation role is still added when the review comes back.</Trans>
            ) : (
              <Trans>Your profile is saved either way. If you would rather start using KTIP now, pick a role that needs no approval — you can still verify with your school later from Settings.</Trans>
            )}
          </p>

          <Button type="button" variant="secondary" fullWidth onClick={chooseDifferentRole}>
            <Trans>Choose a different role</Trans>
          </Button>
        </div>
      </AuthSplitShell>
    )
  }

  return (
    <AuthSplitShell
      step={step}
      steps={steps}
      heading={headings[step - 1]}
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
                name={auth.profile?.display_name || auth.user?.email || t`You`}
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
                <Trans>
                  Signed in as <strong className="text-ktip-sand-800">{auth.user?.email}</strong>.
                  We pre-filled your details from your account — review and finish up below.
                </Trans>
              </p>
            </div>

            <Input
              type="text"
              label={t`Display Name`}
              placeholder={t`Enter your full name`}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              error={errors.display_name}
              icon={<User size={20} />}
              fullWidth
              required
            />

            {needsDob && (
              <Input
                type="date"
                label={t`Date of Birth`}
                value={dateOfBirth}
                onChange={(e) => {
                  setDateOfBirth(e.target.value)
                  setErrors((prev) => {
                    const next = { ...prev }
                    delete next.date_of_birth
                    return next
                  })
                }}
                error={errors.date_of_birth}
                helperText={t`Your provider does not share this with us. Members under 18 get extra protections on their account.`}
                icon={<Cake size={20} />}
                max={TODAY_ISO}
                fullWidth
                required
              />
            )}

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
              label={t`Organisation`}
              placeholder={t`Company, university, or institution`}
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              icon={<Building2 size={20} />}
              fullWidth
            />

            <IndustrySelect value={industry} onChange={setIndustry} />

            <CountrySelect value={country} onChange={setCountry} />

            <Textarea
              label={t`Bio`}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              helperText={t`${bio.length}/${LIMITS.MAX_BIO_LENGTH} characters`}
              rows={3}
              maxLength={LIMITS.MAX_BIO_LENGTH}
              placeholder={t`Tell us about yourself...`}
              fullWidth
            />

            <Button type="button" fullWidth onClick={goNext} icon={<ArrowRight size={20} />}>
              <Trans>Next</Trans>
            </Button>
          </div>
        )}

        {step === 2 && (
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
              <Button type="button" variant="secondary" onClick={() => setStep(1)} icon={<ArrowLeft size={18} />}>
                <Trans>Back</Trans>
              </Button>
              <Button
                type="button"
                fullWidth
                loading={pending}
                onClick={() => {
                  includeStep2.current = true
                  if (needsConsent) setStep(3)
                  else void saveProfile(true)
                }}
                icon={needsConsent ? <ArrowRight size={20} /> : <CheckCircle size={20} />}
              >
                {needsConsent ? <Trans>Next</Trans> : <Trans>Finish</Trans>}
              </Button>
            </div>
            <button
              type="button"
              onClick={() => {
                includeStep2.current = false
                // Skipping the optional fields never skips the agreements.
                if (needsConsent) setStep(3)
                else void saveProfile(false)
              }}
              disabled={pending}
              className="w-full text-center text-sm text-ktip-sand-500 hover:text-ktip-ocean-600 transition-colors"
            >
              <Trans>Skip for now</Trans>
            </button>
          </div>
        )}

        {step === 3 && needsConsent && (
          <div className="space-y-4">
            <p className="-mt-1 text-sm text-ktip-sand-600">
              <Trans>
                Four documents govern your account. Read them, then accept to finish setting up.
              </Trans>
            </p>

            <ConsentDocument bundle="account" onAcceptedChange={setConsentAccepted} />

            <div className="flex gap-3">
              <Button type="button" variant="secondary" onClick={() => setStep(2)} icon={<ArrowLeft size={18} />}>
                <Trans>Back</Trans>
              </Button>
              <Button
                type="button"
                fullWidth
                loading={pending}
                disabled={!consentAccepted}
                onClick={() => void saveProfile(includeStep2.current)}
                icon={<CheckCircle size={20} />}
              >
                <Trans>Agree & Finish</Trans>
              </Button>
            </div>
          </div>
        )}
    </AuthSplitShell>
  )
}
