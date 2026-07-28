import { useState } from 'react'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import { useSubmitPreregistration } from '../hooks/usePreregistrations'
import { analytics } from '../hooks/useAnalytics'
import { CARIBBEAN_COUNTRIES, SELECTABLE_ROLES } from '../lib/constants'
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
} from 'lucide-react'

const PREREG_ROLES = SELECTABLE_ROLES

interface PreRegistrationModalProps {
  open: boolean
  onClose: () => void
}

export function PreRegistrationModal(props: PreRegistrationModalProps) {
  const { submit, loading } = useSubmitPreregistration()

  // Form state
  const [step, setStep] = useState<1 | 2>(1)
  const [success, setSuccess] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // Step 1: Basic info
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [country, setCountry] = useState('')
  const [role, setRole] = useState('')

  // Step 2: Profile details
  const [organization, setOrganization] = useState('')
  const [bio, setBio] = useState('')
  const [skillInput, setSkillInput] = useState('')
  const [skills, setSkills] = useState<string[]>([])
  const [linkedinUrl, setLinkedinUrl] = useState('')

  const addSkill = () => {
    const s = skillInput.trim()
    if (s && !skills.includes(s) && skills.length < 10) {
      setSkills(prev => [...prev, s])
      setSkillInput('')
    }
  }

  const removeSkill = (skill: string) => {
    setSkills(prev => prev.filter(s => s !== skill))
  }

  const handleSkillKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addSkill()
    }
  }

  const canProceedStep1 = displayName.trim() && email.trim() && role

  const handleStep1Complete = () => {
    analytics.funnel('prereg', 'step_1_complete', { role })
    setStep(2)
  }

  const handleSubmit = async () => {
    setErrorMsg('')
    analytics.funnel('prereg', 'submit_attempt', { role })

    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErrorMsg('Please enter a valid email address.')
      setStep(1)
      return
    }

    try {
      await submit({
        email: email.trim(),
        display_name: displayName.trim(),
        country: country || undefined,
        bio: bio.trim() || undefined,
        organization: organization.trim() || undefined,
        role,
        skills: skills.length > 0 ? skills : undefined,
        linkedin_url: linkedinUrl.trim() || undefined,
      })
      setSuccess(true)
      analytics.conversion('prereg_submitted', { role, country })
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to submit. Please try again.')
      analytics.funnel('prereg', 'submit_error', { error: err.message })
    }
  }

  const handleClose = () => {
    if (!success) analytics.funnel('prereg', 'modal_dismissed', { step })
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
    <Modal open={props.open} onClose={handleClose} title="" size="lg" className="!rounded-none">
      {success ? (
        <div className="text-center py-8">
          <div className="w-16 h-16 bg-ktip-tropical-600 flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={32} className="text-white" />
          </div>
          <h2 className="text-2xl font-display font-bold text-ktip-sand-900 mb-2">
            Application Submitted
          </h2>
          <p className="text-ktip-sand-600 mb-6 max-w-md mx-auto">
            Thank you for your interest in KTIP! Your pre-registration has been received.
            An administrator will review your application and you'll receive an email with your login credentials once approved.
          </p>
          <Button onClick={handleClose} className="!rounded-none">
            Close
          </Button>
        </div>
      ) : (
        <div>
          {/* Header */}
          <div className="text-center mb-6">
            <div className="w-14 h-14 bg-ktip-ocean-600 flex items-center justify-center mx-auto mb-3">
              <Sparkles size={28} className="text-white" />
            </div>
            <h2 className="text-2xl font-display font-bold text-ktip-sand-900">
              Pre-Register for KTIP
            </h2>
            <p className="text-ktip-sand-600 text-sm mt-1">
              Join the Caribbean's premier innovation and collaboration platform
            </p>
          </div>

          {/* Step indicators */}
          <div className="flex items-center justify-center gap-2 mb-6">
            <div className={`h-1.5 w-12 transition-colors ${step >= 1 ? 'bg-ktip-ocean-600' : 'bg-ktip-sand-200'}`} />
            <div className={`h-1.5 w-12 transition-colors ${step >= 2 ? 'bg-ktip-ocean-600' : 'bg-ktip-sand-200'}`} />
          </div>

          {/* Error */}
          {errorMsg && (
            <div className="mb-4 bg-red-600 text-white px-4 py-3 text-sm">
              {errorMsg}
            </div>
          )}

          {/* Step 1: Basic Info */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ktip-sand-700 mb-1">Full Name *</label>
                <div className="relative">
                  <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ktip-sand-400" />
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.currentTarget.value)}
                    placeholder="Your full name"
                    className="w-full pl-9 pr-4 py-2.5 border border-ktip-sand-300 bg-ktip-cream focus:border-ktip-ocean-600 focus:ring-2 focus:ring-ktip-ocean-600 focus:outline-none text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-ktip-sand-700 mb-1">Email *</label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ktip-sand-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.currentTarget.value)}
                    placeholder="you@example.com"
                    className="w-full pl-9 pr-4 py-2.5 border border-ktip-sand-300 bg-ktip-cream focus:border-ktip-ocean-600 focus:ring-2 focus:ring-ktip-ocean-600 focus:outline-none text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-ktip-sand-700 mb-1">Country</label>
                <div className="relative">
                  <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ktip-sand-400" />
                  <select
                    value={country}
                    onChange={(e) => setCountry(e.currentTarget.value)}
                    className="w-full pl-9 pr-4 py-2.5 border border-ktip-sand-300 bg-ktip-cream focus:border-ktip-ocean-600 focus:ring-2 focus:ring-ktip-ocean-600 focus:outline-none text-sm appearance-none"
                  >
                    <option value="">Select your country</option>
                    {[...CARIBBEAN_COUNTRIES].map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-ktip-sand-700 mb-2">I want to join as *</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {PREREG_ROLES.map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setRole(r.value)}
                      className={`text-left p-3 border-2 transition-colors ${
                        role === r.value
                          ? 'border-ktip-ocean-600 bg-ktip-ocean-600 text-white'
                          : 'border-ktip-sand-300 hover:border-ktip-sand-400 bg-ktip-cream'
                      }`}
                    >
                      <p className={`font-medium text-sm ${role === r.value ? 'text-white' : 'text-ktip-sand-900'}`}>{r.label}</p>
                      <p className={`text-xs mt-0.5 ${role === r.value ? 'text-white/80' : 'text-ktip-sand-500'}`}>{r.description}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  onClick={handleStep1Complete}
                  disabled={!canProceedStep1}
                  className="!rounded-none"
                >
                  Continue
                </Button>
              </div>
            </div>
          )}

          {/* Step 2: Profile Details */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ktip-sand-700 mb-1">Organization / Institution</label>
                <div className="relative">
                  <Briefcase size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ktip-sand-400" />
                  <input
                    type="text"
                    value={organization}
                    onChange={(e) => setOrganization(e.currentTarget.value)}
                    placeholder="Where do you work or study?"
                    className="w-full pl-9 pr-4 py-2.5 border border-ktip-sand-300 bg-ktip-cream focus:border-ktip-ocean-600 focus:ring-2 focus:ring-ktip-ocean-600 focus:outline-none text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-ktip-sand-700 mb-1">About You</label>
                <div className="relative">
                  <FileText size={16} className="absolute left-3 top-3 text-ktip-sand-400" />
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.currentTarget.value)}
                    placeholder="Tell us about yourself, your background, and what you hope to achieve on KTIP..."
                    rows={4}
                    maxLength={1000}
                    className="w-full pl-9 pr-4 py-2.5 border border-ktip-sand-300 bg-ktip-cream focus:border-ktip-ocean-600 focus:ring-2 focus:ring-ktip-ocean-600 focus:outline-none text-sm resize-none"
                  />
                </div>
                <p className="text-xs text-ktip-sand-400 mt-1 text-right">{bio.length}/1000</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-ktip-sand-700 mb-1">Skills / Expertise</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={skillInput}
                    onChange={(e) => setSkillInput(e.currentTarget.value)}
                    onKeyDown={handleSkillKeyDown}
                    placeholder="Type a skill and press Enter"
                    className="flex-1 px-3 py-2 border border-ktip-sand-300 bg-ktip-cream focus:border-ktip-ocean-600 focus:ring-2 focus:ring-ktip-ocean-600 focus:outline-none text-sm"
                  />
                  <Button variant="outline" size="sm" onClick={addSkill} disabled={!skillInput.trim()} className="!rounded-none">
                    Add
                  </Button>
                </div>
                {skills.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {skills.map((skill) => (
                      <span key={skill} className="inline-flex items-center gap-1 px-2.5 py-1 bg-ktip-ocean-600 text-white text-xs font-medium">
                        {skill}
                        <button
                          type="button"
                          onClick={() => removeSkill(skill)}
                          className="hover:text-red-300 transition-colors"
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-ktip-sand-700 mb-1">LinkedIn Profile</label>
                <div className="relative">
                  <Link size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ktip-sand-400" />
                  <input
                    type="url"
                    value={linkedinUrl}
                    onChange={(e) => setLinkedinUrl(e.currentTarget.value)}
                    placeholder="https://linkedin.com/in/yourprofile"
                    className="w-full pl-9 pr-4 py-2.5 border border-ktip-sand-300 bg-ktip-cream focus:border-ktip-ocean-600 focus:ring-2 focus:ring-ktip-ocean-600 focus:outline-none text-sm"
                  />
                </div>
              </div>

              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setStep(1)} className="!rounded-none">
                  Back
                </Button>
                <Button onClick={handleSubmit} loading={loading} className="!rounded-none">
                  Submit Application
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
