import { useLayoutEffect, useRef } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import { cn } from '../../lib/utils'
import type { ShareTarget } from '../../lib/share/targets'
import type { ShareApp } from './share-apps'

/**
 * How the post will look in the app it is going to, with the message typed
 * straight into it. The mock-ups are drawn light, like a screenshot of each
 * app, whatever the site's own theme; they are not pixel copies of anyone's UI,
 * just enough for a member to see where the text and the link card land.
 */

/** The picture link previews show, or a navy card with the title when the page has none. */
function LinkImage({ target, kindLabel, className }: { target: ShareTarget; kindLabel: string; className?: string }) {
  return (
    <div className={cn('relative max-w-full overflow-hidden bg-ktip-ocean-700', className)}>
      {target.image ? (
        <img src={target.image} alt="" className="size-full object-cover" loading="lazy" />
      ) : (
        <div className="flex size-full flex-col justify-end bg-gradient-to-br from-ktip-ocean-800 to-ktip-ocean-600 p-4">
          <span className="font-display text-lg font-bold leading-tight text-white">{target.title}</span>
        </div>
      )}
      <span className="absolute left-2.5 top-2.5 rounded bg-black/60 px-2 py-0.5 text-micro font-bold uppercase tracking-wider text-white">
        {kindLabel}
      </span>
    </div>
  )
}

function LinkMeta({ host, title, className }: { host: string; title: string; className?: string }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-0.5 px-3.5 py-2.5', className)}>
      <span className="text-micro uppercase tracking-wide text-[#65676B]">{host}</span>
      <span className="break-words text-sm font-semibold leading-snug text-[#0F1419]">{title}</span>
    </div>
  )
}

/** The message, typed into the preview. Grows with its text instead of scrolling. */
function PostText({
  value,
  onChange,
  label,
  className,
}: {
  value: string
  onChange: (text: string) => void
  label: string
  className?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      rows={2}
      className={cn(
        'block w-full resize-none border-0 bg-transparent p-0 text-base leading-relaxed text-inherit md:text-sm',
        'rounded-sm focus:outline-dashed focus:outline-2 focus:outline-offset-4 focus:outline-ktip-ocean-400',
        className
      )}
    />
  )
}

const card = 'overflow-hidden rounded-xl border border-[#E4E6EB] bg-white text-[#0F1419]'

export function SharePreview({
  app,
  target,
  host,
  kindLabel,
  text,
  onText,
  writing,
}: {
  app: ShareApp
  target: ShareTarget
  host: string
  kindLabel: string
  text: string
  onText: (text: string) => void
  writing: boolean
}) {
  const { t } = useLingui()
  const appName = app.name
  const editor = (
    <PostText
      value={text}
      onChange={onText}
      label={t`Message for ${appName}`}
      className={cn(writing && 'opacity-40 motion-safe:animate-pulse')}
    />
  )
  const you = (sub: string) => (
    <div className="flex items-center gap-2.5 px-3.5 py-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-ktip-ocean-700 text-xs font-bold text-white">
        <Trans>You</Trans>
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-sm font-bold">
          <Trans>Your post</Trans>
        </span>
        <span className="text-micro text-[#65676B]">{sub}</span>
      </span>
    </div>
  )

  let body
  switch (app.id) {
    case 'whatsapp':
      body = (
        <div className="overflow-hidden rounded-xl border border-[#E4E6EB] text-[#111B21]">
          <div className="bg-[#075E54] px-3.5 py-2.5 text-sm font-bold text-white">
            <Trans>Group chat</Trans>
          </div>
          <div className="bg-[#EFEAE2] px-2.5 py-3.5">
            <div className="ml-auto grid w-full max-w-[94%] gap-1 rounded-lg bg-[#D9FDD3] p-1">
              <div className="overflow-hidden rounded-md bg-[#F7F8FA]">
                <LinkImage target={target} kindLabel={kindLabel} className="aspect-[1.91/1]" />
                <LinkMeta host={host} title={target.title} />
              </div>
              <div className="px-1.5 py-0.5">{editor}</div>
              <span className="break-all px-1.5 text-micro text-[#027EB5]">{target.url}</span>
              <span className="justify-self-end px-1.5 pb-0.5 text-micro text-[#667781]">✓✓</span>
            </div>
          </div>
        </div>
      )
      break
    case 'linkedin':
    case 'facebook':
      body = (
        <div className={card}>
          {you(app.id === 'linkedin' ? 'LinkedIn' : 'Facebook')}
          <div className="px-3.5 pb-3">{editor}</div>
          <LinkImage target={target} kindLabel={kindLabel} className="aspect-[1.91/1]" />
          <LinkMeta host={host} title={target.title} className="border-t border-[#E4E6EB] bg-[#F3F2EF]" />
        </div>
      )
      break
    case 'x':
      body = (
        <div className={card}>
          {you('X')}
          <div className="px-3.5 pb-3">
            {editor}
            <span className="mt-1 block break-all text-sm text-[#1D9BF0]">{host}/…</span>
          </div>
          <div className="mx-3.5 mb-3.5 overflow-hidden rounded-2xl border border-[#E4E6EB]">
            <LinkImage target={target} kindLabel={kindLabel} className="aspect-[1.91/1]" />
            <LinkMeta host={host} title={target.title} />
          </div>
        </div>
      )
      break
    case 'instagram':
      body = (
        <div className="grid gap-3.5 @md:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] @md:items-start">
          <div className="relative mx-auto aspect-[9/16] w-full max-w-60 overflow-hidden rounded-xl bg-ktip-ocean-700">
            <LinkImage target={target} kindLabel={kindLabel} className="h-[45%]" />
            <div className="flex flex-col gap-2 border-t-4 border-ktip-tropical-500 p-4">
              <span className="break-words font-display text-lg font-bold leading-tight text-white">{target.title}</span>
            </div>
            <span className="absolute inset-x-0 bottom-5 mx-auto w-fit max-w-[85%] truncate rounded-lg bg-white px-3 py-1.5 text-micro font-extrabold uppercase text-[#0F1419]">
              🔗 {host}
            </span>
          </div>
          <div className={cn(card, 'px-3.5 py-3')}>
            <span className="mb-1 block text-micro font-bold uppercase tracking-wide text-[#65676B]">
              <Trans>Caption</Trans>
            </span>
            {editor}
          </div>
        </div>
      )
      break
    default:
      body = (
        <div className={card}>
          <div className="flex min-w-0 flex-col gap-0.5 border-b border-[#E4E6EB] px-3.5 py-2.5">
            <span className="text-micro uppercase tracking-wide text-[#65676B]">
              <Trans>Subject</Trans>
            </span>
            <span className="break-words text-sm font-semibold">{target.title}</span>
          </div>
          <div className="px-3.5 py-3">
            {editor}
            <span className="mt-2 block break-all text-sm text-[#1D9BF0]">{target.url}</span>
          </div>
        </div>
      )
  }

  return (
    <div className="relative" aria-busy={writing}>
      {body}
      {writing && (
        <span className="absolute left-3 top-3 rounded-md border border-[#E4E6EB] bg-white px-2 py-0.5 text-micro font-bold text-[#65676B]">
          <Trans>Writing for {appName}…</Trans>
        </span>
      )}
    </div>
  )
}
