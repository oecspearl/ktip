import { ShieldAlert } from 'lucide-react'

interface QuarantineNoticeProps {
  /** Shown to the author; reviewers get the moderator wording instead. */
  isAuthor?: boolean
  isModerator?: boolean
  className?: string
}

/**
 * Placeholder for content the viewer can see the shape of but not the body of.
 * Only rendered for the author and for moderators — RLS keeps quarantined rows
 * out of everyone else's result set entirely, so there is nothing to replace.
 */
export function QuarantineNotice({ isAuthor, isModerator, className = '' }: QuarantineNoticeProps) {
  return (
    <div
      className={`flex items-start gap-2.5 p-3 rounded-xl bg-ktip-sun-50 border border-ktip-sun-200 ${className}`}
    >
      <ShieldAlert size={16} className="text-ktip-sun-700 mt-0.5 flex-shrink-0" />
      <p className="text-xs text-ktip-sun-800">
        {isModerator
          ? 'Quarantined pending review. Only you and the author can see it.'
          : isAuthor
            ? 'This is held for review by our safety team and is not visible to others yet.'
            : 'This content is unavailable.'}
      </p>
    </div>
  )
}

export default QuarantineNotice
