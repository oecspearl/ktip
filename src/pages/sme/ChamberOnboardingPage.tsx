import { useState } from 'react'
import { Navigate } from 'react-router'
import { BadgeCheck, Building2, Clock, ShieldX } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Textarea } from '../../components/ui/Textarea'
import { PageHero } from '../../components/layout/PageHero'
import { usePageTitle } from '../../hooks/usePageTitle'
import { useToast } from '../../contexts/ToastContext'
import { useAuth } from '../../contexts/AuthContext'
import { useCountries } from '../../hooks/useInstitutions'
import { supabase } from '../../lib/supabase'
import { keys } from '../../queries/keys'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Employer } from '../../types'

const STATUS_COPY: Record<string, { title: string; body: string; tone: string }> = {
  pending: {
    title: 'Awaiting Chamber review',
    body: 'Your National Chamber of Commerce is checking your submission against the corporate registry. You will be notified when a decision is made.',
    tone: 'bg-ktip-sun-50 border-ktip-sun-200 text-ktip-sun-800',
  },
  verified: {
    title: 'Verified SME',
    body: 'Your business is verified. You can post industry projects, offer mentorship, and access private-sector grants.',
    tone: 'bg-ktip-tropical-50 border-ktip-tropical-200 text-ktip-tropical-800',
  },
  rejected: {
    title: 'Not approved',
    body: 'Your Chamber did not approve this submission. Contact them directly to resolve it before resubmitting.',
    tone: 'bg-red-50 border-red-200 text-red-700',
  },
  revoked: {
    title: 'Verification withdrawn',
    body: 'Your verified status has been withdrawn. Contact your Chamber of Commerce for details.',
    tone: 'bg-red-50 border-red-200 text-red-700',
  },
}

