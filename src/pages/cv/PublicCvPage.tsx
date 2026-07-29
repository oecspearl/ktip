import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { Download } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { ResumeScreen } from '../../components/resume/ResumeScreen'
import { ResumeSheet } from '../../components/resume/ResumeSheet'
import { usePublicResume } from '../../hooks/useResume'
import { usePageTitle } from '../../hooks/usePageTitle'
import { resolveTemplate, sheetSidebar } from '../../lib/resume-templates'
import type { ResumeTheme } from '../../types/resume'

/**
 * A shared CV at /u/:id/cv.
 *
 * Open to signed-out visitors on purpose — a CV that only opens for members is
 * not something anyone can send to an employer. Whether it opens at all is
 * decided in SQL by public_resume(), which returns nothing unless the owner
 * published it and is not suspended, so there is no visibility rule duplicated
 * here to drift out of step.
 *
 * Always renders the full document. Curated is an editing convenience for the
 * owner, not a thing a reader should have to discover a toggle for.
 */
export default function PublicCvPage() {
  const { id } = useParams<{ id: string }>()
  const { data: published, isLoading } = usePublicResume(id)
  const [sheetTheme, setSheetTheme] = useState<ResumeTheme>('mono')
  const [pendingPrint, setPendingPrint] = useState(false)

  const name = published?.data?.profile?.name || published?.display_name || 'CV'
  usePageTitle(published ? `${name} — CV` : 'CV')

  const template = resolveTemplate(published?.template)

  useEffect(() => {
    if (!pendingPrint) return
    window.print()
    setPendingPrint(false)
  }, [pendingPrint])

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--resume-sidebar', sheetSidebar(sheetTheme, template))
    return () => {
      root.style.removeProperty('--resume-sidebar')
    }
  }, [sheetTheme, template])

  const download = (theme: ResumeTheme) => {
    setSheetTheme(theme)
    setPendingPrint(true)
  }

  if (isLoading) {
    return <div className="mx-auto max-w-7xl px-4 py-16 text-center text-ktip-sand-500">Loading…</div>
  }

  if (!published) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center">
        <h1 className="font-display text-2xl font-bold text-ktip-ocean-700 dark:text-ktip-sand-50">
          This CV is not public
        </h1>
        <p className="mt-3 text-ktip-sand-600 dark:text-ktip-sand-300">
          The member may have unpublished it, or the link may be wrong.
        </p>
        <Link to={`/u/${id}`} className="mt-6 inline-block text-ktip-ocean-600 hover:underline">
          View their profile instead
        </Link>
      </div>
    )
  }

  return (
    <div id="cv-root" className="mx-auto max-w-7xl px-4 py-10">
      <div className="mb-8 flex flex-wrap items-center gap-3 print:hidden">
        <Button variant="secondary" icon={<Download size={16} />} onClick={() => download('mono')}>
          Download B&amp;W (A4)
        </Button>
        <Button variant="secondary" icon={<Download size={16} />} onClick={() => download('color')}>
          Download Color (A4)
        </Button>
        <Link to={`/u/${id}`} className="text-sm text-ktip-ocean-600 hover:underline">
          View profile
        </Link>
      </div>

      <div className="resume-screen-wrap print:hidden">
        <ResumeScreen
          data={published.data}
          avatarUrl={published.avatar_url}
          variant="full"
          template={template}
        />
      </div>

      <div className="resume-print-wrap hidden print:block">
        <ResumeSheet
          data={published.data}
          avatarUrl={published.avatar_url}
          theme={sheetTheme}
          template={template}
        />
      </div>
    </div>
  )
}
