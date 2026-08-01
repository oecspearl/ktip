import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { Download, FileText, LayoutTemplate } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { ResumePaper } from '../../components/resume/ResumePaper'
import { ResumeOutline } from '../../components/resume/ResumeOutline'
import { sheetFor } from '../../components/resume/sheets'
import { usePublicResume } from '../../hooks/useResume'
import { useProfileId } from '../../hooks/useProfile'
import { useCanonicalSlug } from '../../hooks/useCanonicalSlug'
import { usePageTitle } from '../../hooks/usePageTitle'
import { bleedVars, resolveDesign } from '../../lib/resume-designs'
import type { ResumeTheme } from '../../types/resume'

/**
 * A shared CV at /user/:id/cv.
 *
 * Open to signed-out visitors on purpose — a CV that only opens for members is
 * not something anyone can send to an employer. Whether it opens at all is
 * decided in SQL by public_resume(), which returns nothing unless the owner
 * published it and is not suspended, so there is no visibility rule duplicated
 * here to drift out of step.
 *
 * Shows it in the design its owner chose (`design`, migration 078) — a reader
 * following a shared link sees the document the way it was composed.
 */
export default function PublicCvPage() {
  // /u/<username>/cv and /u/<uuid>/cv both land here; public_resume() takes a
  // uuid, so a username is traded for one first.
  const { id: routeParam } = useParams<{ id: string }>()
  const { id, username, loading: resolvingId } = useProfileId(routeParam)
  useCanonicalSlug(routeParam, id ? { id, slug: username } : null)
  const { data: published, isLoading } = usePublicResume(id)
  const [sheetTheme, setSheetTheme] = useState<ResumeTheme>('mono')
  const [pendingPrint, setPendingPrint] = useState(false)
  const [asText, setAsText] = useState(
    () => typeof window !== 'undefined' && !window.matchMedia('(min-width: 768px)').matches
  )

  const name = published?.data?.profile?.name || published?.display_name || 'CV'
  usePageTitle(published ? `${name} — CV` : 'CV')

  const design = resolveDesign(published?.design ?? published?.template)
  const Sheet = sheetFor(design.id)

  useEffect(() => {
    if (!pendingPrint) return
    window.print()
    setPendingPrint(false)
  }, [pendingPrint])

  useEffect(() => {
    const root = document.documentElement
    const vars = bleedVars(sheetTheme, design)
    for (const [key, value] of Object.entries(vars)) root.style.setProperty(key, value)
    return () => {
      for (const key of Object.keys(vars)) root.style.removeProperty(key)
    }
  }, [sheetTheme, design])

  const download = (theme: ResumeTheme) => {
    setAsText(false)
    setSheetTheme(theme)
    setPendingPrint(true)
  }

  // `id` stays undefined for an unknown username, and a disabled query reports
  // isLoading forever — so an unknown name has to fall through to "not found".
  if (resolvingId || (id && isLoading)) {
    return <div className="mx-auto max-w-7xl px-4 py-16 text-center text-ktip-sand-500">Loading…</div>
  }

  if (!published) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center">
        <h1 className="font-display text-2xl font-bold text-ktip-ocean-700">
          This CV is not public
        </h1>
        <p className="mt-3 text-ktip-sand-600">
          The member may have unpublished it, or the link may be wrong.
        </p>
        <Link to={`/user/${routeParam}`} className="mt-6 inline-block text-ktip-ocean-600 hover:underline">
          View their profile instead
        </Link>
      </div>
    )
  }

  return (
    <div id="cv-root" className="mx-auto max-w-7xl px-4 py-10">
      <div data-tutorial="public-cv-actions" className="mb-8 flex flex-wrap items-center gap-3 print:hidden">
        <Button variant="secondary" icon={<Download size={16} />} onClick={() => download('mono')}>
          Download B&amp;W (A4)
        </Button>
        <Button variant="secondary" icon={<Download size={16} />} onClick={() => download('color')}>
          Download Color (A4)
        </Button>
        <Button
          variant="ghost"
          icon={asText ? <LayoutTemplate size={16} /> : <FileText size={16} />}
          onClick={() => setAsText(!asText)}
        >
          {asText ? 'Show the page' : 'Read as text'}
        </Button>
        <Link to={`/user/${routeParam}`} className="text-sm text-ktip-ocean-600 hover:underline">
          View profile
        </Link>
      </div>

      {asText ? (
        <div className="print:hidden">
          <ResumeOutline data={published.data} />
        </div>
      ) : (
        <ResumePaper>
          <Sheet
            data={published.data}
            avatarUrl={published.avatar_url}
            theme={sheetTheme}
            design={design}
          />
        </ResumePaper>
      )}
    </div>
  )
}
