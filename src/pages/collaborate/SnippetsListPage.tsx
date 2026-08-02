import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useSnippets, useSharedSnippets, useDeleteSnippet, useCreateSnippet } from '../../hooks/useSnippets'
import { usePageTitle } from '../../hooks/usePageTitle'
import { formatRelativeTime, debounce } from '../../lib/utils'
import { clearCode, loadCode } from '../../lib/code-sandbox-utils'
import type { Language } from '../../components/collaboration/CodeMirrorEditor'
import { defaultCode } from '../../components/collaboration/CodeMirrorEditor'
import { Plus, Search, Code2, Trash2, Users, HardDriveDownload, X } from 'lucide-react'
import { PageHero } from '../../components/layout/PageHero'
import type { SnippetLanguage } from '../../types'

const LANGUAGES: Language[] = ['javascript', 'python', 'html', 'css', 'json', 'markdown']
const IMPORT_DISMISSED_KEY = 'ktip_sandbox_import_dismissed'

/** Local drafts that differ from the language template are worth rescuing. */
function findLocalDrafts(): { language: Language; content: string }[] {
  return LANGUAGES.map((language) => ({ language, content: loadCode(language) || '' })).filter(
    (d) => d.content.trim() && d.content.trim() !== defaultCode[d.language].trim()
  )
}

