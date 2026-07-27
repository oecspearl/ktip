import { createSignal, Show, For } from 'solid-js'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import { useSubmitPreregistration } from '../hooks/usePreregistrations'
import { analytics } from '../hooks/useAnalytics'
import { CARIBBEAN_COUNTRIES, ROLE_LABELS } from '../lib/constants'
import {
  User,
  Mail,
  MapPin,
  Briefcase,
  FileText,
  Link,
  CheckCircle,
  X,
  Sparkles,
} from 'lucide-solid'

const PREREG_ROLES = [
  { value: 'student', label: ROLE_LABELS.student, description: 'Learn and collaborate on projects' },
  { value: 'mentor', label: ROLE_LABELS.mentor, description: 'Guide and support innovators' },
  { value: 'investor', label: ROLE_LABELS.investor, description: 'Discover and fund projects' },
  { value: 'entrepreneur', label: ROLE_LABELS.entrepreneur, description: 'Build and launch innovations' },
  { value: 'private_sector', label: ROLE_LABELS.private_sector, description: 'Partner with innovators' },
]

interface PreRegistrationModalProps {
  open: boolean
  onClose: () => void
}

export function PreRegistrationModal(props: PreRegistrationModalProps) {
  const { submit, loading } = useSubmitPreregistration()

  // Form state
  const [step, setStep] = createSignal<1 | 2>(1)
  const [success, setSuccess] = createSignal(false)
  const [errorMsg, setErrorMsg] = createSignal('')

  // Step 1: Basic info
  const [displayName, setDisplayName] = createSignal('')
  const [email, setEmail] = createSignal('')
  const [country, setCountry] = createSignal('')
  const [role, setRole] = createSignal('')

  // Step 2: Profile details
  const [organization, setOrganization] = createSignal('')
  const [bio, setBio] = createSignal('')
  const [skillInput, setSkillInput] = createSignal('')
  const [skills, setSkills] = createSignal<string[]>([])
  const [linkedinUrl, setLinkedinUrl] = createSignal('')

  const addSkill = () => {
    const s = skillInput().trim()
    if (s && !skills().includes(s) && skills().length < 10) {
      setSkills(prev => [...prev, s])
      setSkillInput('')
    }
  }

  const removeSkill = (skill: string) => {
    setSkills(prev => prev.filter(s => s !== skill))
  }

  const handleSkillKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addSkill()
    }
  }

  const canProceedStep1 = () => displayName().trim() && email().trim() && role()

  const handleStep1Complete = () => {
    analytics.funnel('prereg', 'step_1_complete', { role: role() })
    setStep(2)
  }

  const handleSubmit = async () => {
    setErrorMsg('')
    analytics.funnel('prereg', 'submit_attempt', { role: role() })

    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email())) {
      setErrorMsg('Please enter a valid email address.')
      setStep(1)
      return
    }

    try {
      await submit({
        email: email().trim(),
        display_name: displayName().trim(),
        country: country() || undefined,
        bio: bio().trim() || undefined,
        organization: organization().trim() || undefined,
        role: role(),
        skills: skills().length > 0 ? skills() : undefined,
        linkedin_url: linkedinUrl().trim() || undefined,
      })
      setSuccess(true)
      analytics.conversion('prereg_submitted', { role: role(), country: country() })
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to submit. Please try again.')
      analytics.funnel('prereg', 'submit_error', { error: err.message })
    }
  }

  const handleClose = () => {
    if (!success()) analytics.funnel('prereg', 'modal_dismissed', { step: step() })
    props.onClose()
    // Reset form after close animation
    setTimeout(() => {
      setStep(1)
      setSuccess(false)
      setErrorMsg('')
      setDisplayName('')
      setEmail('')
      setCountry('')
      setRole('')
      setOrganization('')
      setBio('')
      setSkills([])
      setSkillInput('')
      setLinkedinUrl('')
    }, 300)
  }

  return (
    <Modal open={props.open} onClose={handleClose} title="" size="lg" class="!rounded-none">
      <Show when={success()}>
        <div class="text-center py-8">
          <div class="w-16 h-16 bg-ktip-tropical-600 flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={32} class="text-white" />
          </div>
          <h2 class="text-2xl font-display font-bold text-ktip-sand-900 mb-2">
            Application Submitted
          </h2>
          <p class="text-ktip-sand-600 mb-6 max-w-md mx-auto">
            Thank you for your interest in KTIP! Your pre-registration has been received.
            An administrator will review your application and you'll receive an email with your login credentials once approved.
          </p>
          <Button onClick={handleClose} class="!rounded-none">
            Close
          </Button>
        </div>
      </Show>

      <Show when={!success()}>
        <div>
          {/* Header */}
          <div class="text-center mb-6">
            <div class="w-14 h-14 bg-ktip-ocean-600 flex items-center justify-center mx-auto mb-3">
              <Sparkles size={28} class="text-white" />
            </div>
            <h2 class="text-2xl font-display font-bold text-ktip-sand-900">
              Pre-Register for KTIP
            </h2>
            <p class="text-ktip-sand-600 text-sm mt-1">
              Join the Caribbean's premier innovation and collaboration platform
            </p>
          </div>

          {/* Step indicators */}
          <div class="flex items-center justify-center gap-2 mb-6">
            <div class={`h-1.5 w-12 transition-colors ${step() >= 1 ? 'bg-ktip-ocean-600' : 'bg-ktip-sand-200'}`} />
            <div class={`h-1.5 w-12 transition-colors ${step() >= 2 ? 'bg-ktip-ocean-600' : 'bg-ktip-sand-200'}`} />
          </div>

          {/* Error */}
          <Show when={errorMsg()}>
            <div class="mb-4 bg-red-600 text-white px-4 py-3 text-sm">
              {errorMsg()}
            </div>
          </Show>

          {/* Step 1: Basic Info */}
          <Show when={step() === 1}>
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-ktip-sand-700 mb-1">Full Name *</label>
                <div class="relative">
                  <User size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-ktip-sand-400" />
                  <input
                    type="text"
                    value={displayName()}
                    onInput={(e) => setDisplayName(e.currentTarget.value)}
                    placeholder="Your full name"
                    class="w-full pl-9 pr-4 py-2.5 border border-ktip-sand-300 bg-white focus:border-ktip-ocean-600 focus:ring-2 focus:ring-ktip-ocean-600 focus:outline-none text-sm"
                  />
                </div>
              </div>

              <div>
                <label class="block text-sm font-medium text-ktip-sand-700 mb-1">Email *</label>
                <div class="relative">
                  <Mail size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-ktip-sand-400" />
                  <input
                    type="email"
                    value={email()}
                    onInput={(e) => setEmail(e.currentTarget.value)}
                    placeholder="you@example.com"
                    class="w-full pl-9 pr-4 py-2.5 border border-ktip-sand-300 bg-white focus:border-ktip-ocean-600 focus:ring-2 focus:ring-ktip-ocean-600 focus:outline-none text-sm"
                  />
                </div>
              </div>

              <div>
                <label class="block text-sm font-medium text-ktip-sand-700 mb-1">Country</label>
                <div class="relative">
                  <MapPin size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-ktip-sand-400" />
                  <select
                    value={country()}
                    onChange={(e) => setCountry(e.currentTarget.value)}
                    class="w-full pl-9 pr-4 py-2.5 border border-ktip-sand-300 bg-white focus:border-ktip-ocean-600 focus:ring-2 focus:ring-ktip-ocean-600 focus:outline-none text-sm appearance-none"
                  >
                    <option value="">Select your country</option>
                    <For each={[...CARIBBEAN_COUNTRIES]}>
                      {(c) => <option value={c}>{c}</option>}
                    </For>
                  </select>
                </div>
              </div>

              <div>
                <label class="block text-sm font-medium text-ktip-sand-700 mb-2">I want to join as *</label>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <For each={PREREG_ROLES}>
                    {(r) => (
                      <button
                        type="button"
                        onClick={() => setRole(r.value)}
                        class={`text-left p-3 border-2 transition-colors ${
                          role() === r.value
                            ? 'border-ktip-ocean-600 bg-ktip-ocean-600 text-white'
                            : 'border-ktip-sand-300 hover:border-ktip-sand-400 bg-white'
                        }`}
                      >
                        <p class={`font-medium text-sm ${role() === r.value ? 'text-white' : 'text-ktip-sand-900'}`}>{r.label}</p>
                        <p class={`text-xs mt-0.5 ${role() === r.value ? 'text-white/80' : 'text-ktip-sand-500'}`}>{r.description}</p>
                      </button>
                    )}
                  </For>
                </div>
              </div>

              <div class="flex justify-end pt-2">
                <Button
                  onClick={handleStep1Complete}
                  disabled={!canProceedStep1()}
                  class="!rounded-none"
                >
                  Continue
                </Button>
              </div>
            </div>
          </Show>

          {/* Step 2: Profile Details */}
          <Show when={step() === 2}>
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-ktip-sand-700 mb-1">Organization / Institution</label>
                <div class="relative">
                  <Briefcase size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-ktip-sand-400" />
                  <input
                    type="text"
                    value={organization()}
                    onInput={(e) => setOrganization(e.currentTarget.value)}
                    placeholder="Where do you work or study?"
                    class="w-full pl-9 pr-4 py-2.5 border border-ktip-sand-300 bg-white focus:border-ktip-ocean-600 focus:ring-2 focus:ring-ktip-ocean-600 focus:outline-none text-sm"
                  />
                </div>
              </div>

              <div>
                <label class="block text-sm font-medium text-ktip-sand-700 mb-1">About You</label>
                <div class="relative">
                  <FileText size={16} class="absolute left-3 top-3 text-ktip-sand-400" />
                  <textarea
                    value={bio()}
                    onInput={(e) => setBio(e.currentTarget.value)}
                    placeholder="Tell us about yourself, your background, and what you hope to achieve on KTIP..."
                    rows={4}
                    maxLength={1000}
                    class="w-full pl-9 pr-4 py-2.5 border border-ktip-sand-300 bg-white focus:border-ktip-ocean-600 focus:ring-2 focus:ring-ktip-ocean-600 focus:outline-none text-sm resize-none"
                  />
                </div>
                <p class="text-xs text-ktip-sand-400 mt-1 text-right">{bio().length}/1000</p>
              </div>

              <div>
                <label class="block text-sm font-medium text-ktip-sand-700 mb-1">Skills / Expertise</label>
                <div class="flex gap-2">
                  <input
                    type="text"
                    value={skillInput()}
                    onInput={(e) => setSkillInput(e.currentTarget.value)}
                    onKeyDown={handleSkillKeyDown}
                    placeholder="Type a skill and press Enter"
                    class="flex-1 px-3 py-2 border border-ktip-sand-300 bg-white focus:border-ktip-ocean-600 focus:ring-2 focus:ring-ktip-ocean-600 focus:outline-none text-sm"
                  />
                  <Button variant="outline" size="sm" onClick={addSkill} disabled={!skillInput().trim()} class="!rounded-none">
                    Add
                  </Button>
                </div>
                <Show when={skills().length > 0}>
                  <div class="flex flex-wrap gap-1.5 mt-2">
                    <For each={skills()}>
                      {(skill) => (
                        <span class="inline-flex items-center gap-1 px-2.5 py-1 bg-ktip-ocean-600 text-white text-xs font-medium">
                          {skill}
                          <button
                            type="button"
                            onClick={() => removeSkill(skill)}
                            class="hover:text-red-300 transition-colors"
                          >
                            <X size={12} />
                          </button>
                        </span>
                      )}
                    </For>
                  </div>
                </Show>
              </div>

              <div>
                <label class="block text-sm font-medium text-ktip-sand-700 mb-1">LinkedIn Profile</label>
                <div class="relative">
                  <Link size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-ktip-sand-400" />
                  <input
                    type="url"
                    value={linkedinUrl()}
                    onInput={(e) => setLinkedinUrl(e.currentTarget.value)}
                    placeholder="https://linkedin.com/in/yourprofile"
                    class="w-full pl-9 pr-4 py-2.5 border border-ktip-sand-300 bg-white focus:border-ktip-ocean-600 focus:ring-2 focus:ring-ktip-ocean-600 focus:outline-none text-sm"
                  />
                </div>
              </div>

              <div class="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setStep(1)} class="!rounded-none">
                  Back
                </Button>
                <Button onClick={handleSubmit} loading={loading()} class="!rounded-none">
                  Submit Application
                </Button>
              </div>
            </div>
          </Show>
        </div>
      </Show>
    </Modal>
  )
}
