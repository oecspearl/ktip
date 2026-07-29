import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Download, Eye, EyeOff, Pencil, RefreshCw } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { ResumeScreen } from '../../components/resume/ResumeScreen'
import { ResumeSheet } from '../../components/resume/ResumeSheet'
import { useResume } from '../../hooks/useResume'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { usePageTitle } from '../../hooks/usePageTitle'
import { resolveTemplate, sheetSidebar } from '../../lib/resume-templates'
import type { ResumeTheme, ResumeVariant } from '../../types/resume'

/**
 * The member's CV.
 *
 * Rendered twice from one document: ResumeScreen is what people browse,
 * ResumeSheet is the white print-real A4 artifact, mounted display-none and
 * swapped in only for print. "Download" is window.print() — index.css isolates
 * the sheet on @page A4 and the browser's own "Save as PDF" does the rest. No
 * PDF library, and nothing to keep in step with the on-screen design.
 *
 * Two independent choices:
 *  • Curated ↔ Full CV — affects the screen only. The PDF is always complete.
 *  • B&W ↔ Color — picks which sheet theme prints.
 */
export default function CvPage() {
  usePageTitle('My CV')
  const { profile } = useAuth()
  const toast = useToast()
  const [searchParams] = useSearchParams()
  const { resume, data, isLoading, exists, sync, setPublic } = useResume()

  const [variant, setVariant] = useState<ResumeVariant>('curated')
  const [sheetTheme, setSheetTheme] = useState<ResumeTheme>('mono')
  const [pendingPrint, setPendingPrint] = useState(false)

  const template = resolveTemplate(resume?.template)

  // Print only once the chosen theme has committed to the DOM. window.print()
  // is synchronous, so calling it in the click handler captures the previous
  // render and the wrong theme comes out.
  useEffect(() => {
    if (!pendingPrint) return
    window.print()
    setPendingPrint(false)
  }, [pendingPrint])

  // The printed full-height sidebar bleed is a fixed pseudo-element on <body>,
  // which cannot read a variable set on the sheet — so publish it at the root.
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--resume-sidebar', sheetSidebar(sheetTheme, template))
    return () => {
      root.style.removeProperty('--resume-sidebar')
    }
  }, [sheetTheme, template])

  useEffect(() => {
    if (searchParams.get('welcome') === 'vc') {
      toast.success('Your CV has been started from your Virtual Campus record. Edit anything you like.')
    }
    // Once, on arrival from the handoff.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const download = (theme: ResumeTheme) => {
    setSheetTheme(theme)
    setPendingPrint(true)
  }

  const runSync = async () => {
    try {
      const result = await sync.mutateAsync()
      const skipped = result.skipped?.length ?? 0
      toast.success(
        `Synced ${result.courses ?? 0} course${result.courses === 1 ? '' : 's'}` +
          (skipped > 0 ? ` — ${skipped} section${skipped === 1 ? '' : 's'} you edited were left alone.` : '.')
      )
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const togglePublic = async () => {
    try {
      const next = !resume?.is_public
      await setPublic.mutateAsync(next)
      toast.success(next ? 'Your CV is now public.' : 'Your CV is private again.')
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16 text-center text-ktip-sand-500">Loading your CV…</div>
    )
  }

  return (
    <div id="cv-root" className="mx-auto max-w-7xl px-4 py-10">
      <div className="mb-8 print:hidden">
        <p className="text-xs font-medium uppercase tracking-widest text-ktip-sand-500">Résumé</p>
        <h1 className="mt-1 font-display text-3xl font-bold uppercase tracking-wide text-ktip-ocean-700 dark:text-ktip-sand-50">
          My CV
        </h1>
      </div>

      {!exists && (
        <div className="mb-8 rounded-lg border border-ktip-sand-200 bg-ktip-sand-50 p-5 text-sm text-ktip-sand-700 print:hidden dark:border-ktip-sand-700 dark:bg-ktip-sand-800 dark:text-ktip-sand-200">
          <p className="font-semibold">You haven&rsquo;t saved a CV yet.</p>
          <p className="mt-1">
            What you see below is drawn from your profile. Sign in from the OECS Virtual Campus to
            pull in your course history automatically, or start writing it yourself.
          </p>
        </div>
      )}

      <div className="mb-10 flex flex-wrap items-center gap-3 print:hidden">
        <Button variant="secondary" icon={<Download size={16} />} onClick={() => download('mono')}>
          Download B&amp;W (A4)
        </Button>
        <Button variant="secondary" icon={<Download size={16} />} onClick={() => download('color')}>
          Download Color (A4)
        </Button>

        {/* Screen-only view switch — the PDF stays complete regardless. */}
        <div
          className="inline-flex rounded-lg border border-ktip-sand-200 p-1 dark:border-ktip-sand-700"
          role="group"
          aria-label="CV detail level"
        >
          {(['curated', 'full'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setVariant(option)}
              aria-pressed={variant === option}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                variant === option
                  ? 'bg-ktip-ocean-700 text-white dark:bg-ktip-ocean-300 dark:text-ktip-ocean-900'
                  : 'text-ktip-sand-600 hover:text-ktip-ocean-700 dark:text-ktip-sand-300'
              }`}
            >
              {option === 'curated' ? 'Curated' : 'Full CV'}
            </button>
          ))}
        </div>

        <Button
          variant="ghost"
          icon={<RefreshCw size={16} />}
          loading={sync.isPending}
          onClick={runSync}
        >
          Sync from Virtual Campus
        </Button>

        <Link to="/cv/edit">
          <Button variant="ghost" icon={<Pencil size={16} />}>
            Edit
          </Button>
        </Link>

        {exists && (
          <Button
            variant="ghost"
            icon={resume?.is_public ? <Eye size={16} /> : <EyeOff size={16} />}
            loading={setPublic.isPending}
            onClick={togglePublic}
          >
            {resume?.is_public ? 'Public' : 'Private'}
          </Button>
        )}
      </div>

      <p className="mb-8 text-xs text-ktip-sand-500 print:hidden">
        Choose &ldquo;Save as PDF&rdquo; in the print dialog, and turn on background graphics. The
        PDF is always the full CV.
      </p>

      <div className="resume-screen-wrap print:hidden">
        <ResumeScreen
          data={data}
          avatarUrl={profile?.avatar_url ?? null}
          variant={variant}
          template={template}
        />
      </div>

      {/* Print-only A4 twin. Display is forced in index.css @media print via the
          .resume-*-wrap classes rather than the print: utility variant, so the
          sheet always shows and the on-screen twin never prints blank. */}
      <div className="resume-print-wrap hidden print:block">
        <ResumeSheet
          data={data}
          avatarUrl={profile?.avatar_url ?? null}
          theme={sheetTheme}
          template={template}
        />
      </div>
    </div>
  )
}
