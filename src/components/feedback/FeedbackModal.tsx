import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router'
import { Bug, Camera, Heart, Lightbulb, MessageCircle, Star, X } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { Textarea } from '../ui/Textarea'
import { Button } from '../ui/Button'
import { ScreenshotAnnotator } from './ScreenshotAnnotator'
import { useCreateFeedback } from '../../hooks/useFeedback'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { supabase } from '../../lib/supabase'
import { CaptureCancelledError, captureScreen, isScreenCaptureSupported } from '../../lib/screen-capture'
import { cn } from '../../lib/utils'
import type { FeedbackCategory } from '../../types'

/** What the person is doing, not what a triage queue calls it. The stored
 *  category is the same vocabulary 037 already uses, so the admin filters and
 *  every existing row keep working. */
const KINDS: {
  value: FeedbackCategory
  label: string
  hint: string
  icon: typeof Bug
  tone: string
}[] = [
  {
    value: 'bug',
    label: 'Problem',
    hint: "Something is broken or doesn't work the way it should",
    icon: Bug,
    tone: 'border-red-400 bg-red-50 text-red-700',
  },
  {
    value: 'feature_request',
    label: 'Idea',
    hint: "Something you'd like changed or added",
    icon: Lightbulb,
    tone: 'border-ktip-sun-400 bg-ktip-sun-50 text-ktip-sun-800',
  },
  {
    value: 'praise',
    label: 'Praise',
    hint: 'Something that works well — leave a review',
    icon: Heart,
    tone: 'border-ktip-tropical-400 bg-ktip-tropical-50 text-ktip-tropical-800',
  },
  {
    value: 'general',
    label: 'Anything else',
    hint: 'A question, a comment, a note about the content',
    icon: MessageCircle,
    tone: 'border-ktip-ocean-400 bg-ktip-ocean-50 text-ktip-ocean-700',
  },
]

interface FeedbackModalProps {
  open: boolean
  onClose: () => void
}