export default function ChamberOnboardingPage() {
  const auth = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()

  usePageTitle('Chamber verification')

  const { countries } = useCountries(true)

  // The registrant's own submission. RLS scopes this to created_by = auth.uid().
  const { data: submission, isPending } = useQuery({
    queryKey: keys.sub('employers', 'mine', auth.user?.id),
    queryFn: async (): Promise<Employer | null> => {
      const { data, error } = await (supabase as any)
        .from('employers')
        .select('*')
        .eq('created_by', auth.user!.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) throw error
      return (data as Employer) || null
    },
    enabled: !!auth.user?.id,
  })

  const [form, setForm] = useState({
    legal_name: '',
    trading_name: '',
    country_code: '',
    industry: '',
    registration_number: '',
    contact_email: '',
    contact_phone: '',
    website_url: '',
    description: '',
  })
  const [saving, setSaving] = useState(false)

  if (!auth.loading && !auth.user) {
    return <Navigate to="/login" replace />
  }

  const slugify = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60)

  const handleSubmit = async () => {
    if (!auth.user) return
    if (!form.legal_name.trim() || !form.country_code || !form.contact_email.trim()) {
      toast.error('Legal name, member state and contact email are required')
      return
    }

    setSaving(true)
    try {
      const { error } = await (supabase as any).from('employers').insert({
        slug: `${slugify(form.legal_name)}-${form.country_code.toLowerCase()}`,
        legal_name: form.legal_name.trim(),
        trading_name: form.trading_name.trim() || null,
        country_code: form.country_code,
        industry: form.industry || null,
        registration_number: form.registration_number.trim() || null,
        contact_email: form.contact_email.trim().toLowerCase(),
        contact_phone: form.contact_phone.trim() || null,
        website_url: form.website_url.trim() || null,
        description: form.description.trim() || null,
        verification_status: 'pending',
        created_by: auth.user.id,
      })

      if (error) throw error

      toast.success('Submitted to your Chamber of Commerce')
      await queryClient.invalidateQueries({ queryKey: keys.all('employers') })
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit')
    } finally {
      setSaving(false)
    }
  }

  const status = submission?.verification_status
  const statusCopy = status ? STATUS_COPY[status] : null

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-[calc(var(--nav-h)+1.5rem)] pb-12">
      <PageHero
        compact
        eyebrow="Private sector"
        title="Chamber of Commerce verification"
        subtitle="Get your business vetted by your National Chamber to unlock SME features"
        imageSeed="chamber-onboarding"
      />

      {isPending && <p className="text-ktip-sand-500">Loading…</p>}

      {!isPending && submission && statusCopy && (
        <Card className="mb-6">
          <div className={`flex items-start gap-3 p-4 rounded-xl border ${statusCopy.tone}`}>
            {status === 'verified' ? (
              <BadgeCheck size={20} className="mt-0.5 flex-shrink-0" />
            ) : status === 'pending' ? (
              <Clock size={20} className="mt-0.5 flex-shrink-0" />
            ) : (
              <ShieldX size={20} className="mt-0.5 flex-shrink-0" />
            )}
            <div>
              <p className="font-medium">{statusCopy.title}</p>
              <p className="text-sm mt-1">{statusCopy.body}</p>
            </div>
          </div>

          <dl className="mt-4 grid sm:grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-ktip-sand-500">Legal name</dt>
              <dd className="text-ktip-sand-900">{submission.legal_name}</dd>
            </div>
            <div>
              <dt className="text-ktip-sand-500">Member state</dt>
              <dd className="text-ktip-sand-900">{submission.country_code}</dd>
            </div>
            {submission.registration_number && (
              <div>
                <dt className="text-ktip-sand-500">Registration number</dt>
                <dd className="text-ktip-sand-900">{submission.registration_number}</dd>
              </div>
            )}
          </dl>

          <p className="text-xs text-ktip-sand-500 mt-4">
            Details cannot be edited after submission — a record that could change after review would
            carry a verified badge over unchecked data. Contact your Chamber to make corrections.
          </p>
        </Card>
      )}

      {!isPending && !submission && (
        <Card>
          <div className="flex items-center gap-2 mb-1">
            <Building2 size={18} className="text-ktip-ocean-600" />
            <h2 className="text-lg font-display font-bold text-ktip-sand-900">Register your business</h2>
          </div>
          <p className="text-sm text-ktip-sand-600 mb-5">
            Your submission is routed to the Chamber of Commerce for the member state you select.
            They check it against the national corporate registry.
          </p>

          <div data-tutorial="chamber-form" className="space-y-4">
            <Input
              label="Registered legal name"
              value={form.legal_name}
              onChange={(e) => setForm({ ...form, legal_name: e.target.value })}
              fullWidth
            />

            <Input
              label="Trading name (optional)"
              value={form.trading_name}
              onChange={(e) => setForm({ ...form, trading_name: e.target.value })}
              fullWidth
            />

            <div>
              <label className="block text-sm font-medium text-ktip-sand-700 mb-1">
                OECS member state
              </label>
              <select
                value={form.country_code}
                onChange={(e) => setForm({ ...form, country_code: e.target.value })}
                className="w-full border border-ktip-sand-200 rounded-lg px-3 py-2 text-sm bg-ktip-cream focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500"
              >
                <option value="">Select a member state</option>
                {countries?.map((country) => (
                  <option key={country.code} value={country.code}>
                    {country.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-ktip-sand-500 mt-1">
                This determines which Chamber reviews you. It cannot be changed later.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <Input
                label="Company registration number"
                value={form.registration_number}
                onChange={(e) => setForm({ ...form, registration_number: e.target.value })}
                fullWidth
              />
              <Input
                label="Industry"
                value={form.industry}
                onChange={(e) => setForm({ ...form, industry: e.target.value })}
                fullWidth
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <Input
                label="Contact email"
                type="email"
                value={form.contact_email}
                onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                fullWidth
              />
              <Input
                label="Contact phone"
                value={form.contact_phone}
                onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
                fullWidth
              />
            </div>

            <Input
              label="Website"
              value={form.website_url}
              onChange={(e) => setForm({ ...form, website_url: e.target.value })}
              fullWidth
            />

            <Textarea
              label="What does the business do?"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={4}
              fullWidth
            />

            <div className="flex justify-end pt-4 border-t border-ktip-sand-100">
              <Button loading={saving} onClick={handleSubmit}>
                Submit to Chamber
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
