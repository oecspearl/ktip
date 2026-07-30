import { useParams, Link } from 'react-router'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { ClimateBadge } from '../../components/ui/ClimateBadge'
import { useResource } from '../../hooks/useResources'
import { useMemberPanel } from '../../contexts/MemberPanelContext'
import { usePageTitle } from '../../hooks/usePageTitle'
import {
  BookOpen,
  Download,
  ExternalLink,
  Calendar,
  User,
} from 'lucide-react'
import {
  RESOURCE_TYPE_LABELS,
  RESOURCE_TYPE_COLORS,
  RESOURCE_CATEGORY_LABELS,
} from '../../lib/constants'
import { formatDate, truncate } from '../../lib/utils'
import { PageHero } from '../../components/layout/PageHero'

export default function ResourceDetailPage() {
  const params = useParams()
  const { openMember } = useMemberPanel()

  const { resource, loading } = useResource(params.id)

  usePageTitle(resource?.title ? `${resource.title} — Resources` : 'Resource')

  if (loading || !resource) {
    if (loading) {
      return (
        <div className="w-full max-w-[calc(50vw+48rem)] mx-auto px-4 py-8">
          <div className="max-w-[calc(50vw+36rem)] mx-auto">
            <div className="bg-gray-800 min-h-[180px] rounded-none animate-pulse" />
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
      <div className="w-full max-w-[calc(50vw+48rem)] mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <BookOpen size={32} className="text-ktip-sand-400" />
        </div>
        <h2 className="text-2xl font-display font-bold uppercase text-ktip-sand-900 mb-2">
          Resource Not Found
        </h2>
        <p className="text-gray-500 mb-6">
          This resource doesn't exist or hasn't been published yet.
        </p>
        <Link
          to="/resources"
          className="px-6 py-2.5 btn-brand text-sm font-bold uppercase tracking-wider rounded-lg inline-flex items-center gap-2"
        >
          Back to Resources
        </Link>
      </div>
    )
  }

  return (
    <>
      <PageHero
        eyebrow="Resource Detail"
        title={resource.title}
        image={resource.thumbnail_url}
        imageSeed={resource.id}
        breadcrumb={[
          { label: 'Home', href: '/' },
          { label: 'Resources', href: '/resources' },
          { label: truncate(resource.title, 30) },
        ]}
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
          {resource.is_climate_action && <ClimateBadge size="md" />}
        </div>
      </PageHero>

      {/* === Two-Column Content Area === */}
      <div className="bg-ktip-sand-50 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-[calc(50vw+36rem)] mx-auto px-4">

          {/* === Main Column === */}
          <div className="lg:col-span-2">
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
              Published {formatDate(resource.created_at)}
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

            {/* Download */}
            {resource.download_url && (
              <div id="download" data-spy="Download" className="scroll-mt-24 mt-8 border-t border-gray-200 pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Download size={20} className="text-ktip-ocean-600" />
                    <div>
                      <p className="font-medium text-ktip-sand-900">Download Resource</p>
                      <p className="text-sm text-gray-500">Access the full resource file</p>
                    </div>
                  </div>
                  <a
                    href={resource.download_url!}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button size="sm" icon={<ExternalLink size={14} />}>
                      Download
                    </Button>
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* === Sidebar === */}
          <div className="lg:col-span-1">
            {/* Widget 1: Details */}
            <div className="mb-10">
              <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">Details</h3>
              <p className="text-ktip-ocean-600 text-xs italic mb-4">Resource information</p>
              <div className="text-sm divide-y divide-gray-100">
                {resource.author && (
                  <div className="flex items-center gap-2 py-2.5">
                    <User size={16} className="text-gray-400 shrink-0" />
                    <span className="text-gray-500">
                      By{' '}
                      <button
                        type="button"
                        onClick={() => openMember(resource.author!.id)}
                        className="text-ktip-ocean-600 hover:underline"
                      >
                        {resource.author!.display_name}
                      </button>
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-2 py-2.5">
                  <Calendar size={16} className="text-gray-400 shrink-0" />
                  <span className="text-gray-500">
                    Published {formatDate(resource.created_at)}
                  </span>
                </div>
              </div>
            </div>

            {/* Widget 2: Tags */}
            {resource.tags?.length > 0 && (
              <div className="mb-10">
                <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">
                  Tags
                </h3>
                <p className="text-ktip-ocean-600 text-xs italic mb-4">Related topics</p>
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
              <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">Explore</h3>
              <p className="text-ktip-ocean-600 text-xs italic mb-4">Discover more resources</p>
              <Link to="/resources">
                <button className="w-full px-4 py-2.5 btn-brand text-sm font-bold rounded-lg flex items-center justify-center gap-1.5">
                  <BookOpen size={16} />
                  Browse All Resources
                </button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
