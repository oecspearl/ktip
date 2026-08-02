import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, Pen, FileText, Code2, Video } from 'lucide-react'
import { PageHero, type BreadcrumbItem } from '../layout/PageHero'
import { cn } from '../../lib/utils'

/**
 * The frame every collaboration tool sits in: hero, cross-tool nav, and a
 * single bordered panel with menu-bar / toolbar / body / status-bar slots.
 *
 * Before this existed the whiteboard, code sandbox and document editor each
 * rolled their own container with a different background, border radius and
 * chrome colour. Routing them all through here is what makes them match.
 */

export type CollabTool = 'whiteboard' | 'document' | 'code' | 'video'

const TOOL_LINKS: { key: CollabTool; label: string; href: string; icon: typeof Pen }[] = [
  { key: 'whiteboard', label: 'Whiteboards', href: '/collaborate/whiteboards', icon: Pen },
  { key: 'document', label: 'Documents', href: '/collaborate/documents', icon: FileText },
  { key: 'code', label: 'Code', href: '/collaborate/snippets', icon: Code2 },
  { key: 'video', label: 'Video', href: '/collaborate/video', icon: Video },
]

interface ToolPanelShellProps {
  /** Which cross-tool link to mark as current. */
  tool: CollabTool
  title: ReactNode
  breadcrumb?: BreadcrumbItem[]
  imageSeed?: string
  /** Badges under the hero title (e.g. "View Only — Shared with you"). */
  heroBadge?: ReactNode
  /** Save / Export / Share cluster, rendered above the panel. */
  actions?: ReactNode
  menuBar?: ReactNode
  toolbar?: ReactNode
  statusBar?: ReactNode
  /** Replaces the whole panel — used for "not found" / no-access states. */
  fallback?: ReactNode
  children?: ReactNode
}

export function ToolPanelShell({
  tool,
  title,
  breadcrumb,
  imageSeed,
  heroBadge,
  actions,
  menuBar,
  toolbar,
  statusBar,
  fallback,
  children,
}: ToolPanelShellProps) {
  return (
    <>
      <PageHero
        eyebrow="Collaboration Tools"
        title={title}
        imageSeed={imageSeed ?? tool}
        compact
        breadcrumb={breadcrumb}
      >
        {heroBadge}
      </PageHero>

      <div className="bg-ktip-sand-100 py-6 min-h-[calc(100svh-230px)]">
        <div className="max-w-page-narrow mx-auto px-4">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 mb-4">
            {/* Tour anchors live on the shell, so all four tools are tourable
                without any of them carrying markup of its own. */}
            <nav data-tutorial="tool-nav" className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <Link
                to="/collaborate"
                className="inline-flex items-center gap-1.5 font-medium text-ktip-sand-600 hover:text-ktip-ocean-600 transition-colors"
              >
                <ArrowLeft size={14} />
                Collaborate Hub
              </Link>
              <span className="text-ktip-sand-300" aria-hidden>
                |
              </span>
              {TOOL_LINKS.map(({ key, label, href, icon: Icon }) => (
                <Link
                  key={key}
                  to={href}
                  aria-current={key === tool ? 'page' : undefined}
                  className={cn(
                    'inline-flex items-center gap-1.5 transition-colors',
                    key === tool
                      ? 'text-ktip-ocean-700 font-semibold'
                      : 'text-ktip-sand-500 hover:text-ktip-ocean-600'
                  )}
                >
                  <Icon size={14} />
                  {label}
                </Link>
              ))}
            </nav>
            {actions && (
              <div data-tutorial="tool-actions" className="flex flex-wrap items-center gap-2">
                {actions}
              </div>
            )}
          </div>

          {fallback ?? (
            <div
              data-tutorial="tool-panel"
              className="rounded-xl border border-ktip-sand-200 bg-ktip-cream shadow-card overflow-hidden"
            >
              {menuBar}
              {toolbar}
              {children}
              {statusBar}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

/** The "this was deleted or you don't have access" panel, shared by all tools. */
export function ToolNotFound({
  what,
  backHref,
  backLabel,
}: {
  what: string
  backHref: string
  backLabel: string
}) {
  return (
    <div className="rounded-xl border border-ktip-sand-200 bg-ktip-cream shadow-card py-16 text-center">
      <h2 className="text-xl font-semibold text-ktip-sand-800 mb-2">{what} not found</h2>
      <p className="text-ktip-sand-500 mb-4">
        This {what.toLowerCase()} may have been deleted, or you don't have access to it.
      </p>
      <Link to={backHref} className="text-ktip-ocean-600 hover:text-ktip-ocean-700 font-medium">
        {backLabel}
      </Link>
    </div>
  )
}
