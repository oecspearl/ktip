import { useState } from 'react'
import { BadgeCheck, Building2, Clock, ShieldX } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Trans, useLingui } from '@lingui/react/macro'
import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Textarea } from '../ui/Textarea'
import { useToast } from '../../contexts/ToastContext'
import { useAuth } from '../../contexts/AuthContext'
import { useCountries } from '../../hooks/useInstitutions'
import { supabase } from '../../lib/supabase'
import { keys } from '../../queries/keys'
import { slugify } from '../../lib/slug'
import type { Employer } from '../../types'

const STATUS_COPY: Record<string, { title: MessageDescriptor; body: MessageDescriptor; tone: string }> = {
  pending: {
    title: msg`Waiting for your business association`,
    body: msg`Your business association is checking your details against the company registry. We'll let you know when they decide.`,
    tone: 'bg-ktip-sun-50 border-ktip-sun-200 text-ktip-sun-800',
  },
  verified: {
    title: msg`Verified business`,
    body: msg`Your business is verified. You can post industry projects, offer mentorship, and access private-sector grants.`,
    tone: 'bg-ktip-tropical-50 border-ktip-tropical-200 text-ktip-tropical-800',
  },
  rejected: {
    title: msg`Not accepted`,
    body: msg`Your business association did not accept this submission. Contact them to sort it out before you submit again.`,
    tone: 'bg-red-50 border-red-200 text-red-700',
  },
  revoked: {
    title: msg`Verification withdrawn`,
    body: msg`Your business is no longer verified. Contact your business association for details.`,
    tone: 'bg-red-50 border-red-200 text-red-700',
  },
}

const SELECT_CLASS =
  'w-full border border-ktip-sand-200 rounded-lg px-3 py-2 text-sm bg-ktip-cream focus:outline-hidden focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500'

/**
 * The business half of the Verification tab: register the business with its
 * business association, then follow the decision. Was the whole of
 * /sme/verification (ChamberOnboardingPage), which now redirects to the tab.
 *
 * The caller decides who sees it: organisation accounts only. A person has no
 * company to register.
 */
export function BusinessVerificationCard() {
  const { t, i18n } = useLingui()
  const auth = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()

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

  const handleSubmit = async () => {
    if (!auth.user) return
    if (!form.legal_name.trim() || !form.country_code || !form.contact_email.trim()) {
      toast.error(t`Legal name, member state and contact email are required`)
      return
    }

    setSaving(true)
    try {
      const { error } = await (supabase as any).from('employers').insert({
        // employers.slug is written here rather than by a trigger, and the
        // column caps at 60. The country code is what tells apart two
        // businesses sharing a name across member states.
        slug: `${slugify(form.legal_name).slice(0, 60)}-${form.country_code.toLowerCase()}`,
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

      toast.success(t`Sent to your business association`)
      await queryClient.invalidateQueries({ queryKey: keys.all('employers') })
    } catch (err: any) {
      toast.error(err.message || t`Failed to submit`)
    } finally {
      setSaving(false)
    }
  }

  const status = submission?.verification_status
  const statusCopy = status ? STATUS_COPY[status] : null

  if (isPending) {
    return (
      <Card>
        <p className="text-sm text-ktip-sand-500 py-6 text-center"><Trans>Loading…</Trans></p>
      </Card>
    )
  }

  if (submission && statusCopy) {
    return (
      <Card>
        <div className={`flex items-start gap-3 p-4 rounded-xl border ${statusCopy.tone}`}>
          {status === 'verified' ? (
            <BadgeCheck size={20} className="mt-0.5 shrink-0" />
          ) : status === 'pending' ? (
            <Clock size={20} className="mt-0.5 shrink-0" />
          ) : (
            <ShieldX size={20} className="mt-0.5 shrink-0" />
          )}
          <div>
            <p className="font-medium">{i18n._(statusCopy.title)}</p>
            <p className="text-sm mt-1">{i18n._(statusCopy.body)}</p>
          </div>
        </div>

        <dl className="mt-4 grid sm:grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-ktip-sand-500"><Trans>Legal name</Trans></dt>
            <dd className="text-ktip-sand-900">{submission.legal_name}</dd>
          </div>
          <div>
            <dt className="text-ktip-sand-500"><Trans>Member state</Trans></dt>
            <dd className="text-ktip-sand-900">{submission.country_code}</dd>
          </div>
          {submission.registration_number && (
            <div>
              <dt className="text-ktip-sand-500"><Trans>Registration number</Trans></dt>
              <dd className="text-ktip-sand-900">{submission.registration_number}</dd>
            </div>
          )}
        </dl>

        <p className="text-xs text-ktip-sand-500 mt-4">
          <Trans>You can't edit these details after you submit, so a verified badge never sits on details nobody checked. To correct something, contact your business association.</Trans>
        </p>
      </Card>
    )
  }

  return (
    <Card>
      <div className="flex items-center gap-2 mb-1">
        <Building2 size={18} className="text-ktip-ocean-600" />
        <h3 className="text-lg font-display font-bold text-ktip-sand-900"><Trans>Register your business</Trans></h3>
      </div>
      <p className="text-sm text-ktip-sand-600 mb-5">
        <Trans>We send your details to the business association for the member state you pick. They check them against the national company registry.</Trans>
      </p>

      <div data-tutorial="business-verification-form" className="space-y-4">
        <Input
          label={t`Registered legal name`}
          value={form.legal_name}
          onChange={(e) => setForm({ ...form, legal_name: e.target.value })}
          fullWidth
        />

        <Input
          label={t`Trading name (optional)`}
          value={form.trading_name}
          onChange={(e) => setForm({ ...form, trading_name: e.target.value })}
          fullWidth
        />

        <div>
          <label htmlFor="business-verification-country" className="block text-sm font-medium text-ktip-sand-700 mb-1">
            <Trans>OECS member state</Trans>
          </label>
          <select
            id="business-verification-country"
            value={form.country_code}
            onChange={(e) => setForm({ ...form, country_code: e.target.value })}
            className={SELECT_CLASS}
          >
            <option value="">{t`Select a member state`}</option>
            {countries?.map((country) => (
              <option key={country.code} value={country.code}>
                {country.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-ktip-sand-500 mt-1">
            <Trans>This decides which association reviews you. You can't change it later.</Trans>
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <Input
            label={t`Company registration number`}
            value={form.registration_number}
            onChange={(e) => setForm({ ...form, registration_number: e.target.value })}
            fullWidth
          />
          <Input
            label={t`Industry`}
            value={form.industry}
            onChange={(e) => setForm({ ...form, industry: e.target.value })}
            fullWidth
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <Input
            label={t`Contact email`}
            type="email"
            value={form.contact_email}
            onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
            fullWidth
          />
          <Input
            label={t`Contact phone`}
            value={form.contact_phone}
            onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
            fullWidth
          />
        </div>

        <Input
          label={t`Website`}
          value={form.website_url}
          onChange={(e) => setForm({ ...form, website_url: e.target.value })}
          fullWidth
        />

        <Textarea
          label={t`What does the business do?`}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={4}
          fullWidth
        />

        <div className="flex justify-end pt-4 border-t border-ktip-sand-100">
          <Button loading={saving} onClick={handleSubmit}>
            <Trans>Submit to your business association</Trans>
          </Button>
        </div>
      </div>
    </Card>
  )
}
