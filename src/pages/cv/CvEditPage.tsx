import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { Plus, Trash2, UserRoundCheck } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Textarea } from '../../components/ui/Textarea'
import { useResume } from '../../hooks/useResume'
import { useAuth } from '../../contexts/AuthContext'
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
  const { profile } = useAuth()
  const { data, save, isLoading } = useResume()

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
   * Copies what the KTIP profile already knows into the blanks.
   *
   * Fill-if-empty, never overwrite: this is a convenience, not a sync, and a
   * button that silently replaced a hand-written summary with a profile bio
   * would be a trap. Only the paths it actually filled get marked — marking a
   * path stamps it 'manual' and permanently stops the Virtual Campus from
   * touching it, so marking a field this did not write would quietly freeze it.
   */
  const fillFromProfile = () => {
    if (!profile) return
    const next = structuredClone(draft)
    const filled: ResumePath[] = []

    const fill = (path: ResumePath, isEmpty: boolean, apply: () => void) => {
      if (!isEmpty) return
      apply()
      filled.push(path)
    }

    fill('profile.name', next.profile.name.trim() === '', () => {
      next.profile.name = profile.display_name ?? ''
    })
    fill('profile.location', next.profile.location.trim() === '', () => {
      next.profile.location = profile.country ?? ''
    })
    fill('profile.role', next.profile.role.trim() === '', () => {
      next.profile.role = [profile.organization, profile.industry].filter(Boolean).join(' · ')
    })
    fill('profile.about', next.profile.about.length === 0, () => {
      next.profile.about = profile.bio ? [profile.bio] : []
    })
    fill('skills', next.skills.length === 0, () => {
      const skills = profile.skills ?? []
      next.skills = skills.length > 0 ? [{ area: 'Skills', abbr: 'Sk', skills: [...skills] }] : []
    })
    fill('interests', next.interests.trim() === '', () => {
      next.interests = (profile.interests ?? []).join(' · ')
    })
    fill('professionalSkills', next.professionalSkills.length === 0, () => {
      next.professionalSkills = [...(profile.open_to ?? [])]
    })

    // A path counted as filled but written empty (nothing on the profile to
    // copy) would be marked for nothing, so drop those before marking.
    const written = filled.filter((path) => {
      if (path === 'skills') return next.skills.length > 0
      if (path === 'professionalSkills') return next.professionalSkills.length > 0
      if (path === 'interests') return next.interests.trim() !== ''
      if (path === 'profile.about') return next.profile.about.length > 0
      if (path === 'profile.name') return next.profile.name.trim() !== ''
      if (path === 'profile.location') return next.profile.location.trim() !== ''
      return next.profile.role.trim() !== ''
    })

    if (written.length === 0) {
      toast.info('Nothing to copy — your profile has nothing these blanks can use.')
      return
    }

    setDraft(next)
    setTouched((prev) => {
      const merged = new Set(prev)
      for (const path of written) merged.add(path)
      return merged
    })
    toast.success(
      `Filled ${written.length} ${written.length === 1 ? 'field' : 'fields'} from your profile. Save to keep them.`
    )
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
      <h1 className="font-display text-3xl font-bold uppercase tracking-wide text-ktip-ocean-700 dark:text-ktip-sand-50">
        Edit CV
      </h1>
      <p className="mt-2 text-sm text-ktip-sand-600 dark:text-ktip-sand-300">
        Anything you change here is yours — syncing from the Virtual Campus will leave it alone.
      </p>

      <div className="mt-4">
        <Button
          variant="outline"
          size="sm"
          icon={<UserRoundCheck size={15} />}
          onClick={fillFromProfile}
        >
          Fill blanks from my profile
        </Button>
        <p className="mt-1.5 text-xs text-ktip-sand-500">
          Copies your name, location, organisation, bio, skills and interests into any field that is
          still empty. Never overwrites something you have written.
        </p>
      </div>

      {/* ── Identity ── */}
      <section className="mt-10 space-y-4">
        <h2 className="font-display text-lg font-bold uppercase tracking-wider text-ktip-ocean-700 dark:text-ktip-sand-100">
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
      <section className="mt-12">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold uppercase tracking-wider text-ktip-ocean-700 dark:text-ktip-sand-100">
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
              className="rounded-lg border border-ktip-sand-200 p-4 dark:border-ktip-sand-700"
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
          <h2 className="font-display text-lg font-bold uppercase tracking-wider text-ktip-ocean-700 dark:text-ktip-sand-100">
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
              className="grid gap-3 rounded-lg border border-ktip-sand-200 p-4 sm:grid-cols-[1fr_1fr_100px] dark:border-ktip-sand-700"
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
          <h2 className="font-display text-lg font-bold uppercase tracking-wider text-ktip-ocean-700 dark:text-ktip-sand-100">
            Courses
          </h2>
          <p className="mt-2 text-sm text-ktip-sand-500">
            Pulled from the OECS Virtual Campus. Remove one and it stays removed on future syncs.
          </p>
          <ul className="mt-4 divide-y divide-ktip-sand-200 rounded-lg border border-ktip-sand-200 dark:divide-ktip-sand-700 dark:border-ktip-sand-700">
            {draft.courses.map((course, index) => (
              <li key={course.courseId} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ktip-ocean-700 dark:text-ktip-sand-100">
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

      {/* ── Lists ── */}
      <section className="mt-12 space-y-4">
        <h2 className="font-display text-lg font-bold uppercase tracking-wider text-ktip-ocean-700 dark:text-ktip-sand-100">
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

      <div className="mt-10 flex items-center gap-3">
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
