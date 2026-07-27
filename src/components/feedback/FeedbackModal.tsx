import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { Textarea } from '../ui/Textarea'
import { Button } from '../ui/Button'
import { useCreateFeedback } from '../../hooks/useFeedback'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import type { FeedbackCategory } from '../../types'

const CATEGORIES: { value: FeedbackCategory; label: string }[] = [
  { value: 'general', label: 'General feedback' },
  { value: 'bug', label: 'Bug report' },
  { value: 'feature_request', label: 'Feature request' },
  { value: 'content', label: 'Content issue' },
]

interface FeedbackModalProps {
  open: boolean
  onClose: () => void
}

export function FeedbackModal({ open, onClose }: FeedbackModalProps) {
  const auth = useAuth()
  const toast = useToast()
  const { createFeedback, loading } = useCreateFeedback()

  const [category, setCategory] = useState<FeedbackCategory>('general')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [anonymous, setAnonymous] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!subject.trim() || !message.trim()) return

    try {
      await createFeedback({
        user_id: anonymous ? null : auth.user?.id || null,
        category,
        subject: subject.trim(),
        message: message.trim(),
      })
      toast.success('Thanks for your feedback!')
      setSubject('')
      setMessage('')
      setCategory('general')
      setAnonymous(false)
      onClose()
    } catch (err: any) {
      toast.error(err.message || 'Failed to send feedback')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Send Feedback"
      description="Tell us what's working, what's broken, or what you'd like to see"
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-ktip-sand-700">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as FeedbackCategory)}
            className="w-full border border-ktip-sand-200 rounded-xl px-4 py-3 bg-ktip-sand-50/50 transition-all focus:outline-none focus:ring-2 focus:border-ktip-ocean-500 focus:ring-ktip-ocean-500/20 focus:bg-white"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>

        <Input
          label="Subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Short summary..."
          fullWidth
        />

        <Textarea
          label="Message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={5}
          placeholder="The more detail, the better..."
          fullWidth
        />

        <label className="flex items-center gap-2 text-sm text-ktip-sand-600 cursor-pointer">
          <input
            type="checkbox"
            checked={anonymous}
            onChange={(e) => setAnonymous(e.target.checked)}
            className="rounded border-ktip-sand-300"
          />
          Submit anonymously
        </label>

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
            Send Feedback
          </Button>
        </div>
      </form>
    </Modal>
  )
}
