import { Play } from 'lucide-react'
import { useLingui } from '@lingui/react/macro'
import { cn } from '../../../../lib/utils'
import { isHttpUrl } from '../../../../lib/submission-checklist'

/** Site colours only: ocean, green, sun and navy, each as a soft sweep. */
const SWEEPS = [
  'bg-[linear-gradient(135deg,var(--color-brand-navy),var(--color-ktip-ocean-400))]',
  'bg-[linear-gradient(135deg,var(--color-ktip-tropical-700),var(--color-ktip-tropical-400))]',
  'bg-[linear-gradient(135deg,var(--color-ktip-sun-700),var(--color-ktip-sun-400))]',
  'bg-[linear-gradient(135deg,var(--color-brand-navy),var(--color-ktip-tropical-700))]',
]

/**
 * The picture that stands for an entry's demo video.
 *
 * No frame of the video is stored, so this is a colour sweep with a play mark
 * and the length. It opens the video in a new tab when the entry has one, and
 * is plain decoration when it does not.
 */
export function DemoThumb({
  index,
  href,
  seconds,
  title,
  className,
}: {
  /** Which sweep to use, so neighbours differ. */
  index: number
  href?: string | null
  seconds?: number | null
  /** The entry's name, for the link's label. */
  title: string
  className?: string
}) {
  const { t } = useLingui()
  const sweep = SWEEPS[((index % SWEEPS.length) + SWEEPS.length) % SWEEPS.length]
  const length =
    seconds && seconds > 0 ? `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}` : null
  const body = (
    <>
      <span className="grid h-10 w-10 place-items-center rounded-full bg-white/90 text-ktip-sand-900">
        <Play size={16} className="translate-x-px" aria-hidden="true" />
      </span>
      {length && (
        <span className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-micro font-bold tabular-nums text-white">
          {length}
        </span>
      )}
    </>
  )
  const shell = cn('relative grid aspect-video w-full place-items-center overflow-hidden', sweep, className)

  if (href && isHttpUrl(href)) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" aria-label={t`Watch the demo for ${title}`} className={cn(shell, 'transition hover:brightness-110')}>
        {body}
      </a>
    )
  }
  // No video yet: the picture alone, with nothing to press.
  return (
    <div className={cn(shell, 'opacity-70')} aria-hidden="true">
      {body}
    </div>
  )
}
