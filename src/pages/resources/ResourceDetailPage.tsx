import { useParams, Link } from 'react-router'
import { Disclaimer } from '../../components/legal/Disclaimer'
import { AiUseBadge } from '../../components/legal/AiDeclaration'
import { ReportInfringementLink } from '../../components/legal/ReportInfringementLink'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { useResource, useResourceFileUrl } from '../../hooks/useResources'
import { useMemberPanel } from '../../contexts/MemberPanelContext'
import { useAuth } from '../../contexts/AuthContext'
import { usePageTitle } from '../../hooks/usePageTitle'
import { useCanonicalSlug } from '../../hooks/useCanonicalSlug'
import { useRecordView } from '../../hooks/useRecordView'
import {
  BookOpen,
  Download,
  ExternalLink,
  Calendar,
  FileX,
  ShieldAlert,
  User,
} from 'lucide-react'
import {
  RESOURCE_TYPE_LABELS,
  RESOURCE_TYPE_COLORS,
  RESOURCE_CATEGORY_LABELS,
} from '../../lib/constants'
import { formatDate } from '../../lib/utils'
import { PageHero } from '../../components/layout/PageHero'
import { Trans, useLingui } from '@lingui/react/macro'
import { cardImageFor } from '../../lib/hero-images'
import { useResourceTrail } from '../../hooks/useCategoryTrail'

