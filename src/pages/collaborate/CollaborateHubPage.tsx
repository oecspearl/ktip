import { For } from 'solid-js'
import { A } from '@solidjs/router'
import { MainLayout } from '../../components/layout/MainLayout'
import { usePageTitle } from '../../hooks/usePageTitle'
import { analytics } from '../../hooks/useAnalytics'
import { Pen, FileText, Code, Video, ArrowRight, ChevronRight } from 'lucide-solid'

const tools = [
  {
    title: 'Whiteboard',
    description: 'Brainstorm ideas visually with an interactive collaborative whiteboard powered by tldraw.',
    icon: Pen,
    href: '/collaborate/whiteboards',
    bg: 'bg-indigo-50',
    text: 'text-indigo-600',
  },
  {
    title: 'Document Editor',
    description: 'Create and edit rich-text documents with a full-featured collaborative editor.',
    icon: FileText,
    href: '/collaborate/documents',
    bg: 'bg-emerald-50',
    text: 'text-emerald-600',
  },
  {
    title: 'Code Sandbox',
    description: 'Write and share code with syntax highlighting, multiple languages, and theme support.',
    icon: Code,
    href: '/collaborate/code',
    bg: 'bg-amber-50',
    text: 'text-amber-600',
  },
  {
    title: 'Video Conference',
    description: 'Connect face-to-face with team members through real-time video conferencing.',
    icon: Video,
    href: '/collaborate/video',
    bg: 'bg-rose-50',
    text: 'text-rose-600',
  },
]

export default function CollaborateHubPage() {
  usePageTitle(() => 'Collaborate')

  return (
    <MainLayout>
      {/* Hero Banner */}
      <div class="bg-gray-800 min-h-[180px] flex items-center">
        <div class="container mx-auto px-4 flex items-center justify-between">
          <div>
            <p class="text-gray-400 text-sm uppercase tracking-widest mb-2">Collaboration</p>
            <h1 class="text-3xl md:text-4xl font-display font-bold text-white">
              Collaborate Together
            </h1>
          </div>
          <nav class="hidden md:flex items-center gap-1 text-sm text-gray-400">
            <A href="/" class="hover:text-white transition-colors">Home</A>
            <ChevronRight size={14} />
            <span class="text-white">Collaborate</span>
          </nav>
        </div>
      </div>

      {/* Tools Grid */}
      <div class="bg-white py-12">
        <div class="max-w-5xl mx-auto px-4">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <For each={tools}>
              {(tool) => (
                <A
                  href={tool.href}
                  onClick={() => analytics.feature('collaborate', 'tool_selected', { tool: tool.title })}
                  class="group border border-gray-200 p-6 transition-colors hover:border-gray-300"
                >
                  <div class="flex items-start gap-5">
                    <div class={`w-14 h-14 ${tool.bg} rounded-xl flex items-center justify-center shrink-0`}>
                      <tool.icon size={28} class={tool.text} />
                    </div>
                    <div class="flex-1 min-w-0">
                      <h3 class="text-xl font-semibold text-ktip-sand-900 mb-2 flex items-center gap-2">
                        {tool.title}
                        <ArrowRight
                          size={18}
                          class="text-ktip-sand-300 group-hover:text-ktip-sand-500 group-hover:translate-x-1 transition-all"
                        />
                      </h3>
                      <p class="text-ktip-sand-600 leading-relaxed">{tool.description}</p>
                    </div>
                  </div>
                </A>
              )}
            </For>
          </div>
        </div>
      </div>
    </MainLayout>
  )
}
