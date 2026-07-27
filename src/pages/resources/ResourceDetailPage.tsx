import { Show, For, Suspense } from 'solid-js'
import { useParams, A } from '@solidjs/router'
import { MainLayout } from '../../components/layout/MainLayout'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { ClimateBadge } from '../../components/ui/ClimateBadge'
import { useResource } from '../../hooks/useResources'
import { usePageTitle } from '../../hooks/usePageTitle'
import {
  BookOpen,
  Download,
  ExternalLink,
  Calendar,
  User,
  ChevronRight,
} from 'lucide-solid'
import {
  RESOURCE_TYPE_LABELS,
  RESOURCE_TYPE_COLORS,
  RESOURCE_CATEGORY_LABELS,
} from '../../lib/constants'
import { formatDate, truncate } from '../../lib/utils'

export default function ResourceDetailPage() {
  const params = useParams()

  const { resource } = useResource(() => params.id)

  usePageTitle(() => resource()?.title ? `${resource()!.title} — Resources` : 'Resource')

  return (
    <MainLayout>
      <Suspense
        fallback={
          <div class="container mx-auto px-4 py-8">
            <div class="max-w-6xl mx-auto">
              <div class="bg-gray-800 min-h-[180px] rounded-none animate-pulse" />
              <div class="p-8 animate-pulse">
                <div class="h-4 w-24 bg-ktip-sand-100 rounded mb-4" />
                <div class="h-8 w-3/4 bg-ktip-sand-100 rounded mb-4" />
                <div class="h-4 w-full bg-ktip-sand-100 rounded mb-2" />
                <div class="h-4 w-2/3 bg-ktip-sand-100 rounded" />
              </div>
            </div>
          </div>
        }
      >
        <Show
          when={!resource.loading && resource()}
          fallback={
            <div class="container mx-auto px-4 py-16 text-center">
              <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <BookOpen size={32} class="text-ktip-sand-400" />
              </div>
              <h2 class="text-2xl font-display font-bold uppercase text-ktip-sand-900 mb-2">
                Resource Not Found
              </h2>
              <p class="text-gray-500 mb-6">
                This resource doesn't exist or hasn't been published yet.
              </p>
              <A
                href="/resources"
                class="px-6 py-2.5 bg-ktip-ocean-600 text-white text-sm font-bold uppercase tracking-wider rounded-lg hover:bg-ktip-ocean-700 transition-colors inline-flex items-center gap-2"
              >
                Back to Resources
              </A>
            </div>
          }
        >
          {/* === Dark Hero Header Band === */}
          <div class="bg-gray-800 min-h-[180px] flex items-center">
            <div class="container mx-auto px-4 py-10">
              <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                  <p class="text-gray-400 text-sm uppercase tracking-widest mb-2">Resource Detail</p>
                  <h1 class="text-3xl md:text-4xl font-display font-bold text-white mb-3">
                    {resource()!.title}
                  </h1>
                  <div class="flex flex-wrap items-center gap-2">
                    <Badge class={RESOURCE_TYPE_COLORS[resource()!.resource_type] || ''}>
                      {RESOURCE_TYPE_LABELS[resource()!.resource_type] || resource()!.resource_type}
                    </Badge>
                    <Show when={resource()!.category}>
                      <Badge class="bg-ktip-sand-100 text-ktip-sand-700 border-ktip-sand-200">
                        {RESOURCE_CATEGORY_LABELS[resource()!.category!] || resource()!.category}
                      </Badge>
                    </Show>
                    <Show when={resource()!.is_climate_action}>
                      <ClimateBadge size="md" />
                    </Show>
                  </div>
                </div>
                <nav class="text-sm text-gray-400 hidden md:block" aria-label="Breadcrumb">
                  <A href="/" class="hover:text-white transition-colors">Home</A>
                  <span class="mx-1.5"><ChevronRight size={12} class="inline" /></span>
                  <A href="/resources" class="hover:text-white transition-colors">Resources</A>
                  <span class="mx-1.5"><ChevronRight size={12} class="inline" /></span>
                  <span class="text-gray-300">{truncate(resource()!.title, 30)}</span>
                </nav>
              </div>
            </div>
          </div>

          {/* === Two-Column Content Area === */}
          <div class="bg-white py-12">
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-6xl mx-auto px-4">

              {/* === Main Column === */}
              <div class="lg:col-span-2">
                {/* Thumbnail */}
                <Show when={resource()!.thumbnail_url}>
                  <img
                    src={resource()!.thumbnail_url!}
                    alt={resource()!.title}
                    class="w-full h-56 object-cover rounded mb-6"
                    loading="lazy"
                  />
                </Show>

                {/* Title */}
                <h2 class="text-xl font-bold uppercase text-center text-ktip-sand-900 mb-2">
                  {resource()!.title}
                </h2>

                {/* Date line */}
                <p class="text-sm text-gray-400 text-center mb-6">
                  Published {formatDate(resource()!.created_at)}
                </p>

                {/* Description */}
                <Show when={resource()!.description}>
                  <p class="text-lg text-gray-600 mb-6">
                    {resource()!.description}
                  </p>
                </Show>

                {/* Content */}
                <Show when={resource()!.content}>
                  <div class="prose prose-ktip max-w-none text-gray-700 whitespace-pre-wrap leading-relaxed mb-6">
                    {resource()!.content}
                  </div>
                </Show>

                {/* Download */}
                <Show when={resource()!.download_url}>
                  <div class="mt-8 border-t border-gray-200 pt-6">
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-3">
                        <Download size={20} class="text-ktip-ocean-600" />
                        <div>
                          <p class="font-medium text-ktip-sand-900">Download Resource</p>
                          <p class="text-sm text-gray-500">Access the full resource file</p>
                        </div>
                      </div>
                      <a
                        href={resource()!.download_url!}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button size="sm" icon={<ExternalLink size={14} />}>
                          Download
                        </Button>
                      </a>
                    </div>
                  </div>
                </Show>
              </div>

              {/* === Sidebar === */}
              <div class="lg:col-span-1">
                {/* Widget 1: Details */}
                <div class="mb-10">
                  <h3 class="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">Details</h3>
                  <p class="text-ktip-ocean-600 text-xs italic mb-4">Resource information</p>
                  <div class="text-sm divide-y divide-gray-100">
                    <Show when={resource()!.author}>
                      <div class="flex items-center gap-2 py-2.5">
                        <User size={16} class="text-gray-400 shrink-0" />
                        <span class="text-gray-500">
                          By{' '}
                          <A
                            href={`/profile/${resource()!.author!.id}`}
                            class="text-ktip-ocean-600 hover:underline"
                          >
                            {resource()!.author!.display_name}
                          </A>
                        </span>
                      </div>
                    </Show>

                    <div class="flex items-center gap-2 py-2.5">
                      <Calendar size={16} class="text-gray-400 shrink-0" />
                      <span class="text-gray-500">
                        Published {formatDate(resource()!.created_at)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Widget 2: Tags */}
                <Show when={resource()!.tags?.length}>
                  <div class="mb-10">
                    <h3 class="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">
                      Tags
                    </h3>
                    <p class="text-ktip-ocean-600 text-xs italic mb-4">Related topics</p>
                    <div class="flex flex-wrap gap-1.5">
                      <For each={resource()!.tags}>
                        {(tag) => (
                          <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-ktip-sand-100 text-ktip-sand-700">
                            {tag}
                          </span>
                        )}
                      </For>
                    </div>
                  </div>
                </Show>

                {/* Widget 3: Browse more */}
                <div class="mb-10">
                  <h3 class="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">Explore</h3>
                  <p class="text-ktip-ocean-600 text-xs italic mb-4">Discover more resources</p>
                  <A href="/resources">
                    <button class="w-full px-4 py-2.5 bg-ktip-ocean-600 text-white text-sm font-bold rounded-lg hover:bg-ktip-ocean-700 transition-colors flex items-center justify-center gap-1.5">
                      <BookOpen size={16} />
                      Browse All Resources
                    </button>
                  </A>
                </div>
              </div>
            </div>
          </div>
        </Show>
      </Suspense>
    </MainLayout>
  )
}
