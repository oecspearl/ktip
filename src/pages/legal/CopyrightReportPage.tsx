import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { CheckCircle2, Flag, ShieldAlert } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { PageHero } from '../../components/layout/PageHero'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Textarea } from '../../components/ui/Textarea'
import { usePageTitle } from '../../hooks/usePageTitle'
import { useAuth } from '../../contexts/AuthContext'
import { LEGAL_TOKENS } from '../../lib/legal'

/**
 * The infringement notice form.
 *
 * PUBLIC and unauthenticated on purpose, and that is the whole design
 * constraint. A copyright notice arrives from a rightsholder who has no KTIP
 * account — a photographer, a label, a company's lawyer — so this cannot sit
 * behind ProtectedRoute, cannot be an RPC (there is no `auth.uid()`), and cannot
 * write through RLS. It posts to an edge function that holds the service key.
 *
 * The three statutory affirmations are three separate checkboxes because they
 * are three separate statements. One combined tick is not evidence that each was
 * made, and each is the one a bad-faith filer would later claim they never read.
 */
export default function CopyrightReportPage() {
  const { t } = useLingui()
  usePageTitle(t`Report infringement`)

  const auth = useAuth()
  const [params] = useSearchParams()

  // Prefilled by the "Report infringement" link on a content page, so the
  // claimant does not have to copy a URL by hand and get it wrong.
  const [targetUrl, setTargetUrl] = useState(params.get('url') ?? '')
  const targetType = params.get('type') ?? ''
  const targetId = params.get('id') ?? ''

  const [claimantName, setClaimantName] = useState(auth.profile?.display_name ?? '')
  const [claimantEmail, setClaimantEmail] = useState(auth.user?.email ?? '')
  const [claimantOrg, setClaimantOrg] = useState('')
  const [claimantRole, setClaimantRole] = useState<'owner' | 'authorised_agent'>('owner')
  const [workDescription, setWorkDescription] = useState('')
  const [infringementDetail, setInfringementDetail] = useState('')

  const [swornGoodFaith, setSwornGoodFaith] = useState(false)
  const [swornAccuracy, setSwornAccuracy] = useState(false)
  const [swornAuthority, setSwornAuthority] = useState(false)

  const [pending, setPending] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [reference, setReference] = useState<string | null>(null)

  const allSworn = swornGoodFaith && swornAccuracy && swornAuthority
  const complete =
    claimantName.trim().length > 1 &&
    /.+@.+\..+/.test(claimantEmail) &&
    targetUrl.trim().length > 0 &&
    workDescription.trim().length > 10 &&
    infringementDetail.trim().length > 10

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!complete || !allSworn || pending) return

    setPending(true)
    setErrorMessage('')
    try {
      const response = await fetch('/api/legal/takedown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'takedown',
          claimant_name: claimantName.trim(),
          claimant_email: claimantEmail.trim(),
          claimant_org: claimantOrg.trim() || null,
          claimant_role: claimantRole,
          target_type: targetType || null,
          target_id: targetId || null,
          target_url: targetUrl.trim(),
          work_description: workDescription.trim(),
          infringement_detail: infringementDetail.trim(),
          sworn_good_faith: swornGoodFaith,
          sworn_accuracy: swornAccuracy,
          sworn_authority: swornAuthority,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || t`We could not file your notice. Please try again.`)
      }
      setReference(data.reference ?? null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(false)
    }
  }

  if (reference) {
    return (
      <>
        <PageHero
          eyebrow={t`Legal`}
          title={t`Notice received`}
          imageSeed="legal"
          compact
          breadcrumb={[
            { label: t`Home`, href: '/' },
            { label: t`Legal`, href: '/legal' },
            { label: t`Report infringement` },
          ]}
        />
        <div className="w-full max-w-page mx-auto px-4 py-10">
          <div className="max-w-legal rounded-surface border border-ktip-sand-200 bg-ktip-cream p-6">
            <CheckCircle2 size={28} aria-hidden className="text-ktip-tropical-600" />
            <h2 className="mt-3 font-display text-title-sm font-bold text-ktip-sand-900">
              <Trans>Your notice has been received</Trans>
            </h2>
            <p className="mt-2 text-body leading-relaxed text-ktip-sand-700">
              <Trans>
                Your reference is <strong>{reference}</strong>. We have emailed a copy to{' '}
                {claimantEmail}. Quote the reference in any follow-up.
              </Trans>
            </p>
            <p className="mt-3 text-body leading-relaxed text-ktip-sand-700">
              <Trans>
                We will review the notice and tell you the outcome. If we act on it, the member who
                posted the content is told what was removed, why, and who filed the notice — they
                cannot answer a complaint they cannot see.
              </Trans>
            </p>
            <Link
              to="/legal/copyright"
              className="mt-4 inline-block text-body font-semibold text-ktip-ocean-700 hover:underline underline-offset-2"
            >
              <Trans>Read the full Copyright & Takedown Policy</Trans>
            </Link>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <PageHero
        eyebrow={t`Legal`}
        title={t`Report infringement`}
        subtitle={t`If work you own has been published on KTIP without your permission, file a notice here. You do not need a KTIP account.`}
        imageSeed="legal"
        compact
        breadcrumb={[
          { label: t`Home`, href: '/' },
          { label: t`Legal`, href: '/legal' },
          { label: t`Report infringement` },
        ]}
      />

      <div className="w-full max-w-page mx-auto px-4 py-10">
        <form onSubmit={handleSubmit} className="max-w-legal space-y-8">
          <div className="flex gap-3 rounded-surface border border-ktip-ocean-200 bg-ktip-ocean-50 p-4">
            <ShieldAlert size={18} aria-hidden className="mt-0.5 shrink-0 text-ktip-ocean-600" />
            <p className="text-body leading-relaxed text-ktip-sand-800">
              <Trans>
                Use this form for copyright, trade mark and design-right complaints. For
                harassment, impersonation, fraud, or anything involving a minor, use the report
                control on the content itself — that reaches a queue which is triaged faster.
              </Trans>
            </p>
          </div>

          <section className="space-y-4">
            <h2 className="font-display text-title-sm font-bold text-ktip-sand-900">
              <Trans>About you</Trans>
            </h2>
            <Input
              label={t`Your full name`}
              value={claimantName}
              onChange={(e) => setClaimantName(e.target.value)}
              required
              fullWidth
            />
            <Input
              label={t`Your email address`}
              type="email"
              value={claimantEmail}
              onChange={(e) => setClaimantEmail(e.target.value)}
              helperText={t`We send the acknowledgement and the outcome here.`}
              required
              fullWidth
            />
            <Input
              label={t`Organisation (optional)`}
              value={claimantOrg}
              onChange={(e) => setClaimantOrg(e.target.value)}
              fullWidth
            />

            <fieldset>
              <legend className="mb-2 text-label font-semibold text-ktip-sand-800">
                <Trans>You are filing as</Trans>
              </legend>
              <div className="space-y-2">
                {(
                  [
                    ['owner', t`The owner of the right`],
                    ['authorised_agent', t`An agent authorised to act for the owner`],
                  ] as const
                ).map(([value, label]) => (
                  <label
                    key={value}
                    className="flex cursor-pointer items-center gap-3 rounded-control border border-ktip-sand-200 p-3 hover:bg-ktip-sand-50"
                  >
                    <input
                      type="radio"
                      name="claimant_role"
                      value={value}
                      checked={claimantRole === value}
                      onChange={() => setClaimantRole(value)}
                      className="h-4 w-4 border-ktip-sand-300 text-ktip-ocean-600 focus:ring-ktip-ocean-500"
                    />
                    <span className="text-body text-ktip-sand-700">{label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </section>

          <section className="space-y-4">
            <h2 className="font-display text-title-sm font-bold text-ktip-sand-900">
              <Trans>The content and the work</Trans>
            </h2>
            <Input
              label={t`Address of the content on KTIP`}
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              helperText={t`One notice per item. Copy the address from your browser's address bar.`}
              required
              fullWidth
            />
            <Textarea
              label={t`Describe the work you own`}
              value={workDescription}
              onChange={(e) => setWorkDescription(e.target.value)}
              helperText={t`Specific enough for us to recognise it — where it was published, when, and by whom.`}
              rows={4}
              required
              fullWidth
            />
            <Textarea
              label={t`Why do you believe it infringes?`}
              value={infringementDetail}
              onChange={(e) => setInfringementDetail(e.target.value)}
              rows={4}
              required
              fullWidth
            />
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-title-sm font-bold text-ktip-sand-900">
              <Trans>Your affirmations</Trans>
            </h2>
            <p className="text-body text-ktip-sand-600">
              <Trans>All three are required. Each is a separate statement.</Trans>
            </p>

            {(
              [
                [
                  swornGoodFaith,
                  setSwornGoodFaith,
                  t`I believe in good faith that this use is not authorised by the owner, an agent, or the law.`,
                ],
                [swornAccuracy, setSwornAccuracy, t`The information in this notice is accurate.`],
                [
                  swornAuthority,
                  setSwornAuthority,
                  t`I am the owner of the right, or I am authorised to act on the owner's behalf.`,
                ],
              ] as const
            ).map(([checked, setChecked, label], index) => (
              <label
                key={index}
                className="flex cursor-pointer items-start gap-3 rounded-control border border-ktip-sand-200 p-3 transition-colors hover:bg-ktip-sand-50"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => setChecked(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-ktip-sand-300 text-ktip-ocean-600 focus:ring-ktip-ocean-500"
                />
                <span className="text-body text-ktip-sand-700">{label}</span>
              </label>
            ))}

            <div className="flex gap-3 rounded-surface border border-ktip-sun-300 bg-ktip-sun-50 p-4">
              <Flag size={18} aria-hidden className="mt-0.5 shrink-0 text-ktip-sun-700" />
              <p className="text-body leading-relaxed text-ktip-sand-800">
                <Trans>
                  A notice made in bad faith — to remove a competitor, to silence criticism, or over
                  work you do not own — may make you liable for the resulting damages, and we will
                  decline further notices from you.
                </Trans>
              </p>
            </div>
          </section>

          {errorMessage && (
            <p role="alert" className="text-body text-red-600">
              {errorMessage}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-4">
            <Button type="submit" loading={pending} disabled={!complete || !allSworn} icon={<Flag size={17} />}>
              <Trans>File this notice</Trans>
            </Button>
            <Link
              to="/legal/copyright"
              className="text-body font-semibold text-ktip-ocean-700 hover:underline underline-offset-2"
            >
              <Trans>Read the policy first</Trans>
            </Link>
          </div>

          <p className="text-caption leading-relaxed text-ktip-sand-500">
            <Trans>
              Your name and the substance of this notice are passed to the member whose content it
              concerns, so that they can respond. Notices are retained for the period set out in the
              Privacy Policy. You can also write to {LEGAL_TOKENS.copyrightEmail} instead of using
              this form.
            </Trans>
          </p>
        </form>
      </div>
    </>
  )
}
