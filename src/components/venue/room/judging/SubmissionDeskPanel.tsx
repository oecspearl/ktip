import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { format } from 'date-fns'
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Lock,
  Send,
  Trash2,
  Upload,
} from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { useToast } from '../../../../contexts/ToastContext'
import { Button } from '../../../ui/Button'
import { Input } from '../../../ui/Input'
import { Textarea } from '../../../ui/Textarea'
import { Stepper } from '../../../ui/Stepper'
import { ReceiptDocument, receiptToSections } from '../../../shared/ReceiptDocument'
import {
  MAX_DECK_BYTES,
  deckFileName,
  openDeck,
  useRemoveDeck,
  useSaveSubmission,
  useSubmitSubmission,
  useTeamSubmission,
  useUploadDeck,
  type EntryFields,
  type TeamSubmissionState,
} from '../../../../hooks/useSubmissions'
import {
  MAX_VIDEO_SECONDS,
  formatDuration,
  isHttpUrl,
  parseDuration,
  submissionMissing,
  type ChecklistEvidence,
  type MissingCode,
} from '../../../../lib/submission-checklist'
import type { AiUse, Event } from '../../../../types'
import { useNow, timeLeft } from './judging-time'

type Step = 0 | 1 | 2 | 3 | 4
const PROJECT = 0
const LINKS = 1
const EVIDENCE = 2
const REVIEW = 3
const SUBMIT = 4

interface Draft {
  title: string
  description: string
  ai_use: AiUse | null
  ai_tools: string
  repo_url: string
  demo_video_url: string
  video_length: string
  pitch_deck_url: string
  evidence: Record<string, { note: string; url: string }>
}

function draftFrom(desk: TeamSubmissionState): Draft {
  const s = desk.solution
  const evidence: Draft['evidence'] = {}
  for (const e of desk.evidence) evidence[e.criterion_id] = { note: e.note ?? '', url: e.url ?? '' }
  return {
    title: s?.title ?? '',
    description: s?.description ?? '',
    ai_use: s?.ai_use ?? null,
    ai_tools: s?.ai_tools ?? '',
    repo_url: s?.repo_url ?? '',
    demo_video_url: s?.demo_video_url ?? '',
    video_length: formatDuration(s?.demo_video_seconds),
    pitch_deck_url: s?.pitch_deck_url ?? '',
    evidence,
  }
}

function evidenceList(draft: Draft): ChecklistEvidence[] {
  return Object.entries(draft.evidence).map(([criterion_id, v]) => ({
    criterion_id,
    note: v.note,
    url: v.url,
  }))
}

/**
 * Where a team hands in its entry (migration 192).
 *
 * Five steps, each saved when you leave it, so a teammate who opens the desk
 * on another laptop sees the same draft. Any member can edit until the
 * deadline. After it the database refuses every change, and this panel turns
 * read-only to match rather than letting someone type into a form that will
 * fail.
 */
