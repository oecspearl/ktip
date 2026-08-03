import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Download, Eye, EyeOff, FileText, LayoutTemplate, Pencil, RefreshCw } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { ResumePaper } from '../../components/resume/ResumePaper'
import { ResumeOutline } from '../../components/resume/ResumeOutline'
import { DesignPicker } from '../../components/resume/DesignPicker'
import { sheetFor } from '../../components/resume/sheets'
import { useResume } from '../../hooks/useResume'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { usePageTitle } from '../../hooks/usePageTitle'
import { useTutorialAutoStart } from '../../hooks/useTutorialAutoStart'
import { TUTORIAL_IDS } from '../../data/tutorials'
import { bleedVars, resolveDesign } from '../../lib/resume-designs'
import type { ResumeTheme } from '../../types/resume'
import { Trans, useLingui } from '@lingui/react/macro'
import { plural } from '@lingui/core/macro'

/**
 * The member's CV.
 *
 * WYSIWYG: there is one rendering of the document — the true 210mm A4 sheet —
 * scaled down to fit the column on screen and printed at full size. What you
 * are looking at is the PDF. (It used to be two renderings, a responsive screen
 * version plus a print-only sheet, which meant the thing you chose and the
 * thing you sent were different components.)
 *
 * "Download" is window.print(); index.css isolates the sheet on @page A4 and
 * the browser's own "Save as PDF" does the rest. No PDF library, so nothing can
 * fall out of step with the design, and the text stays real selectable text
 * rather than a raster of it.
 *
 * `embedded` renders the same page as a dashboard panel (see ProfileTab):
 * card chrome instead of a page shell, and a panel-sized heading. Printing is
 * unaffected — the print rules key off `.resume-sheet` and `#cv-root`, both of
 * which are present either way.
 */
