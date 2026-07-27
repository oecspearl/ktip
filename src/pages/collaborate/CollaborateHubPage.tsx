import { Link } from 'react-router'
import { usePageTitle } from '../../hooks/usePageTitle'
import { analytics } from '../../hooks/useAnalytics'
import { Pen, FileText, Code, Video, ArrowRight, ChevronRight } from 'lucide-react'

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
  usePageTitle('Collaborate')

  return (
    <>
      {/* Hero Banner */}
      <div className="bg-gray-800 min-h-[180px] flex items-center">
        <div className="container mx-auto px-4 flex items-center justify-between">
          <div>
            <p className="text-gray-400 text-sm uppercase tracking-widest mb-2">Collaboration</p>
            <h1 className="text-3xl md:text-4xl font-display font-bold text-white">
              Collaborate Together
            </h1>
          </div>
          <nav className="hidden md:flex items-center gap-1 text-sm text-gray-400">
            <Link to="/" className="hover:text-white transition-colors">Home</Link>
            <ChevronRight size={14} />
            <span className="text-white">Collaborate</span>
          </nav>
        </div>
      </div>

      {/* Tools Grid */}
      <div className="bg-white py-12">
        <div className="max-w-5xl mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {tools.map((tool) => (
              <Link
                key={tool.href}
                to={tool.href}
                onClick={() => analytics.feature('collaborate', 'tool_selected', { tool: tool.title })}
                className="group border border-gray-200 p-6 transition-colors hover:border-gray-300"
              >
                <div className="flex items-start gap-5">
                  <div className={`w-14 h-14 ${tool.bg} rounded-xl flex items-center justify-center shrink-0`}>
                    <tool.icon size={28} className={tool.text} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xl font-semibold text-ktip-sand-900 mb-2 flex items-center gap-2">
                      {tool.title}
                      <ArrowRight
                        size={18}
                        className="text-ktip-sand-300 group-hover:text-ktip-sand-500 group-hover:translate-x-1 transition-all"
                      />
                    </h3>
                    <p className="text-ktip-sand-600 leading-relaxed">{tool.description}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
