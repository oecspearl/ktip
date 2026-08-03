import { usePageTitle } from '../../hooks/usePageTitle'
import { useTutorialAutoStart } from '../../hooks/useTutorialAutoStart'
import { TUTORIAL_IDS } from '../../data/tutorials'
import { analytics } from '../../hooks/useAnalytics'
import { Pen, FileText, Code, Video } from 'lucide-react'
import { PageHero } from '../../components/layout/PageHero'
import { BentoCard } from '../../components/ui/BentoCard'
import { Trans, useLingui } from '@lingui/react/macro'
import { msg } from '@lingui/core/macro'

const tools = [
  {
    // Stable tracking id — analytics events key off this, not the
    // (translated, and therefore locale-varying) title.
    id: 'whiteboard',
    title: msg`Whiteboard`,
    description: msg`Brainstorm ideas visually with an interactive collaborative whiteboard powered by tldraw.`,
    icon: Pen,
    href: '/collaborate/whiteboards',
    bg: 'bg-ktip-ocean-50',
    text: 'text-ktip-ocean-600',
  },
  {
    id: 'document',
    title: msg`Document Editor`,
    description: msg`Create and edit rich-text documents with a full-featured collaborative editor.`,
    icon: FileText,
    href: '/collaborate/documents',
    bg: 'bg-ktip-tropical-50',
    text: 'text-ktip-tropical-700',
  },
  {
    id: 'code',
    title: msg`Code Sandbox`,
    description: msg`Write, run and share code snippets with syntax highlighting across six languages.`,
    icon: Code,
    href: '/collaborate/snippets',
    bg: 'bg-ktip-sun-50',
    text: 'text-ktip-sun-600',
  },
  {
    id: 'video',
    title: msg`Video Conference`,
    description: msg`Connect face-to-face with team members through real-time video conferencing.`,
    icon: Video,
    href: '/collaborate/video',
    bg: 'bg-red-50',
    text: 'text-red-600',
  },
]

export default function CollaborateHubPage() {
    const { t, i18n } = useLingui()
  usePageTitle(t`Collaborate`)
  // Static page — nothing to wait for.
  useTutorialAutoStart(TUTORIAL_IDS.COLLABORATE, true)

  return (
    <>
      <PageHero
        eyebrow={t`Collaboration`}
        title={t`Collaborate Together`}
        imageSeed="collaborate"
        breadcrumb={[{ label: t`Home`, href: '/' }, { label: t`Collaborate` }]}
      />

      {/* Tools Grid */}
      <div className="bg-ktip-sand-50 py-12">
        <div className="max-w-page-narrow mx-auto px-4">
          <div
            data-tutorial="collaborate-tools"
            className="grid grid-cols-1 md:grid-cols-2 gap-4 auto-rows-fr stagger-children"
          >
            {tools.map((tool) => (
              <BentoCard
                key={tool.href}
                to={tool.href}
                imageSeed={tool.href}
                onClick={() => analytics.feature('collaborate', 'tool_selected', { tool: tool.id })}
                eyebrow={
                  <span className="inline-flex items-center gap-1.5">
                    <tool.icon size={12} />
                    <Trans>Collaboration Tool</Trans>
                  </span>
                }
                title={i18n._(tool.title)}
                description={i18n._(tool.description)}
                cta={t`Open`}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