async function uploadScreenshot(blob: Blob, userId: string): Promise<string> {
  // uid-namespaced, which is exactly what the storage policy in 093 checks
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`
  const { error } = await supabase.storage
    .from('feedback-screenshots')
    .upload(path, blob, { contentType: 'image/png', upsert: false })
  if (error) throw error
  return path
}

export function FeedbackModal({ open, onClose }: FeedbackModalProps) {
  const auth = useAuth()
  const toast = useToast()
  const { pathname } = useLocation()
  const { createFeedback, loading } = useCreateFeedback()

  const [category, setCategory] = useState<FeedbackCategory>('bug')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [rating, setRating] = useState(0)
  const [anonymous, setAnonymous] = useState(false)
  const [capturing, setCapturing] = useState(false)
  /** The raw grab, being marked up right now */
  const [pendingShot, setPendingShot] = useState<Blob | null>(null)
  /** The flattened, annotated copy that will actually be sent */
  const [shot, setShot] = useState<Blob | null>(null)
  const [shotUrl, setShotUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!shot) {
      setShotUrl(null)
      return
    }
    const url = URL.createObjectURL(shot)
    setShotUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [shot])

  // A screenshot is uploaded under the reporter's own user id, so keeping one
  // attached to an anonymous report would name them anyway.
  useEffect(() => {
    if (anonymous) {
      setShot(null)
      setPendingShot(null)
    }
  }, [anonymous])

  const canScreenshot = !!auth.user && !anonymous && isScreenCaptureSupported()

  const reset = () => {
    setCategory('bug')
    setSubject('')
    setMessage('')
    setRating(0)
    setAnonymous(false)
    setShot(null)
    setPendingShot(null)
  }

  const handleCapture = async () => {
    setCapturing(true)
    try {
      setPendingShot(await captureScreen())
    } catch (err) {
      // Dismissing the browser's share picker is a decision, not a failure
      if (!(err instanceof CaptureCancelledError)) {
        toast.error(err instanceof Error ? err.message : 'Could not capture the screen')
      }
    } finally {
      setCapturing(false)
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!subject.trim() || !message.trim()) return

    const userId = anonymous ? null : auth.user?.id || null

    try {
      // Upload first: a failed upload must not leave a row pointing at a file
      // that was never written.
      let screenshotPath: string | null = null
      if (shot && userId) {
        screenshotPath = await uploadScreenshot(shot, userId)
      }

      await createFeedback({
        user_id: userId,
        category,
        subject: subject.trim(),
        message: message.trim(),
        rating: rating > 0 ? rating : null,
        page_path: pathname,
        screenshot_path: screenshotPath,
      })

      toast.success(category === 'praise' ? 'Thank you — that made our day' : 'Thanks for your feedback!')
      reset()
      onClose()
    } catch (err: any) {
      toast.error(err.message || 'Failed to send feedback')
    }
  }

  const active = KINDS.find((k) => k.value === category) ?? KINDS[0]

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Send feedback"
      description="Tell us what's broken, what you'd change, or what you like"
      size="xl"
      className="max-w-2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div role="radiogroup" aria-label="What kind of feedback" className="grid grid-cols-2 gap-2">
          {KINDS.map(({ value, label, icon: Icon, tone }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={category === value}
              onClick={() => setCategory(value)}
              className={cn(
                'flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors',
                category === value
                  ? tone
                  : 'border-ktip-sand-200 text-ktip-sand-600 hover:bg-ktip-sand-50'
              )}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-ktip-sand-500 -mt-2">{active.hint}</p>

        <Input
          label="Subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder={category === 'praise' ? 'What worked well…' : 'Short summary…'}
          fullWidth
        />

        <Textarea
          label="Details"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={5}
          placeholder="The more detail, the better…"
          fullWidth
        />

        {/* Optional everywhere, not only on praise — a rating on a bug report
            is the difference between an annoyance and a blocker. */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-ktip-sand-700">
            Rating <span className="font-normal text-ktip-sand-500">(optional)</span>
          </label>
          <div role="radiogroup" aria-label="Rating out of five" className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} out of 5`}
                onClick={() => setRating(rating === n ? 0 : n)}
                className="p-0.5 rounded transition-transform hover:scale-110"
              >
                <Star
                  size={24}
                  className={cn(
                    n <= rating ? 'text-ktip-sun-500 fill-ktip-sun-500' : 'text-ktip-sand-300'
                  )}
                />
              </button>
            ))}
            {rating > 0 && (
              <button
                type="button"
                onClick={() => setRating(0)}
                className="ml-2 text-xs text-ktip-sand-500 hover:text-ktip-ocean-600 transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Screenshot */}
        {pendingShot ? (
          <ScreenshotAnnotator
            image={pendingShot}
            onDone={(annotated) => {
              setShot(annotated)
              setPendingShot(null)
            }}
            onRetake={() => {
              setPendingShot(null)
              void handleCapture()
            }}
            onCancel={() => setPendingShot(null)}
          />
        ) : shot && shotUrl ? (
          <div className="flex items-center gap-3 p-3 rounded-xl border border-ktip-sand-200 bg-ktip-sand-50">
            <img
              src={shotUrl}
              alt="Attached screenshot"
              className="w-24 h-16 object-cover rounded-lg border border-ktip-sand-200"
            />
            <div className="flex-1 text-sm text-ktip-sand-600">Screenshot attached</div>
            <Button variant="ghost" size="sm" type="button" onClick={() => setShot(null)} icon={<X size={14} />}>
              Remove
            </Button>
          </div>
        ) : canScreenshot ? (
          <div>
            <Button
              variant="secondary"
              size="sm"
              type="button"
              loading={capturing}
              onClick={handleCapture}
              icon={<Camera size={16} />}
            >
              Capture screen
            </Button>
            <p className="mt-1.5 text-xs text-ktip-sand-500">
              Your browser will ask which window to share — pick this tab. This form disappears for
              the shot, so you get the page, not the form. You can circle the problem before it is
              sent.
            </p>
          </div>
        ) : (
          <p className="text-xs text-ktip-sand-500">
            {!auth.user
              ? 'Sign in to attach a screenshot.'
              : anonymous
                ? 'Screenshots are stored under your account, so they cannot be attached to an anonymous report.'
                : 'This browser cannot capture the screen — describe what you saw instead.'}
          </p>
        )}

        {auth.user && (
          <label className="flex items-center gap-2 text-sm text-ktip-sand-600 cursor-pointer">
            <input
              type="checkbox"
              checked={anonymous}
              onChange={(e) => setAnonymous(e.target.checked)}
              className="rounded border-ktip-sand-300"
            />
            Submit anonymously
          </label>
        )}

        <p className="text-xs text-ktip-sand-500">
          Looking for answers instead?{' '}
          <Link to="/help/faq" onClick={onClose} className="text-ktip-ocean-600 hover:underline">
            Check the FAQ
          </Link>
        </p>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={loading} disabled={!subject.trim() || !message.trim()}>
            Send feedback
          </Button>
        </div>
      </form>
    </Modal>
  )
}
