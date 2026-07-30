import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { Plus, Trash2, UserRoundCheck } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Textarea } from '../../components/ui/Textarea'
import { useResume } from '../../hooks/useResume'
import { useToast } from '../../contexts/ToastContext'
import { usePageTitle } from '../../hooks/usePageTitle'
import type {
  ResumeData,
  ResumeEducation,
  ResumePath,
  ResumeRole,
} from '../../types/resume'

/**
 * CV editor.
 *
 * The important behaviour here is not the forms, it is the provenance. Every
 * field records which path it writes, and saving stamps those paths 'manual' so
 * the Virtual Campus sync stops overwriting them (see migration 069 and
 * api/_lib/cv-build.ts). Editing your summary must not freeze your course list,
 * and refreshing your course list must not undo your summary — that only works
 * if the editor is precise about what was actually touched.
 *
 * Courses are shown but not editable: they are a record of what the campus says
 * you completed, and a CV field an employer can quietly rewrite is worth
 * nothing. Removing the section entirely is available through the sync
 * provenance rule — delete an entry and it stays deleted.
 */

/** Sections whose whole array is one provenance path. */
type ListPath = Extract<ResumePath, 'roles' | 'education'>

export default function CvEditPage() {
  usePageTitle('Edit CV')
  const navigate = useNavigate()
  const toast = useToast()
  const { data, save, generate, isLoading } = useResume()

  const [draft, setDraft] = useState<ResumeData>(() => structuredClone(data))
  const [touched, setTouched] = useState<Set<ResumePath>>(new Set())
  const [ready, setReady] = useState(false)

  // The query may resolve after first render; adopt it once, and never after
  // the user has started typing.
  useMemo(() => {
    if (ready || isLoading) return
    setDraft(structuredClone(data))
    setReady(true)
  }, [data, isLoading, ready])

  const mark = (path: ResumePath) => setTouched((prev) => new Set(prev).add(path))

  const setProfileField = (field: keyof ResumeData['profile'], value: string) => {
    setDraft((prev) => ({ ...prev, profile: { ...prev.profile, [field]: value } }))
    mark(`profile.${field}` as ResumePath)
  }

  const setAbout = (text: string) => {
    // One paragraph per blank-line-separated block, which is how the renderer
    // reads it and how people actually type.
    setDraft((prev) => ({
      ...prev,
      profile: { ...prev.profile, about: text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean) },
    }))
    mark('profile.about')
  }

  const setList = <K extends ListPath>(path: K, next: ResumeData[K]) => {
    setDraft((prev) => ({ ...prev, [path]: next }) as ResumeData)
    mark(path)
  }

  const setLines = (path: Extract<ResumePath, 'languages' | 'professionalSkills'>, text: string) => {
    setDraft((prev) => ({ ...prev, [path]: text.split('\n').map((l) => l.trim()).filter(Boolean) }))
    mark(path)
  }

  /**
   * Fills the blanks from KTIP's own records — profile, public projects, badges,
   * institution membership.
   *
   * Runs on the server (`/api/cv/generate`) rather than copying fields here.
   * There used to be a local fill-if-empty implementation, and it had already
   * drifted from the server's: this one derived the skill-circle abbreviation,
   * that one hardcoded 'Sk'. One mapping, one place.
   *
   * It also means the write lands in the database rather than only in this
   * draft, which is why unsaved edits are refused first — the route merges into
   * the stored document, so anything typed and not yet saved would not be part
   * of what it merges against.
   */
  const fillFromProfile = async () => {
    if (touched.size > 0) {
      toast.info('Save your changes first — filling from your profile reloads the document.')
      return
    }

    try {
      const result = await generate.mutateAsync()
      // The mutation's onSuccess awaits the refetch, so `data` is already fresh
      // on the next render; dropping `ready` lets the adopt-once memo take it.
      setReady(false)

      const filled = result.filled?.length ?? 0
      if (filled === 0) {
        toast.info('Nothing to copy — your profile has nothing these blanks can use.')
        return
      }
      toast.success(`Filled ${filled} ${filled === 1 ? 'section' : 'sections'} from your KTIP record.`)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const onSave = async () => {
    try {
      await save.mutateAsync({ data: draft, touched: Array.from(touched) })
      toast.success('CV saved.')
      navigate('/cv')
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const emptyRole: ResumeRole = { org: '', title: '', period: '', location: '', points: [] }
  const emptyEducation: ResumeEducation = { credential: '', school: '', year: '' }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-display text-3xl font-bold uppercase tracking-wide text-ktip-ocean-700">
        Edit CV
      </h1>
      <p className="mt-2 text-sm text-ktip-sand-600">
        Anything you change here is yours — syncing from the Virtual Campus will leave it alone.
      </p>

      <div data-tutorial="cv-edit-prefill" className="mt-4">
        <Button
          variant="outline"
          size="sm"
          icon={<UserRoundCheck size={15} />}
          loading={generate.isPending}
          onClick={fillFromProfile}
        >
          Fill blanks from my profile
        </Button>
        <p className="mt-1.5 text-xs text-ktip-sand-500">
          Copies your name, location, organisation, bio, skills, interests, public projects and
          badges into any section that is still empty. Never overwrites something you have written or
          anything synced from the Virtual Campus.
        </p>
      </div>

      {/* ── Identity ── */}
      <section className="mt-10 space-y-4">
        <h2 className="font-display text-lg font-bold uppercase tracking-wider text-ktip-ocean-700">
          Details
        </h2>
        <Input
          label="Full name"
          value={draft.profile.name}
          onChange={(e) => setProfileField('name', e.target.value)}
        />
        <Input
          label="Headline"
          placeholder="Student · OECS Virtual Campus"
          value={draft.profile.role}
          onChange={(e) => setProfileField('role', e.target.value)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Location"
            value={draft.profile.location}
            onChange={(e) => setProfileField('location', e.target.value)}
          />
          <Input
            label="Phone"
            value={draft.profile.phone}
            onChange={(e) => setProfileField('phone', e.target.value)}
          />
        </div>
        <Input
          label="Email"
          type="email"
          value={draft.profile.email}
          onChange={(e) => setProfileField('email', e.target.value)}
        />
        <Textarea
          label="About"
          rows={6}
          helperText="Leave a blank line between paragraphs."
          value={draft.profile.about.join('\n\n')}
          onChange={(e) => setAbout(e.target.value)}
        />
      </section>

      {/* ── Experience ── */}
      <section data-tutorial="cv-edit-sections" className="mt-12">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold uppercase tracking-wider text-ktip-ocean-700">
            Experience
          </h2>
          <Button
            variant="ghost"
            size="sm"
            icon={<Plus size={15} />}
            onClick={() => setList('roles', [...draft.roles, { ...emptyRole }])}
          >
            Add
          </Button>
        </div>

        {draft.roles.length === 0 && (
          <p className="mt-3 text-sm text-ktip-sand-500">
            The Virtual Campus holds no employment record, so this section starts empty.
          </p>
        )}

        <div className="mt-4 space-y-6">
          {draft.roles.map((role, index) => (
            <div
              key={index}
              className="rounded-lg border border-ktip-sand-200 p-4"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label="Job title"
                  value={role.title}
                  onChange={(e) =>
                    setList(
                      'roles',
                      draft.roles.map((r, i) => (i === index ? { ...r, title: e.target.value } : r))
                    )
                  }
                />
                <Input
                  label="Organisation"
                  value={role.org}
                  onChange={(e) =>
                    setList(
                      'roles',
                      draft.roles.map((r, i) => (i === index ? { ...r, org: e.target.value } : r))
                    )
                  }
                />
                <Input
                  label="Period"
                  placeholder="Jan 2024 – Present"
                  value={role.period}
                  onChange={(e) =>
                    setList(
                      'roles',
                      draft.roles.map((r, i) => (i === index ? { ...r, period: e.target.value } : r))
                    )
                  }
                />
                <Input
                  label="Location"
                  value={role.location}
                  onChange={(e) =>
                    setList(
                      'roles',
                      draft.roles.map((r, i) =>
                        i === index ? { ...r, location: e.target.value } : r
                      )
                    )
                  }
                />
              </div>
              <Textarea
                label="What you did"
                rows={4}
                helperText="One bullet per line."
                value={role.points.join('\n')}
                onChange={(e) =>
                  setList(
                    'roles',
                    draft.roles.map((r, i) =>
                      i === index
                        ? { ...r, points: e.target.value.split('\n').map((p) => p.trim()).filter(Boolean) }
                        : r
                    )
                  )
                }
              />
              <Button
                variant="ghost"
                size="sm"
                icon={<Trash2 size={15} />}
                onClick={() => setList('roles', draft.roles.filter((_, i) => i !== index))}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      </section>

      {/* ── Education ── */}
      <section className="mt-12">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold uppercase tracking-wider text-ktip-ocean-700">
            Education
          </h2>
          <Button
            variant="ghost"
            size="sm"
            icon={<Plus size={15} />}
            onClick={() => setList('education', [...draft.education, { ...emptyEducation }])}
          >
            Add
          </Button>
        </div>

        <div className="mt-4 space-y-4">
          {draft.education.map((entry, index) => (
            <div
              key={index}
              className="grid gap-3 rounded-lg border border-ktip-sand-200 p-4 sm:grid-cols-[1fr_1fr_100px]"
            >
              <Input
                label="Credential"
                value={entry.credential}
                onChange={(e) =>
                  setList(
                    'education',
                    draft.education.map((x, i) =>
                      i === index ? { ...x, credential: e.target.value } : x
                    )
                  )
                }
              />
              <Input
                label="School"
                value={entry.school}
                onChange={(e) =>
                  setList(
                    'education',
                    draft.education.map((x, i) => (i === index ? { ...x, school: e.target.value } : x))
                  )
                }
              />
              <Input
                label="Year"
                value={entry.year}
                onChange={(e) =>
                  setList(
                    'education',
                    draft.education.map((x, i) => (i === index ? { ...x, year: e.target.value } : x))
                  )
                }
              />
              <div className="sm:col-span-3">
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Trash2 size={15} />}
                  onClick={() =>
                    setList('education', draft.education.filter((_, i) => i !== index))
                  }
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Courses (read-only) ── */}
      {draft.courses.length > 0 && (
        <section className="mt-12">
          <h2 className="font-display text-lg font-bold uppercase tracking-wider text-ktip-ocean-700">
            Courses
          </h2>
          <p className="mt-2 text-sm text-ktip-sand-500">
            Pulled from the OECS Virtual Campus. Remove one and it stays removed on future syncs.
          </p>
          <ul className="mt-4 divide-y divide-ktip-sand-200 rounded-lg border border-ktip-sand-200">
            {draft.courses.map((course, index) => (
              <li key={course.courseId} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ktip-ocean-700">
                    {course.title}
                  </p>
                  <p className="text-xs text-ktip-sand-500">
                    {course.status === 'completed'
                      ? 'Completed'
                      : `${course.progressPercentage}% complete`}
                    {course.subjectArea ? ` · ${course.subjectArea}` : ''}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Trash2 size={15} />}
                  aria-label={`Remove ${course.title}`}
                  onClick={() => {
                    setDraft((prev) => ({
                      ...prev,
                      courses: prev.courses.filter((_, i) => i !== index),
                    }))
                    mark('courses')
                  }}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Projects (read-only) ── */}
      {draft.projects.length > 0 && (
        <section className="mt-12">
          <h2 className="font-display text-lg font-bold uppercase tracking-wider text-ktip-ocean-700">
            Projects
          </h2>
          <p className="mt-2 text-sm text-ktip-sand-500">
            Your public KTIP projects. Edit a project itself on its own page; remove it here and it
            stays off your CV.
          </p>
          <ul className="mt-4 divide-y divide-ktip-sand-200 rounded-lg border border-ktip-sand-200">
            {draft.projects.map((project, index) => (
              <li key={project.title} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ktip-ocean-700">{project.title}</p>
                  <p className="text-xs text-ktip-sand-500">
                    {[project.category, project.phase].filter(Boolean).join(' · ') || 'Project'}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Trash2 size={15} />}
                  aria-label={`Remove ${project.title}`}
                  onClick={() => {
                    setDraft((prev) => ({
                      ...prev,
                      projects: prev.projects.filter((_, i) => i !== index),
                    }))
                    mark('projects')
                  }}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Awards (read-only) ── */}
      {draft.awards.length > 0 && (
        <section className="mt-12">
          <h2 className="font-display text-lg font-bold uppercase tracking-wider text-ktip-ocean-700">
            Awards &amp; recognition
          </h2>
          <p className="mt-2 text-sm text-ktip-sand-500">
            Badges you have earned on KTIP. Remove one and it stays off your CV.
          </p>
          <ul className="mt-4 divide-y divide-ktip-sand-200 rounded-lg border border-ktip-sand-200">
            {draft.awards.map((award, index) => (
              <li key={`${award.name}-${award.date}`} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ktip-ocean-700">{award.name}</p>
                  {award.description && (
                    <p className="truncate text-xs text-ktip-sand-500">{award.description}</p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Trash2 size={15} />}
                  aria-label={`Remove ${award.name}`}
                  onClick={() => {
                    setDraft((prev) => ({
                      ...prev,
                      awards: prev.awards.filter((_, i) => i !== index),
                    }))
                    mark('awards')
                  }}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Lists ── */}
      <section className="mt-12 space-y-4">
        <h2 className="font-display text-lg font-bold uppercase tracking-wider text-ktip-ocean-700">
          More
        </h2>
        <Textarea
          label="Languages"
          rows={3}
          helperText="One per line."
          value={draft.languages.join('\n')}
          onChange={(e) => setLines('languages', e.target.value)}
        />
        <Textarea
          label="Professional skills"
          rows={5}
          helperText="One per line."
          value={draft.professionalSkills.join('\n')}
          onChange={(e) => setLines('professionalSkills', e.target.value)}
        />
        <Textarea
          label="Interests"
          rows={3}
          value={draft.interests}
          onChange={(e) => {
            const value = e.target.value
            setDraft((prev) => ({ ...prev, interests: value }))
            mark('interests')
          }}
        />
      </section>

      <div data-tutorial="cv-edit-save" className="mt-10 flex items-center gap-3">
        <Button onClick={onSave} loading={save.isPending}>
          Save CV
        </Button>
        <Button variant="ghost" onClick={() => navigate('/cv')}>
          Cancel
        </Button>
        {touched.size > 0 && (
          <span className="text-xs text-ktip-sand-500">
            {touched.size} section{touched.size === 1 ? '' : 's'} will be marked as yours
          </span>
        )}
      </div>
    </div>
  )
}