export default function ResourceDetailPage() {
  const { t } = useLingui()
  const params = useParams()
  const { openMember } = useMemberPanel()

  const auth = useAuth()
  const { resource, loading } = useResource(params.id)
  const breadcrumb = useResourceTrail(resource)
  useCanonicalSlug(params.id, resource)
  useRecordView('resource', resource?.id)

  // A member's upload lives in the private resource-files bucket; download_url
  // is only ever an outside link. The page rendered the second and never the
  // first, so an uploaded file had no download button at all.
  const held = !!resource && resource.status !== undefined && resource.status !== 'active'
  // RLS already hides a held resource from everyone else (135); the author and
  // staff still read it, and are the only ones who see it here.
  const canSeeHeld =
    !!resource &&
    (resource.author_id === auth.user?.id || auth.can('moderation:view') || auth.can('resource:manage'))
  const { url: fileUrl, loading: fileLoading } = useResourceFileUrl(
    held && !canSeeHeld ? null : resource?.file_path
  )

  usePageTitle(resource?.title ? t`${resource.title} | Resources` : t`Resource`)

  if (resource && held && !canSeeHeld) {
    return (
      <div className="w-full max-w-page mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 bg-ktip-sand-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <ShieldAlert size={32} className="text-ktip-sand-400" />
        </div>
        <h2 className="text-2xl font-display font-bold uppercase text-ktip-sand-900 mb-2">
          <Trans>Under review</Trans>
        </h2>
        <p className="text-gray-500 mb-6">
          <Trans>This resource is unavailable while we review it.</Trans>
        </p>
        <Link
          to="/resources"
          className="px-6 py-2.5 btn-brand text-sm font-bold uppercase tracking-wider rounded-lg inline-flex items-center gap-2"
        >
          <Trans>Back to Resources</Trans>
        </Link>
      </div>
    )
  }

  if (loading || !resource) {
    if (loading) {
      return (
        <div className="w-full max-w-page mx-auto px-4 py-8">
          <div className="max-w-page-mid mx-auto">
            {/* Hero-band stand-in: hero-base like PageHero (navy by day,
                near-black at night), not a gray that inverts to white in
                dark mode */}
            <div className="bg-hero-base min-h-[180px] rounded-none animate-pulse" />
            <div className="p-8 animate-pulse">
              <div className="h-4 w-24 bg-ktip-sand-100 rounded mb-4" />
              <div className="h-8 w-3/4 bg-ktip-sand-100 rounded mb-4" />
              <div className="h-4 w-full bg-ktip-sand-100 rounded mb-2" />
              <div className="h-4 w-2/3 bg-ktip-sand-100 rounded" />
            </div>
          </div>
        </div>
      )
    }
    return (
      <div className="w-full max-w-page mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 bg-ktip-sand-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <BookOpen size={32} className="text-ktip-sand-400" />
        </div>
        <h2 className="text-2xl font-display font-bold uppercase text-ktip-sand-900 mb-2">
          <Trans>Resource Not Found</Trans>
        </h2>
        <p className="text-gray-500 mb-6">
          <Trans>This resource doesn't exist or hasn't been published yet.</Trans>
        </p>
        <Link
          to="/resources"
          className="px-6 py-2.5 btn-brand text-sm font-bold uppercase tracking-wider rounded-lg inline-flex items-center gap-2"
        >
          <Trans>Back to Resources</Trans>
        </Link>
      </div>
    )
  }

  return (
    <>
      <PageHero
        eyebrow={t`Resource Detail`}
        title={resource.title}
        image={cardImageFor(resource.thumbnail_url, resource.id)}
        imageSeed={resource.id}
        breadcrumb={breadcrumb}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={RESOURCE_TYPE_COLORS[resource.resource_type] || ''}>
            {RESOURCE_TYPE_LABELS[resource.resource_type] || resource.resource_type}
          </Badge>
          {resource.category && (
            <Badge className="bg-ktip-sand-100 text-ktip-sand-700 border-ktip-sand-200">
              {RESOURCE_CATEGORY_LABELS[resource.category!] || resource.category}
            </Badge>
          )}
          <AiUseBadge value={resource.ai_use} />
        </div>
      </PageHero>

      {/* === Two-Column Content Area === */}
      <div className="bg-ktip-sand-50 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-page-mid mx-auto px-4">

          {/* === Main Column === */}
          <div className="lg:col-span-2">
            {/* Only the author and staff reach a held resource at all. */}
            {held && (
              <div role="status" className="mb-6 flex gap-3 rounded-xl border border-ktip-sun-300 bg-ktip-sun-50 p-4">
                <ShieldAlert size={20} aria-hidden className="mt-0.5 shrink-0 text-ktip-sun-700" />
                <div className="text-sm text-ktip-sand-800">
                  <p className="font-semibold text-ktip-sand-900">
                    {resource.status === 'removed' ? <Trans>Removed</Trans> : <Trans>Under review</Trans>}
                  </p>
                  <p className="mt-0.5">
                    {resource.status === 'removed' ? (
                      <Trans>Nobody else can open this resource or download its file.</Trans>
                    ) : (
                      <Trans>Nobody else can open this resource or download its file until the review ends.</Trans>
                    )}
                    {resource.author_id === auth.user?.id && (
                      <>
                        {' '}
                        <Link to="/resources/my-submissions" className="font-medium text-ktip-ocean-700 hover:underline">
                          <Trans>See why in your submissions</Trans>
                        </Link>
                      </>
                    )}
                  </p>
                </div>
              </div>
            )}

            {/* Thumbnail */}
            {resource.thumbnail_url && (
              <img
                src={resource.thumbnail_url!}
                alt={resource.title}
                className="w-full h-56 object-cover rounded mb-6"
                loading="lazy"
              />
            )}

            {/* Title */}
            <h2
              id="overview"
              data-spy="Overview"
              className="scroll-mt-24 text-xl font-bold uppercase text-center text-ktip-sand-900 mb-2"
            >
              {resource.title}
            </h2>

            {/* Date line */}
            <p className="text-sm text-gray-400 text-center mb-6">
              <Trans>Published {formatDate(resource.created_at)}</Trans>
            </p>

            {/* Summary lede */}
            {resource.summary && (
              <p className="text-lg text-ktip-sand-800 font-medium leading-relaxed mb-6">
                {resource.summary}
              </p>
            )}

            {/* Description */}
            {resource.description && (
              <p className="text-lg text-gray-600 mb-6">
                {resource.description}
              </p>
            )}

            {/* Content */}
            {resource.content && (
              <div
                id="content"
                data-spy="Content"
                className="scroll-mt-24 prose prose-ktip max-w-none text-gray-700 whitespace-pre-wrap leading-relaxed mb-6"
              >
                {resource.content}
              </div>
            )}

            {/* Download — or an explicit account of why there is none.
                A resource with no file attached used to render nothing here at
                all, and to a reader "nothing" is indistinguishable from a
                button that failed to load. Someone reported exactly that, and
                had to guess at the cause themselves. Saying so costs one line.

                No data-spy on the empty state: the section nav lists places
                worth jumping to, and this is not one. */}
            {resource.download_url || resource.file_path ? (
              <div id="download" data-spy="Download" className="scroll-mt-24 mt-8 border-t border-ktip-sand-200 pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Download size={20} className="text-ktip-ocean-600" />
                    <div>
                      <p className="font-medium text-ktip-sand-900"><Trans>Download Resource</Trans></p>
                      <p className="text-sm text-gray-500">
                        {resource.file_path && resource.file_name ? (
                          resource.file_name
                        ) : (
                          <Trans>Access the full resource file</Trans>
                        )}
                      </p>
                    </div>
                  </div>
                  {/* The uploaded file wins: it is the thing the member
                      submitted and a reviewer approved. A signed URL that is
                      refused renders the button disabled, not a dead link. */}
                  {resource.file_path ? (
                    fileUrl ? (
                      <a href={fileUrl} target="_blank" rel="noopener noreferrer" download={resource.file_name ?? undefined}>
                        <Button size="sm" icon={<Download size={14} />}>
                          <Trans>Download</Trans>
                        </Button>
                      </a>
                    ) : (
                      <Button size="sm" icon={<Download size={14} />} disabled loading={fileLoading}>
                        <Trans>Download</Trans>
                      </Button>
                    )
                  ) : (
                    <a
                      href={resource.download_url!}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button size="sm" icon={<ExternalLink size={14} />}>
                        <Trans>Download</Trans>
                      </Button>
                    </a>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-8 border-t border-ktip-sand-200 pt-6">
                <div className="flex items-center gap-3">
                  <FileX size={20} className="text-ktip-sand-400 shrink-0" />
                  <div>
                    <p className="font-medium text-ktip-sand-700">
                      <Trans>No file to download</Trans>
                    </p>
                    <p className="text-sm text-gray-500">
                      {resource.content || resource.description || resource.summary ? (
                        <Trans>This resource is published in full on this page.</Trans>
                      ) : (
                        <Trans>Nothing has been attached to this entry yet.</Trans>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* === Sidebar === */}
          <div className="lg:col-span-1">
            {/* Widget 1: Details */}
            <div className="mb-10">
              <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1"><Trans>Details</Trans></h3>
              <p className="text-ktip-ocean-600 text-xs italic mb-4"><Trans>Resource information</Trans></p>
              <div className="text-sm divide-y divide-ktip-sand-100">
                {resource.author && (
                  <div className="flex items-center gap-2 py-2.5">
                    <User size={16} className="text-gray-400 shrink-0" />
                    <span className="text-gray-500">
                      <Trans>
                        By{' '}
                        <button
                          type="button"
                          onClick={() => openMember(resource.author!.id)}
                          className="text-ktip-ocean-600 hover:underline"
                        >
                          {resource.author!.display_name}
                        </button>
                      </Trans>
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-2 py-2.5">
                  <Calendar size={16} className="text-gray-400 shrink-0" />
                  <span className="text-gray-500">
                    <Trans>Published {formatDate(resource.created_at)}</Trans>
                  </span>
                </div>
              </div>
            </div>

            {/* Widget 2: Tags */}
            {resource.tags?.length > 0 && (
              <div className="mb-10">
                <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">
                  <Trans>Tags</Trans>
                </h3>
                <p className="text-ktip-ocean-600 text-xs italic mb-4"><Trans>Related topics</Trans></p>
                <div className="flex flex-wrap gap-1.5">
                  {resource.tags.map((tag) => (
                    <span key={tag} className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-ktip-sand-100 text-ktip-sand-700">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Widget 3: Browse more */}
            <div className="mb-10">
              <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1"><Trans>Explore</Trans></h3>
              <p className="text-ktip-ocean-600 text-xs italic mb-4"><Trans>Discover more resources</Trans></p>
              <Link to="/resources">
                <button className="w-full px-4 py-2.5 btn-brand text-sm font-bold rounded-lg flex items-center justify-center gap-1.5">
                  <BookOpen size={16} />
                  <Trans>Browse All Resources</Trans>
                </button>
              </Link>
            </div>
          </div>

          <Disclaimer variant="advice" placement="footer" />
          <ReportInfringementLink targetType="resource" targetId={resource.id} className="lg:col-span-3" />
        </div>
      </div>
    </>
  )
}
