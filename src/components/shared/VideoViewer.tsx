import { useState, type ReactNode } from 'react'
import { Eye, ExternalLink, PlayCircle } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { Modal } from '../ui/Modal'
import { toVideoEmbed } from '../../lib/video-embed'
import { cn } from '../../lib/utils'

interface VideoModalProps {
  url: string
  /** Dialog heading; the project or application title reads better than "Video". */
  title?: string
  open: boolean
  onClose: () => void
}

/**
 * The player window. A link that parses into a Loom, Drive, YouTube or Vimeo
 * player plays inline; anything else (a Drive folder, a channel page) gets a
 * line saying so. Both always offer the original link in a new tab.
 */
export function VideoModal({ url, title, open, onClose }: VideoModalProps) {
  const { t } = useLingui()
  const href = url.trim()
  const embed = open ? toVideoEmbed(href) : null
  const heading = title || t`Video`

  return (
    <Modal open={open} onClose={onClose} title={heading} size="3xl">
      {/* Portal events still bubble along the React tree. From a project card's
          corner slot that path runs into BentoCard's preventDefault, which
          would swallow the new-tab link below — so the dialog stops it here. */}
      <div className="flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
        {embed ? (
          <div className="aspect-video w-full overflow-hidden rounded-surface bg-black">
            <iframe
              src={embed.src}
              title={heading}
              className="h-full w-full border-0"
              allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
            />
          </div>
        ) : (
          <p className="text-body text-ktip-sand-700">
            <Trans>This link can't play here. It may point to a folder or a page rather than one video. Open it in a new tab to watch.</Trans>
          </p>
        )}
        {/^https?:\/\//i.test(href) && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 self-start text-caption text-ktip-ocean-600 hover:text-ktip-ocean-700 underline"
          >
            <ExternalLink size={14} aria-hidden="true" />
            <Trans>Open in a new tab</Trans>
          </a>
        )}
      </div>
    </Modal>
  )
}

interface VideoLinkButtonProps {
  url: string
  /** Passed through as the dialog heading. */
  title?: string
  /** Eye in rows and tables; play on cards, where the corner already has an eye-off. */
  icon?: 'eye' | 'play'
  /** On-dark variant for cards drawn over photography. */
  tone?: 'light' | 'dark'
  /** Turns the round icon button into a text button. */
  label?: ReactNode
  iconSize?: number
  className?: string
}

/** A button that opens the video in a pop-up player. Owns its own dialog. */
export function VideoLinkButton({
  url,
  title,
  icon = 'eye',
  tone = 'light',
  label,
  iconSize,
  className,
}: VideoLinkButtonProps) {
  const { t } = useLingui()
  const [open, setOpen] = useState(false)
  const Icon = icon === 'play' ? PlayCircle : Eye
  const name = t`Watch the video`

  return (
    <>
      <button
        type="button"
        aria-label={label ? undefined : name}
        title={name}
        onClick={(e) => {
          // Inside a card link or a table row: open the player, go nowhere else.
          e.preventDefault()
          e.stopPropagation()
          setOpen(true)
        }}
        className={cn(
          label
            ? 'inline-flex items-center gap-1.5 text-caption font-medium text-ktip-ocean-600 hover:text-ktip-ocean-700 transition-colors'
            : 'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors',
          !label &&
            (tone === 'dark'
              ? 'border-white/30 bg-black/30 text-white/80 hover:bg-black/50 hover:text-white'
              : 'border-ktip-sand-200 bg-ktip-cream/90 text-ktip-sand-500 hover:text-ktip-ocean-600 hover:border-ktip-sand-300'),
          className
        )}
      >
        <Icon size={iconSize ?? (label ? 16 : 14)} aria-hidden="true" />
        {label}
      </button>
      <VideoModal url={url} title={title} open={open} onClose={() => setOpen(false)} />
    </>
  )
}
