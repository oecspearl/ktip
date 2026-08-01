import { useState } from 'react'
import { Link } from 'react-router'
import { Download, Pencil, UserRoundCheck } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { ResumePaper } from '../../../components/resume/ResumePaper'
import { ResumeOutline } from '../../../components/resume/ResumeOutline'
import { sheetFor } from '../../../components/resume/sheets'
import { useAuth } from '../../../contexts/AuthContext'
import { useResume } from '../../../hooks/useResume'
import { usePageTitle } from '../../../hooks/usePageTitle'
import { resolveDesign } from '../../../lib/resume-designs'

/**
 * The member's CV, in the design they chose.
 *
 * This tab used to be a third rendering of the profile — roles, badges, bio,
 * skills — after the member drawer and /user/:id, and it was the copy nobody kept
 * up to date. The CV is the document that actually represents a member, so this
 * is that instead.
 *
 * Read-only on purpose: design, download and publish live on /cv and this links
 * there rather than growing a second copy of the toolbar. Same components as
 * /cv, so the two cannot disagree about how the document looks.
 */
export default function ProfileTab() {
  usePageTitle('My CV')
  const { profile } = useAuth()
  const { data, design: designId, isLoading, exists, resume } = useResume()
  const [asText, setAsText] = useState(
    () => typeof window !== 'undefined' && !window.matchMedia('(min-width: 768px)').matches
  )

  const design = resolveDesign(designId)
  const Sheet = sheetFor(design.id)

  if (isLoading) {
    return <div className="bg-ktip-cream rounded-2xl border border-ktip-sand-200 h-96 animate-pulse-soft" />
  }

  return (
    <div className="bg-ktip-cream border border-ktip-sand-200 rounded-2xl p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display font-bold text-xl text-ktip-sand-900">Your CV</h2>
          <p className="text-sm text-ktip-sand-600">
            {exists
              ? `${design.label} design · ${
                  resume?.is_public ? 'published — anyone with your link can read it' : 'private to you'
                }`
              : 'Nothing saved yet.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setAsText(!asText)}>
            {asText ? 'Show the page' : 'Read as text'}
          </Button>
          <Link to="/cv/edit">
            <Button variant="outline" size="sm" icon={<Pencil size={15} />}>
              Edit
            </Button>
          </Link>
          <Link to="/cv">
            <Button variant="secondary" size="sm" icon={<Download size={15} />}>
              Design &amp; download
            </Button>
          </Link>
        </div>
      </div>

      {!exists && (
        <p className="mb-5 flex items-start gap-2 rounded-lg border border-ktip-sand-200 bg-ktip-sand-50 p-3 text-xs text-ktip-sand-600">
          <UserRoundCheck size={14} className="mt-0.5 shrink-0" />
          <span>
            Your CV couldn&rsquo;t be started automatically. Sign in from the OECS Virtual Campus to
            pull in your course history, or write it yourself from{' '}
            <Link to="/cv/edit" className="font-semibold text-ktip-ocean-600 hover:underline">
              Edit
            </Link>
            .
          </span>
        </p>
      )}

      {asText ? (
        <ResumeOutline data={data} />
      ) : (
        <ResumePaper>
          <Sheet data={data} avatarUrl={profile?.avatar_url ?? null} theme="color" design={design} />
        </ResumePaper>
      )}
    </div>
  )
}