export default function CvPage({ embedded = false }: { embedded?: boolean }) {
    const { t } = useLingui()
  usePageTitle(t`My CV`)
  const { profile } = useAuth()
  const toast = useToast()
  const [searchParams] = useSearchParams()
  const { resume, data, design: designId, isLoading, exists, sync, setPublic, setDesign } = useResume()

  const [sheetTheme, setSheetTheme] = useState<ResumeTheme>('mono')
  const [pendingPrint, setPendingPrint] = useState(false)
  const [asText, setAsText] = useState(
    () => typeof window !== 'undefined' && !window.matchMedia('(min-width: 768px)').matches
  )

  const design = resolveDesign(designId)
  const Sheet = sheetFor(design.id)

  // Above the isLoading early return: hooks cannot run conditionally, and the
  // hook is a no-op until `ready` goes true anyway.
  useTutorialAutoStart(TUTORIAL_IDS.CV, !isLoading)

  // Print only once the chosen theme has committed to the DOM. window.print()
  // is synchronous, so calling it in the click handler captures the previous
  // render and the wrong theme comes out.
  useEffect(() => {
    if (!pendingPrint) return
    window.print()
    setPendingPrint(false)
  }, [pendingPrint])

  // The printed full-height bleed strip is a fixed pseudo-element on <body>,
  // which cannot read a variable set on the sheet — so publish it at the root.
  // Colour and geometry travel together: a strip at the wrong edge, or a 74mm
  // one under a design that has no rail, is worse than no strip at all.
  useEffect(() => {
    const root = document.documentElement
    const vars = bleedVars(sheetTheme, design)
    for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value)
    return () => {
      for (const name of Object.keys(vars)) root.style.removeProperty(name)
    }
  }, [sheetTheme, design])

  useEffect(() => {
    if (searchParams.get('welcome') === 'vc') {
      toast.success(t`Your CV has been started from your Virtual Campus record. Edit anything you like.`)
    }
    // Once, on arrival from the handoff.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const download = (theme: ResumeTheme) => {
    // The outline has no page geometry, so printing from it would print nothing
    // recognisable. Flip back to the sheet first.
    setAsText(false)
    setSheetTheme(theme)
    setPendingPrint(true)
  }

  const pickDesign = async (id: string) => {
    try {
      await setDesign.mutateAsync(id)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const runSync = async () => {
    try {
      const result = await sync.mutateAsync()

      // "Synced 0 courses" is a statement about the member's education. When no
      // campus could be reached it is not true, and saying it anyway sends
      // somebody off to look for the courses they know they finished.
      if (result.coursesUnavailable) {
        toast.error(
          t`The Virtual Campus course service could not be reached, so your course list was left as it was. Try again shortly.`
        )
        return
      }

      const skipped = result.skipped?.length ?? 0
      const courses = result.courses ?? 0
      const synced = plural(courses, { one: 'Synced # course', other: 'Synced # courses' })
      const note =
        skipped > 0
          ? plural(skipped, {
              one: ' — # section you edited was left alone.',
              other: ' — # sections you edited were left alone.',
            })
          : '.'
      toast.success(synced + note)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const togglePublic = async () => {
    try {
      const next = !resume?.is_public
      await setPublic.mutateAsync(next)
      toast.success(next ? t`Your CV is now public.` : t`Your CV is private again.`)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  if (isLoading) {
    return (
      <div
        className={
          embedded
            ? 'bg-ktip-cream rounded-2xl border border-ktip-sand-200 h-96 animate-pulse-soft'
            : 'mx-auto max-w-7xl px-4 py-16 text-center text-ktip-sand-500'
        }
      >
        {!embedded && <Trans>Loading your CV…</Trans>}
      </div>
    )
  }

  return (
    <div
      id="cv-root"
      className={
        embedded
          ? 'bg-ktip-cream border border-ktip-sand-200 rounded-2xl p-6'
          : 'mx-auto max-w-7xl px-4 py-10'
      }
    >
      <div className={embedded ? 'mb-6 print:hidden' : 'mb-8 print:hidden'}>
        {!embedded && (
          <p className="text-xs font-medium uppercase tracking-widest text-ktip-sand-500"><Trans>Résumé</Trans></p>
        )}
        {/* The sheet carries the document's own h1 (the member's name), so this
            page-level title is a label rather than a second first-level heading. */}
        <p
          className={
            embedded
              ? 'font-display text-xl font-bold text-ktip-sand-900'
              : 'mt-1 font-display text-3xl font-bold uppercase tracking-wide text-ktip-ocean-700'
          }
        >
          <Trans>My CV</Trans>
        </p>
      </div>

      {!exists && (
        <div className="mb-8 rounded-lg border border-ktip-sand-200 bg-ktip-sand-50 p-5 text-sm text-ktip-sand-700 print:hidden">
          <p className="font-semibold"><Trans>Your CV couldn&rsquo;t be started automatically.</Trans></p>
          <p className="mt-1">
            <Trans>
              What you see below is empty. Sign in from the OECS Virtual Campus to pull in your
              course history, or write it yourself from{' '}
              <Link to="/cv/edit" className="font-semibold text-ktip-ocean-600 hover:underline">
                Edit
              </Link>
              .
            </Trans>
          </p>
        </div>
      )}

      <div data-tutorial="cv-actions" className="mb-6 flex flex-wrap items-center gap-3 print:hidden">
        <Button variant="secondary" icon={<Download size={16} />} onClick={() => download('mono')}>
          <Trans>Download B&amp;W (A4)</Trans>
        </Button>
        <Button variant="secondary" icon={<Download size={16} />} onClick={() => download('color')}>
          <Trans>Download Color (A4)</Trans>
        </Button>

        <Button
          variant="ghost"
          icon={asText ? <LayoutTemplate size={16} /> : <FileText size={16} />}
          onClick={() => setAsText(!asText)}
        >
          {asText ? t`Show the page` : t`Read as text`}
        </Button>

        <Button
          variant="ghost"
          icon={<RefreshCw size={16} />}
          loading={sync.isPending}
          onClick={runSync}
        >
          <Trans>Sync from Virtual Campus</Trans>
        </Button>

        <Link to="/cv/edit">
          <Button variant="ghost" icon={<Pencil size={16} />}>
            <Trans>Edit</Trans>
          </Button>
        </Link>

        {exists && (
          <Button
            variant="ghost"
            icon={resume?.is_public ? <Eye size={16} /> : <EyeOff size={16} />}
            loading={setPublic.isPending}
            onClick={togglePublic}
          >
            {resume?.is_public ? t`Public` : t`Private`}
          </Button>
        )}
      </div>

      <p className="mb-8 text-xs text-ktip-sand-500 print:hidden">
        <Trans>
          Choose &ldquo;Save as PDF&rdquo; in the print dialog. The{' '}
          <strong className="font-semibold">Signature</strong> design also needs &ldquo;Background
          graphics&rdquo; switched on for its navy sidebar; Classic and Compact print correctly
          either way.
        </Trans>
      </p>

      <div data-tutorial="cv-designs" className="mb-8 print:hidden">
        <DesignPicker
          data={data}
          avatarUrl={profile?.avatar_url ?? null}
          current={design}
          onPick={pickDesign}
          busy={setDesign.isPending}
        />
      </div>

      {/* One document. Exactly one of these is mounted, so the CV is never in
          the accessibility tree twice. The wrapper is the tour's anchor for
          "the document" — it has to survive the sheet/outline swap. */}
      <div data-tutorial="cv-sheet">
        {asText ? (
          <div className="print:hidden">
            <ResumeOutline data={data} />
          </div>
        ) : (
          <ResumePaper>
            <Sheet
              data={data}
              avatarUrl={profile?.avatar_url ?? null}
              theme={sheetTheme}
              design={design}
            />
          </ResumePaper>
        )}
      </div>
    </div>
  )
}
