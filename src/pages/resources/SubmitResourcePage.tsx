import { useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { Upload } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { TagInput } from '../../components/ui/TagInput'
import { PageHero } from '../../components/layout/PageHero'
import { ModeratedInput, ModeratedTextarea } from '../../components/moderation/ModeratedField'
import { ContentWarningModal } from '../../components/moderation/ContentWarningModal'
import { ResourceFileField } from '../../components/resources/ResourceFileField'
import { AgreementGateModal, AgreementNotice } from '../../components/legal/AgreementGate'
import { useAgreementGate } from '../../hooks/useAgreementGate'
import { useContentModeration } from '../../hooks/useContentModeration'
import { useSubmitResource } from '../../hooks/useResources'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { usePageTitle } from '../../hooks/usePageTitle'
import { analytics } from '../../hooks/useAnalytics'
import { isPermissionDenied } from '../../lib/utils'
import {
  CONTENT_TAG_SUGGESTIONS,
  RESOURCE_TYPE_LABELS,
  RESOURCE_CATEGORY_LABELS,
} from '../../lib/constants'
import { resolveCopy } from '../../i18n/copy'

/**
 * Member-facing resource submission (migration 135).
 *
 * A whole page rather than a modal, for the same reason CreateProjectPage is:
 * a file, eight fields, a moderation pass and a publishing agreement do not
 * belong in a dialog the browser can dismiss with Escape halfway through.
 *
 * Nothing written here is visible to anyone else. The row lands as
 * `approval_status = 'pending'` and `is_published = false`, and 135's INSERT
 * policy refuses anything else — the copy below says so plainly, because a
 * member who expects their guide to appear immediately will otherwise report
 * the queue as a bug.
 */
export default function SubmitResourcePage() {
  const { t, i18n } = useLingui()
  const auth = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const { submitResource, loading } = useSubmitResource()

  usePageTitle(t`Submit a Resource`)

  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [description, setDescription] = useState('')
  const [resourceType, setResourceType] = useState('guide')
  const [category, setCategory] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [downloadUrl, setDownloadUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [isClimateAction, setIsClimateAction] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [errorMessage, setErrorMessage] = useState('')

  const gate = useAgreementGate('publishing')
  const [gateOpen, setGateOpen] = useState(false)
  // Same trap CreateProjectPage documents: without this the member accepts the
  // agreement, the modal closes, nothing is submitted, and they press Submit a
  // second time reading the whole thing as a bug.
  const resumeAfterGate = useRef(false)

  const moderation = useContentModeration(
    [
      { name: 'title', value: title, label: t`Title` },
      { name: 'summary', value: summary, label: t`Summary` },
      { name: 'description', value: description, label: t`Description`, ai: true },
    ],
    {
      surface: 'resource',
      onChange: (field, next) => {
        if (field === 'title') setTitle(next)
        else if (field === 'summary') setSummary(next)
        else setDescription(next)
      },
    }
  )

  const validate = () => {
    const next: Record<string, string> = {}
    if (title.trim().length < 3) next.title = t`Give it a title of at least 3 characters.`
    if (description.trim().length < 20) {
      next.description = t`Describe the resource in at least 20 characters so a reviewer knows what it is.`
    }
    if (!category) next.category = t`Choose a category.`
    // One or the other, not neither: a library entry that is neither a file nor
    // a link is a title with nothing behind it.
    if (!file && !downloadUrl.trim()) {
      next.file = t`Attach a file or give a link to where the resource lives.`
    }
    if (downloadUrl.trim() && !/^https?:\/\//i.test(downloadUrl.trim())) {
      next.download_url = t`Links must start with http:// or https://`
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setErrorMessage('')
    if (!validate()) return

    // Order copied from CreateProjectPage: cheap checks, then the moderation
    // round trip, then the agreement. There is no point asking someone to
    // accept publishing terms for something that will be rejected for a missing
    // category.
    const moderationResult = await moderation.checkBeforeSubmit()
    if (!moderationResult.ok) {
      setErrors((prev) => ({ ...prev, ...moderationResult.errors }))
      return
    }

    if (gate.needsAgreement) {
      resumeAfterGate.current = true
      setGateOpen(true)
      return
    }

    await submitNow()
  }

  const submitNow = async () => {
    try {
      await submitResource({
        authorId: auth.user!.id,
        title: title.trim(),
        summary: summary.trim() || null,
        description: description.trim(),
        resource_type: resourceType,
        category,
        tags,
        download_url: downloadUrl.trim() || null,
        is_climate_action: isClimateAction,
        file,
      })

      analytics.feature('resource', 'submitted', { resourceType, hasFile: !!file })
      toast.success(t`Thanks — your resource is with the reviewers.`)
      navigate('/resources/my-submissions')
    } catch (error: any) {
      // The route is gated on resource:submit, so RLS should not be the one to
      // refuse — but it still can if the permission was revoked mid-session,
      // and "new row violates row-level security policy" tells a member nothing.
      const message = isPermissionDenied(error)
        ? t`Your role does not include permission to submit resources. Contact your organization if this looks wrong.`
        : error.message || t`Failed to submit the resource`
      toast.error(message)
      setErrorMessage(message)
    }
  }

  return (
    <>
      <PageHero
        eyebrow={t`Contribute`}
        title={t`Submit a Resource`}
        subtitle={t`Share a guide, template or case study with the KTIP community. A reviewer publishes it.`}
        imageSeed="resources"
        breadcrumb={[
          { label: t`Home`, href: '/' },
          { label: t`Resources`, href: '/resources' },
          { label: t`Submit` },
        ]}
      />

      <div className="bg-ktip-sand-50 py-12">
        <div className="max-w-page-tight mx-auto px-4">
          <form onSubmit={handleSubmit} className="space-y-6">
            {errorMessage && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-label text-red-700">
                {errorMessage}
              </div>
            )}

            <div className="rounded-xl border border-ktip-ocean-200 bg-ktip-ocean-50/60 px-4 py-3 text-label text-ktip-sand-700">
              <Trans>
                Submissions are reviewed before they appear in the library. You will be notified
                either way, and you can edit and resend anything that comes back.
              </Trans>
            </div>

            <ModeratedInput
              label={t`Title`}
              placeholder={t`e.g. A practical guide to grant budgeting`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              error={errors.title}
              moderation={moderation.fields.title}
              fullWidth
              required
            />

            <ModeratedInput
              label={t`Summary`}
              placeholder={t`One sentence shown on the resource card (optional)`}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              maxLength={180}
              moderation={moderation.fields.summary}
              fullWidth
            />

            <ModeratedTextarea
              label={t`Description`}
              placeholder={t`What is it, who is it for, and what will they get out of it?`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              error={errors.description}
              rows={6}
              moderation={moderation.fields.description}
              fullWidth
            />

            <ResourceFileField
              file={file}
              onChange={setFile}
              error={errors.file}
              disabled={loading}
            />

            <Input
              label={t`Or link to it`}
              placeholder="https://"
              value={downloadUrl}
              onChange={(e) => setDownloadUrl(e.target.value)}
              error={errors.download_url}
              fullWidth
            />

            <div>
              <label className="mb-2 block text-label font-medium text-ktip-sand-700">
                <Trans>Type</Trans> <span className="text-red-500">*</span>
              </label>
              <select
                value={resourceType}
                onChange={(e) => setResourceType(e.target.value)}
                className="w-full rounded-xl border-2 border-ktip-sand-200 px-4 py-3 transition-colors focus:border-ktip-ocean-500 focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20"
                required
              >
                {Object.entries(RESOURCE_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {resolveCopy(i18n, label)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-label font-medium text-ktip-sand-700">
                <Trans>Category</Trans> <span className="text-red-500">*</span>
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-xl border-2 border-ktip-sand-200 px-4 py-3 transition-colors focus:border-ktip-ocean-500 focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20"
                required
              >
                <option value="">{t`Select a category`}</option>
                {Object.entries(RESOURCE_CATEGORY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {resolveCopy(i18n, label)}
                  </option>
                ))}
              </select>
              {errors.category && <p className="mt-1 text-label text-red-600">{errors.category}</p>}
            </div>

            <TagInput
              label={t`Tags`}
              description={t`Topics people can filter and search the library by.`}
              placeholder={t`Add a tag`}
              values={tags}
              onChange={setTags}
              suggestions={CONTENT_TAG_SUGGESTIONS}
            />

            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={isClimateAction}
                onChange={(e) => setIsClimateAction(e.target.checked)}
                className="mt-1"
              />
              <span className="text-label text-ktip-sand-700">
                <Trans>This resource supports climate action</Trans>
              </span>
            </label>

            <div className="space-y-3">
              <AgreementNotice bundle="publishing" />

              <div className="flex items-center gap-4">
                <Button
                  type="submit"
                  loading={loading || moderation.checking}
                  disabled={moderation.blocked}
                  icon={<Upload size={20} />}
                  fullWidth
                >
                  <Trans>Submit for Review</Trans>
                </Button>
                <button
                  type="button"
                  onClick={() => navigate('/resources')}
                  disabled={loading}
                  className="whitespace-nowrap text-label text-ktip-sand-500 transition-colors hover:text-ktip-sand-700"
                >
                  <Trans>Cancel</Trans>
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      <ContentWarningModal state={moderation.warning} onClose={moderation.dismissWarning} />

      <AgreementGateModal
        gate={gate}
        bundle="publishing"
        open={gateOpen}
        context="resource_submit"
        onClose={() => {
          setGateOpen(false)
          resumeAfterGate.current = false
        }}
        onAccepted={async () => {
          setGateOpen(false)
          if (resumeAfterGate.current) {
            resumeAfterGate.current = false
            await submitNow()
          }
        }}
      />
    </>
  )
}