export default function SnippetsListPage() {
  usePageTitle('My Snippets')
  const navigate = useNavigate()

  const [searchQuery, setSearchQuery] = useState('')
  const snippets = useSnippets({ search: searchQuery })
  const shared = useSharedSnippets()
  const { deleteSnippet } = useDeleteSnippet()
  const { createSnippet } = useCreateSnippet()

  // The code sandbox used to persist only to localStorage. Offer those drafts
  // once, then get out of the way.
  const [drafts, setDrafts] = useState<{ language: Language; content: string }[]>([])
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem(IMPORT_DISMISSED_KEY)) return
    } catch {
      return
    }
    setDrafts(findLocalDrafts())
  }, [])

  const dismissDrafts = () => {
    try {
      localStorage.setItem(IMPORT_DISMISSED_KEY, '1')
    } catch {
      /* localStorage unavailable — the prompt just reappears next visit */
    }
    setDrafts([])
  }

  const importDrafts = async () => {
    setImporting(true)
    try {
      for (const draft of drafts) {
        await createSnippet({
          title: `${draft.language} draft`,
          language: draft.language as SnippetLanguage,
          content: draft.content,
        })
        clearCode(draft.language)
      }
      dismissDrafts()
      snippets.refetch()
    } finally {
      setImporting(false)
    }
  }

  const debouncedSearch = useMemo(() => debounce((value: string) => setSearchQuery(value), 300), [])

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm('Delete this snippet? This cannot be undone.')) return
    try {
      await deleteSnippet(id)
      snippets.refetch()
    } catch {
      // Error handled by hook
    }
  }

  return (
    <>
      <PageHero
        eyebrow="Collaboration Tools"
        title="My Snippets"
        imageSeed="code"
        compact
        breadcrumb={[
          { label: 'Home', href: '/' },
          { label: 'Collaborate', href: '/collaborate' },
          { label: 'Code' },
        ]}
      />

      <div className="bg-ktip-sand-50 py-8">
        <div className="max-w-page-narrow mx-auto px-4">
          {/* One-time offer to rescue pre-database local drafts */}
          {drafts.length > 0 && (
            <div className="flex items-start gap-3 mb-6 p-4 rounded-xl border border-ktip-sun-300 bg-ktip-sun-50">
              <HardDriveDownload size={18} className="text-ktip-sun-600 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ktip-sand-900">
                  {drafts.length} unsaved draft{drafts.length > 1 ? 's' : ''} found in this browser
                </p>
                <p className="text-sm text-ktip-sand-600 mt-0.5">
                  Import {drafts.length > 1 ? 'them' : 'it'} as snippets to keep, share and open{' '}
                  {drafts.length > 1 ? 'them' : 'it'} from any device.
                </p>
                <div className="flex items-center gap-2 mt-3">
                  <button
                    type="button"
                    onClick={importDrafts}
                    disabled={importing}
                    className="px-3 py-1.5 rounded-lg btn-brand text-sm font-medium disabled:opacity-50"
                  >
                    {importing ? 'Importing…' : 'Import drafts'}
                  </button>
                  <button
                    type="button"
                    onClick={dismissDrafts}
                    className="px-3 py-1.5 rounded-lg text-ktip-sand-600 hover:bg-ktip-sand-100 text-sm transition-colors"
                  >
                    Not now
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={dismissDrafts}
                className="text-ktip-sand-400 hover:text-ktip-sand-700 transition-colors"
                aria-label="Dismiss"
              >
                <X size={16} />
              </button>
            </div>
          )}

          {/* Actions Bar */}
          <div data-tutorial="collab-list-actions" className="flex items-center gap-3 mb-6">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ktip-sand-400" />
              <input
                type="text"
                placeholder="Search snippets..."
                onChange={(e) => debouncedSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 border border-ktip-sand-200 rounded-lg bg-ktip-sand-50/50 focus:bg-ktip-cream focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none text-sm"
              />
            </div>
            <button
              type="button"
              onClick={() => navigate('/collaborate/code/new')}
              className="inline-flex items-center gap-2 px-4 py-2.5 btn-brand rounded-lg font-medium text-sm"
            >
              <Plus size={16} />
              New Snippet
            </button>
          </div>

          {snippets.loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="border border-ktip-sand-200 p-4 animate-pulse">
                  <div className="h-5 w-48 bg-ktip-sand-200 rounded mb-2" />
                  <div className="h-4 w-32 bg-ktip-sand-100 rounded" />
                </div>
              ))}
            </div>
          ) : snippets.snippets && snippets.snippets.length > 0 ? (
            <div className="space-y-2">
              {snippets.snippets.map((snippet) => (
                <Link
                  key={snippet.id}
                  to={`/collaborate/code/${snippet.id}`}
                  className="flex items-center justify-between border border-ktip-sand-200 p-4 hover:border-ktip-ocean-300 hover:bg-ktip-ocean-50/30 transition-colors group"
                >
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-ktip-sand-900 group-hover:text-ktip-ocean-700 transition-colors truncate">
                      {snippet.title}
                    </h3>
                    <p className="text-sm text-ktip-sand-500 mt-0.5">
                      {snippet.language} · Edited {formatRelativeTime(snippet.updated_at)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => handleDelete(e, snippet.id)}
                    className="p-2 rounded-lg text-ktip-sand-400 hover:text-red-600 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                    title="Delete snippet"
                  >
                    <Trash2 size={16} />
                  </button>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-16">
              <div className="w-16 h-16 bg-ktip-sand-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Code2 size={32} className="text-ktip-sand-400" />
              </div>
              <h3 className="text-lg font-semibold text-ktip-sand-800 mb-1">No snippets yet</h3>
              <p className="text-sm text-ktip-sand-500 mb-4">
                Create a snippet to write, run and share code with your collaborators.
              </p>
              <button
                type="button"
                onClick={() => navigate('/collaborate/code/new')}
                className="inline-flex items-center gap-2 px-4 py-2 btn-brand rounded-lg text-sm font-medium"
              >
                <Plus size={16} />
                Create Snippet
              </button>
            </div>
          )}

          {/* Shared with me */}
          {shared.snippets && shared.snippets.length > 0 && (
            <div className="mt-10">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-ktip-sand-800 mb-4">
                <Users size={20} className="text-ktip-sand-400" />
                Shared with me
              </h2>
              <div className="space-y-2">
                {shared.snippets.map((snippet) => (
                  <Link
                    key={snippet.id}
                    to={`/collaborate/code/${snippet.id}`}
                    className="flex items-center justify-between border border-ktip-sand-200 p-4 hover:border-ktip-ocean-300 hover:bg-ktip-ocean-50/30 transition-colors group"
                  >
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-ktip-sand-900 group-hover:text-ktip-ocean-700 transition-colors truncate">
                        {snippet.title}
                      </h3>
                      <p className="text-sm text-ktip-sand-500 mt-0.5">
                        {snippet.language} · Edited {formatRelativeTime(snippet.updated_at)}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