export function SubmissionDeskPanel({ event, isHost }: { event: Event; isHost: boolean }) {
  const { t } = useLingui()
  const toast = useToast()
  const { desk, loading } = useTeamSubmission(event.id)
  const save = useSaveSubmission(event.id)
  const submit = useSubmitSubmission(event.id)
  const uploadDeck = useUploadDeck(event.id)
  const removeDeck = useRemoveDeck(event.id)
  const now = useNow()

  const [step, setStep] = useState<Step>(PROJECT)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [showReceipt, setShowReceipt] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  // Load the saved entry once, and again only if the entry itself changes
  // (first save, or a teammate created it). Refetches after our own saves
  // must not wipe what is being typed.
  const loadedFor = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    if (!desk) return
    const id = desk.solution?.id ?? null
    if (loadedFor.current === id) return
    loadedFor.current = id
    setDraft(draftFrom(desk))
  }, [desk])

  const missing = useMemo<MissingCode[]>(() => {
    if (!desk || !draft) return []
    return submissionMissing(
      {
        title: draft.title,
        description: draft.description,
        repo_url: draft.repo_url,
        demo_video_url: draft.demo_video_url,
        demo_video_seconds: parseDuration(draft.video_length),
        pitch_deck_url: draft.pitch_deck_url,
        pitch_deck_path: desk.solution?.pitch_deck_path ?? null,
        ai_use: draft.ai_use,
      },
      desk.criteria,
      evidenceList(draft)
    )
  }, [desk, draft])

  if (loading) return <div className="h-64 animate-pulse-soft rounded-2xl bg-ktip-sand-100" />

  if (!desk) {
    return (
      <Shell>
        <p className="text-sm text-ktip-sand-600">
          <Trans>The Submission Desk is not open for this event yet.</Trans>
        </p>
      </Shell>
    )
  }

  if (!desk.team) {
    return (
      <Shell deadline={desk.deadline} now={now}>
        <p className="text-sm text-ktip-sand-600">
          {isHost ? (
            <Trans>Teams hand in their entries here. You are not on a team, so there is nothing for you to fill in. The results board lists every entry.</Trans>
          ) : (
            <Trans>Each team hands in one entry. Form a team or join one first, then come back here.</Trans>
          )}
        </p>
      </Shell>
    )
  }

  if (!draft) return null

  const solution = desk.solution
  const locked = desk.locked
  const submittedAt = solution?.submitted_at ? new Date(solution.submitted_at) : null
  const editedAt = solution?.last_edited_at ? new Date(solution.last_edited_at) : null
  const changedSinceSubmit = !!submittedAt && !!editedAt && editedAt.getTime() - submittedAt.getTime() > 1000

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d))

  const setEvidence = (id: string, patch: Partial<{ note: string; url: string }>) =>
    setDraft((d) =>
      d
        ? {
            ...d,
            evidence: {
              ...d.evidence,
              [id]: { ...(d.evidence[id] ?? { note: '', url: '' }), ...patch },
            },
          }
        : d
    )

  /** Checks one step's fields. Returns what to send, or null if something is wrong. */
  const fieldsFor = (s: Step): { fields: EntryFields; evidence?: ChecklistEvidence[] } | null => {
    const next: Record<string, string> = {}
    let out: { fields: EntryFields; evidence?: ChecklistEvidence[] } | null = null

    if (s === PROJECT) {
      out = {
        fields: {
          title: draft.title,
          description: draft.description,
          ai_use: draft.ai_use,
          ai_tools: draft.ai_tools,
        },
      }
    } else if (s === LINKS) {
      for (const key of ['repo_url', 'demo_video_url', 'pitch_deck_url'] as const) {
        if (draft[key].trim() && !isHttpUrl(draft[key])) next[key] = t`Use a full link starting with https://`
      }
      const seconds = parseDuration(draft.video_length)
      if (draft.video_length.trim() && seconds === null) next.video_length = t`Write it as minutes and seconds, like 2:45.`
      else if (seconds !== null && (seconds < 1 || seconds > MAX_VIDEO_SECONDS)) next.video_length = t`The video can be three minutes at most.`
      out = {
        fields: {
          repo_url: draft.repo_url,
          demo_video_url: draft.demo_video_url,
          demo_video_seconds: seconds,
          pitch_deck_url: draft.pitch_deck_url,
        },
      }
    } else if (s === EVIDENCE) {
      for (const [id, v] of Object.entries(draft.evidence)) {
        if (v.url.trim() && !isHttpUrl(v.url)) next[`ev:${id}`] = t`Use a full link starting with https://`
      }
      out = { fields: {}, evidence: evidenceList(draft) }
    }

    setErrors(next)
    return Object.keys(next).length ? null : out
  }

  const saveStep = async (s: Step): Promise<boolean> => {
    if (locked || s >= REVIEW) return true
    const payload = fieldsFor(s)
    if (!payload) return false
    try {
      await save.mutateAsync(payload)
      return true
    } catch (err: any) {
      toast.error(err?.message || t`Could not save. Try again.`)
      return false
    }
  }

  const go = async (to: Step) => {
    if (await saveStep(step)) setStep(to)
  }

  const onSubmit = async () => {
    if (!solution) return
    try {
      const res = await submit.mutateAsync(solution.id)
      if (!res.ok) {
        toast.error(t`A few things are still missing.`)
        return
      }
      toast.success(t`Entry submitted. Every teammate has a copy in their dashboard.`)
      setShowReceipt(true)
    } catch (err: any) {
      toast.error(err?.message || t`Could not submit. Try again.`)
    }
  }

  const onDeckFile = async (file: File | undefined) => {
    if (!file || !solution) return
    if (file.size > MAX_DECK_BYTES) {
      toast.error(t`The deck must be 25 MB or smaller.`)
      return
    }
    try {
      await uploadDeck.mutateAsync({ entry: solution, file })
      toast.success(t`Deck uploaded`)
    } catch (err: any) {
      toast.error(err?.message || t`Could not upload the deck.`)
    }
  }

  const missingLabel = (code: MissingCode): { label: string; step: Step } => {
    if (code.startsWith('evidence:')) {
      const id = code.slice('evidence:'.length)
      const c = desk.criteria.find((x) => x.id === id)
      const title = c?.title ?? ''
      return { label: t`Evidence for ${title}`, step: EVIDENCE }
    }
    switch (code) {
      case 'title':
        return { label: t`Project title`, step: PROJECT }
      case 'summary':
        return { label: t`Summary`, step: PROJECT }
      case 'ai':
        return { label: t`AI declaration`, step: PROJECT }
      case 'repo':
        return { label: t`Code repository link`, step: LINKS }
      case 'video':
        return { label: t`Demo video link`, step: LINKS }
      case 'video_length':
        return { label: t`Demo video length`, step: LINKS }
      case 'deck':
        return { label: t`Pitch deck`, step: LINKS }
      default:
        return { label: code, step: REVIEW }
    }
  }

  const steps = [t`Project`, t`Links`, t`Evidence`, t`Review`, t`Submit`]

  const status = locked
    ? submittedAt
      ? t`Submitted. Entries are closed.`
      : t`Entries are closed. Nothing was submitted.`
    : submittedAt
      ? changedSinceSubmit
        ? t`Changed since you submitted. Submit again for a fresh receipt.`
        : t`Submitted. You can still edit until the deadline.`
      : t`Draft. Not submitted yet.`

  return (
    <Shell deadline={desk.deadline} now={now} teamName={desk.team.name}>
      <p
        className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
          submittedAt && !changedSinceSubmit
            ? 'bg-ktip-tropical-50 text-ktip-tropical-800'
            : 'bg-ktip-sand-50 text-ktip-sand-700'
        }`}
        role="status"
      >
        {locked ? (
          <Lock size={15} aria-hidden="true" />
        ) : submittedAt && !changedSinceSubmit ? (
          <CheckCircle2 size={15} aria-hidden="true" />
        ) : (
          <AlertCircle size={15} aria-hidden="true" />
        )}
        {status}
      </p>

      <Stepper
        steps={steps}
        currentStep={step}
        onStepClick={(i) => go(i as Step)}
        className="mt-1"
      />

      <div className="min-w-0">
        {step === PROJECT && (
          <div className="flex flex-col gap-4">
            <Input
              label={t`Project title`}
              value={draft.title}
              onChange={(e) => set('title', e.target.value)}
              maxLength={120}
              disabled={locked}
              fullWidth
            />
            <Textarea
              label={t`Summary`}
              helperText={t`What it does and who it is for. Judges read this first.`}
              value={draft.description}
              onChange={(e) => set('description', e.target.value)}
              rows={5}
              maxLength={2000}
              disabled={locked}
              fullWidth
            />
            <fieldset className="rounded-xl border border-ktip-sand-200 p-4">
              <legend className="px-1 text-label font-medium text-ktip-sand-700">
                <Trans>AI declaration</Trans>
              </legend>
              <div className="flex flex-col gap-2" role="radiogroup">
                {(
                  [
                    ['none', t`We did not use AI tools in any material way`],
                    ['assisted', t`AI tools materially helped us build this`],
                    ['drafted', t`AI wrote the first full draft of the code or content`],
                  ] as Array<[AiUse, string]>
                ).map(([value, label]) => (
                  <label key={value} className="flex cursor-pointer items-start gap-3 text-sm text-ktip-sand-800">
                    <input
                      type="radio"
                      name={`ai-use-${event.id}`}
                      checked={draft.ai_use === value}
                      onChange={() => set('ai_use', value)}
                      disabled={locked}
                      className="mt-0.5 h-4 w-4 border-ktip-sand-300 text-ktip-ocean-600"
                    />
                    {label}
                  </label>
                ))}
              </div>
              {draft.ai_use && draft.ai_use !== 'none' && (
                <Textarea
                  label={t`Which tools, and what for`}
                  value={draft.ai_tools}
                  onChange={(e) => set('ai_tools', e.target.value)}
                  rows={3}
                  maxLength={1000}
                  disabled={locked}
                  className="mt-3"
                  fullWidth
                />
              )}
              <p className="mt-3 text-caption text-ktip-sand-500">
                <Trans>Fixing spelling or grammar does not count. Judges see your answer.</Trans>
              </p>
            </fieldset>
          </div>
        )}

        {step === LINKS && (
          <div className="flex flex-col gap-4">
            <Input
              label={t`Code repository`}
              placeholder="https://github.com/..."
              value={draft.repo_url}
              onChange={(e) => set('repo_url', e.target.value)}
              error={errors.repo_url}
              disabled={locked}
              inputMode="url"
              fullWidth
            />
            <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
              <Input
                label={t`Demo video`}
                placeholder="https://"
                value={draft.demo_video_url}
                onChange={(e) => set('demo_video_url', e.target.value)}
                error={errors.demo_video_url}
                disabled={locked}
                inputMode="url"
                fullWidth
              />
              <Input
                label={t`Length`}
                placeholder="2:45"
                value={draft.video_length}
                onChange={(e) => set('video_length', e.target.value)}
                error={errors.video_length}
                helperText={errors.video_length ? undefined : t`Three minutes at most`}
                disabled={locked}
                fullWidth
              />
            </div>

            <div className="flex flex-col gap-2 rounded-xl border border-ktip-sand-200 p-4">
              <p className="text-label font-medium text-ktip-sand-700">
                <Trans>Pitch deck</Trans>
              </p>
              <Input
                aria-label={t`Link to your deck`}
                placeholder={t`Link to your deck, or upload a file below`}
                value={draft.pitch_deck_url}
                onChange={(e) => set('pitch_deck_url', e.target.value)}
                error={errors.pitch_deck_url}
                disabled={locked}
                inputMode="url"
                fullWidth
              />
              {solution?.pitch_deck_path ? (
                <div className="flex flex-wrap items-center gap-2 text-sm text-ktip-sand-800">
                  <FileText size={15} aria-hidden="true" className="text-ktip-sand-500" />
                  <button
                    type="button"
                    className="font-medium text-ktip-ocean-700 hover:underline"
                    onClick={() => openDeck(solution.pitch_deck_path!).catch(() => toast.error(t`Could not open the file.`))}
                  >
                    {deckFileName(solution.pitch_deck_path)}
                  </button>
                  {!locked && (
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={removeDeck.isPending}
                      icon={<Trash2 size={14} aria-hidden="true" />}
                      onClick={() =>
                        removeDeck.mutate(solution, {
                          onError: (err: any) => toast.error(err?.message || t`Could not remove the file.`),
                        })
                      }
                    >
                      <Trans>Remove</Trans>
                    </Button>
                  )}
                </div>
              ) : null}
              {!locked && (
                <div>
                  <input
                    ref={fileInput}
                    type="file"
                    accept=".pdf,.pptx,.ppt,.odp,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      onDeckFile(e.target.files?.[0])
                      e.target.value = ''
                    }}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!solution}
                    loading={uploadDeck.isPending}
                    icon={<Upload size={14} aria-hidden="true" />}
                    onClick={() => fileInput.current?.click()}
                  >
                    {solution?.pitch_deck_path ? <Trans>Replace file</Trans> : <Trans>Upload a file</Trans>}
                  </Button>
                  <p className="mt-1 text-caption text-ktip-sand-500">
                    <Trans>PDF or slides, 25 MB at most. It stays private: rival teams never see it.</Trans>
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {step === EVIDENCE && (
          <div className="flex flex-col gap-4">
            {desk.criteria.length === 0 ? (
              <p className="text-sm text-ktip-sand-600">
                <Trans>The brief has no objectives or deliverables to answer. Move on to the review.</Trans>
              </p>
            ) : (
              desk.criteria.map((c) => {
                const v = draft.evidence[c.id] ?? { note: '', url: '' }
                return (
                  <fieldset key={c.id} className="rounded-xl border border-ktip-sand-200 p-4">
                    <legend className="px-1 text-label font-semibold text-ktip-sand-800">
                      {c.title}
                      {!c.is_required && (
                        <span className="ml-2 font-normal text-ktip-sand-500">
                          <Trans>optional</Trans>
                        </span>
                      )}
                    </legend>
                    {c.description && <p className="mb-2 text-sm text-ktip-sand-600">{c.description}</p>}
                    <Textarea
                      aria-label={t`How your entry meets ${c.title}`}
                      placeholder={t`How your entry meets this`}
                      value={v.note}
                      onChange={(e) => setEvidence(c.id, { note: e.target.value })}
                      rows={3}
                      maxLength={2000}
                      disabled={locked}
                      fullWidth
                    />
                    <Input
                      aria-label={t`Link to show it`}
                      placeholder={t`Link to show it (optional)`}
                      value={v.url}
                      onChange={(e) => setEvidence(c.id, { url: e.target.value })}
                      error={errors[`ev:${c.id}`]}
                      disabled={locked}
                      inputMode="url"
                      className="mt-2"
                      fullWidth
                    />
                  </fieldset>
                )
              })
            )}
          </div>
        )}

        {step === REVIEW && (
          <div className="flex flex-col gap-4">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <ReviewItem label={t`Project title`} value={draft.title} />
              <ReviewItem label={t`Team`} value={desk.team.members.map((m) => m.display_name).filter(Boolean).join(', ')} />
              <ReviewItem label={t`Summary`} value={draft.description} wide />
              <ReviewItem label={t`Code repository`} value={draft.repo_url} link />
              <ReviewItem
                label={t`Demo video`}
                value={draft.demo_video_url ? `${draft.demo_video_url}${draft.video_length ? ` (${draft.video_length})` : ''}` : ''}
              />
              <ReviewItem
                label={t`Pitch deck`}
                value={draft.pitch_deck_url || deckFileName(solution?.pitch_deck_path)}
              />
              <ReviewItem
                label={t`AI declaration`}
                value={
                  draft.ai_use === 'none'
                    ? t`No material AI help`
                    : draft.ai_use === 'assisted'
                      ? t`AI tools materially helped`
                      : draft.ai_use === 'drafted'
                        ? t`AI wrote the first full draft`
                        : ''
                }
              />
            </dl>
            <MissingList items={missing.map(missingLabel)} onJump={(s) => setStep(s)} />
          </div>
        )}

        {step === SUBMIT && (
          <div className="flex flex-col gap-4">
            {locked ? (
              <p className="text-sm text-ktip-sand-600">
                <Trans>Entries are closed, so nothing can be changed or submitted now.</Trans>
              </p>
            ) : missing.length ? (
              <MissingList items={missing.map(missingLabel)} onJump={(s) => setStep(s)} />
            ) : (
              <div className="flex flex-col items-start gap-3">
                <p className="text-sm text-ktip-sand-700">
                  <Trans>Everything is in. Submitting saves a copy for every teammate. You can still edit and submit again until the deadline.</Trans>
                </p>
                <Button
                  onClick={onSubmit}
                  loading={submit.isPending}
                  disabled={!solution}
                  icon={<Send size={16} aria-hidden="true" />}
                >
                  {submittedAt ? <Trans>Submit again</Trans> : <Trans>Submit entry</Trans>}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ktip-sand-100 pt-3">
        <div className="flex gap-2">
          {step > PROJECT && (
            <Button variant="ghost" size="sm" onClick={() => go((step - 1) as Step)} disabled={save.isPending}>
              <Trans>Back</Trans>
            </Button>
          )}
          {step < SUBMIT && (
            <Button size="sm" onClick={() => go((step + 1) as Step)} loading={save.isPending}>
              {locked || step >= REVIEW ? <Trans>Next</Trans> : <Trans>Save and continue</Trans>}
            </Button>
          )}
        </div>
        {desk.receipt && (
          <Button variant="outline" size="sm" onClick={() => setShowReceipt((v) => !v)}>
            {showReceipt ? <Trans>Hide receipt</Trans> : <Trans>View receipt</Trans>}
          </Button>
        )}
      </div>

      {showReceipt && desk.receipt && (
        <div className="rounded-xl border border-ktip-sand-200 bg-ktip-cream p-4">
          <ReceiptDocument
            title={desk.receipt.title}
            subtitle={desk.receipt.subtitle}
            submittedAt={desk.receipt.submitted_at}
            sections={receiptToSections(desk.receipt)}
            footer={t`KTIP submission copy · Reference ${desk.receipt.id}`}
          />
          <Link
            to={`/dashboard/submissions/${desk.receipt.id}`}
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-ktip-ocean-700 hover:underline"
          >
            <ExternalLink size={14} aria-hidden="true" />
            <Trans>Open the printable copy</Trans>
          </Link>
        </div>
      )}
    </Shell>
  )
}

function Shell({
  children,
  deadline,
  now,
  teamName,
}: {
  children: ReactNode
  deadline?: string | null
  now?: number
  teamName?: string
}) {
  const { t } = useLingui()
  const target = deadline ? new Date(deadline).getTime() : NaN
  const left = Number.isFinite(target) && now ? target - now : NaN

  return (
    <section
      className="flex h-full min-w-0 flex-col gap-3 rounded-2xl border border-ktip-sand-200 bg-white p-4"
      aria-label={t`Submission Desk`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-xl font-bold text-ktip-sand-900">
            <Trans>Submission Desk</Trans>
          </h3>
          {teamName && <p className="truncate text-sm text-ktip-sand-600">{teamName}</p>}
        </div>
        {Number.isFinite(left) && (
          <div className="text-right">
            <p className={`font-display text-lg font-bold ${left <= 0 ? 'text-ktip-sand-500' : left < 3_600_000 ? 'text-red-600' : 'text-ktip-sand-900'}`}>
              {left <= 0 ? t`Closed` : timeLeft(left)}
            </p>
            <p className="flex items-center justify-end gap-1 text-xs text-ktip-sand-500">
              <Clock size={12} aria-hidden="true" />
              {left <= 0 ? (
                <Trans>Closed {format(target, 'd MMM, HH:mm')}</Trans>
              ) : (
                <Trans>Closes {format(target, 'd MMM, HH:mm')}</Trans>
              )}
            </p>
          </div>
        )}
      </header>
      {children}
    </section>
  )
}

function ReviewItem({
  label,
  value,
  wide,
  link,
}: {
  label: string
  value: string | null | undefined
  wide?: boolean
  link?: boolean
}) {
  const { t } = useLingui()
  const text = value?.trim()
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="text-xs font-semibold uppercase tracking-wide text-ktip-sand-500">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap break-words text-ktip-sand-900">
        {!text ? (
          <span className="text-ktip-sand-400">{t`Not added`}</span>
        ) : link && isHttpUrl(text) ? (
          <a href={text} target="_blank" rel="noopener noreferrer" className="text-ktip-ocean-700 underline">
            {text}
          </a>
        ) : (
          text
        )}
      </dd>
    </div>
  )
}

function MissingList({
  items,
  onJump,
}: {
  items: Array<{ label: string; step: Step }>
  onJump: (step: Step) => void
}) {
  if (!items.length) {
    return (
      <p className="flex items-center gap-2 text-sm font-medium text-ktip-tropical-700">
        <CheckCircle2 size={15} aria-hidden="true" />
        <Trans>Nothing missing. You can submit.</Trans>
      </p>
    )
  }
  return (
    <div className="rounded-xl border border-ktip-sun-200 bg-ktip-sun-50 p-3">
      <p className="text-sm font-semibold text-ktip-sun-900">
        <Trans>Still missing</Trans>
      </p>
      <ul className="mt-1 flex flex-col gap-1">
        {items.map((item) => (
          <li key={item.label}>
            <button
              type="button"
              onClick={() => onJump(item.step)}
              className="text-left text-sm text-ktip-sun-900 underline-offset-2 hover:underline"
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
