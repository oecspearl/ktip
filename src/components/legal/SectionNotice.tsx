import { useState } from 'react'
import { Link, Outlet } from 'react-router'
import { ShieldCheck } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { cn } from '../../lib/utils'
import { legalPath } from '../../lib/legal/manifest'
import { useSectionNotice, type SectionNoticeKey } from '../../hooks/useSectionNotice'

/**
 * The notice a member sees the first time they enter the Forums or open
 * Messages, and the line that stays at the bottom afterwards (171).
 *
 * A reminder of rules already accepted at sign-up, not a new agreement: the
 * documents are in the account bundle. So it never blocks reading, closing it
 * without "I understand" simply shows it again next visit, and signed-out
 * readers, who cannot post, never see the dialog.
 */
function useNoticeCopy(section: SectionNoticeKey) {
  const { t } = useLingui()
  if (section === 'forums') {
    return {
      title: t`Before you join the discussion`,
      lede: t`The rules you agreed to at sign-up apply to every post and reply here.`,
      points: [
        t`Argue with the idea, not the person. Harassment and hate speech are taken down.`,
        t`Don't post anyone's private details.`,
        t`Only post work you own or have permission to use.`,
        t`Keep conversations on KTIP. Don't ask a member under 18 to move to another app.`,
      ],
      footer: t`Posts here follow the Community Guidelines and the Safeguarding rules. If something breaks them, report it from the post.`,
    }
  }
  return {
    title: t`Private messages follow the rules too`,
    lede: t`The Community Guidelines apply in direct and group messages. Private doesn't mean unregulated.`,
    points: [
      t`No harassment, threats or unsolicited promotion.`,
      t`Never ask a member to pay a fee for a grant, a placement or an opportunity.`,
      t`Keep conversations on KTIP. Don't ask a member under 18 to move to another app.`,
      t`If a message breaks the rules, report it from the message.`,
    ],
    footer: t`Messages follow the Community Guidelines and the Safeguarding rules.`,
  }
}

function PolicyLinks({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex flex-wrap gap-x-3 gap-y-1', className)}>
      <Link
        to={legalPath('acceptable-use')}
        className="font-semibold text-ktip-ocean-700 hover:underline underline-offset-2"
      >
        <Trans>Community Guidelines</Trans>
      </Link>
      <Link
        to={legalPath('safeguarding')}
        className="font-semibold text-ktip-ocean-700 hover:underline underline-offset-2"
      >
        <Trans>Safeguarding</Trans>
      </Link>
    </span>
  )
}

function NoticeBody({ section, onAcknowledge }: { section: SectionNoticeKey; onAcknowledge: () => void }) {
  const copy = useNoticeCopy(section)
  return (
    <div className="space-y-4">
      <p className="text-body leading-relaxed text-ktip-sand-700">{copy.lede}</p>
      <ul className="space-y-2">
        {copy.points.map((point) => (
          <li key={point} className="flex gap-2.5 text-body leading-relaxed text-ktip-sand-800">
            <ShieldCheck size={16} aria-hidden className="mt-1 shrink-0 text-ktip-tropical-600" />
            <span>{point}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ktip-sand-200 pt-4">
        <PolicyLinks className="text-label" />
        <Button onClick={onAcknowledge}>
          <Trans>I understand</Trans>
        </Button>
      </div>
    </div>
  )
}

/** The once-per-member dialog. Mount it on the page; it decides whether to show. */
export function SectionNoticeDialog({ section }: { section: SectionNoticeKey }) {
  const notice = useSectionNotice(section)
  const copy = useNoticeCopy(section)
  // Closing without "I understand" hides it for this visit only. Nothing is
  // written, so it comes back next time.
  const [dismissed, setDismissed] = useState(false)
  if (!notice.shouldShow || dismissed) return null
  return (
    <Modal open onClose={() => setDismissed(true)} title={copy.title} size="md">
      <NoticeBody section={section} onAcknowledge={notice.acknowledge} />
    </Modal>
  )
}

/**
 * The same notice as a card inside a surface that is not a page, the docked
 * Messages panel, where a modal would sit over the wrong thing.
 */
export function SectionNoticeCard({ section, className }: { section: SectionNoticeKey; className?: string }) {
  const notice = useSectionNotice(section)
  const copy = useNoticeCopy(section)
  if (!notice.shouldShow) return null
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={`section-notice-${section}`}
      className={cn('absolute inset-0 z-raised overflow-y-auto bg-ktip-cream/95 p-4 backdrop-blur-sm', className)}
    >
      <div className="mx-auto max-w-md rounded-xl border border-ktip-sand-200 bg-white p-5 shadow-hard">
        <h3 id={`section-notice-${section}`} className="mb-3 font-display text-title-sm font-bold text-ktip-sand-900">
          {copy.title}
        </h3>
        <NoticeBody section={section} onAcknowledge={notice.acknowledge} />
      </div>
    </div>
  )
}

/** The line that stays at the bottom, for everyone, signed in or not. */
export function SectionNoticeBanner({
  section,
  compact,
  className,
}: {
  section: SectionNoticeKey
  compact?: boolean
  className?: string
}) {
  const copy = useNoticeCopy(section)
  return (
    <aside
      aria-label={copy.title}
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-ktip-sand-200 bg-ktip-sand-50 text-ktip-sand-600',
        compact ? 'px-3 py-1.5 text-micro' : 'px-4 py-3 text-caption',
        className
      )}
    >
      <ShieldCheck size={compact ? 12 : 14} aria-hidden className="shrink-0 text-ktip-tropical-600" />
      <span>{copy.footer}</span>
      <PolicyLinks />
    </aside>
  )
}

/**
 * Layout route around the public forum pages in App.tsx: the dialog once, the
 * banner under every page. One place, so a new forum page cannot miss it.
 */
export default function ForumsNoticeLayout() {
  return (
    <>
      <Outlet />
      <div className="w-full max-w-page mx-auto px-4 pb-8">
        <SectionNoticeBanner section="forums" className="rounded-surface border" />
      </div>
      <SectionNoticeDialog section="forums" />
    </>
  )
}
