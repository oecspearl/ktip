import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ArrowRight } from 'lucide-react'
import { Trans } from '@lingui/react/macro'
import { ResponsiveImage } from '../ui/ResponsiveImage'

/**
 * The auth photo. Its own frame rather than the shared FALLBACK_IMAGE: this is
 * the first thing anyone sees of the platform, so it is chosen for these pages
 * and does not move when the hero fallback does.
 */
const AUTH_PHOTO = '/photos/auth-backdrop.webp'

// Homepage-style backdrop for the bare auth pages (login/signup/reset):
// hero photo + frosted blur + dark gradient overlays behind a centered card.
// The base fill is brand-navy rather than gray-900 — the gray scale inverts
// under html.dark, which turned this whole backdrop white at night.
export function AuthBackdrop({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="relative bg-brand-navy min-h-screen flex items-center justify-center p-4 overflow-hidden">
      <ResponsiveImage
        src={AUTH_PHOTO}
        alt=""
        sizes="100vw"
        className="absolute inset-0 w-full h-full object-cover"
        loading="eager" fetchPriority="high" decoding="async"
      />
      <div className="absolute inset-y-0 right-0 w-full md:w-[80%] backdrop-blur-2xl bg-black/10 [mask-image:linear-gradient(to_left,black_55%,transparent_100%)]" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/40 to-black/30" />
      <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-black/70 to-transparent" />
      {/* Same pill the split shell wears on its photo panel, so the two auth
          layouts offer the same way out in the same corner. */}
      <Link
        to="/"
        className="absolute top-4 right-4 md:top-6 md:right-6 z-10 inline-flex items-center gap-1.5 rounded-full bg-brand-white/15 px-4 py-1.5 text-sm font-medium text-brand-white backdrop-blur-sm hover:bg-brand-white/25 transition-colors"
      >
        <Trans>Back to website</Trans> <ArrowRight size={14} />
      </Link>
      {/* No `overflow-hidden` here, which is why the watermark sits wholly
          inside the panel rather than bleeding off its corner: a clip on this
          wrapper would cut the shadow off at the same edge.

          The wrapper is exactly the card's box, so the shadow and the lift live
          here rather than on five pages' cards. The shadow is deep and offset
          downward — the card should read as held above the photo, not printed
          on it — and the radius matches the card's `rounded-lg` so the shadow
          hugs its corners. The lift sits the card a little above true centre,
          where the eye expects a floating panel to rest. */}
      <div
        className={`relative w-full mx-auto rounded-lg -translate-y-2 md:-translate-y-4 shadow-[0_30px_60px_-12px_rgba(0,0,0,0.6),0_12px_24px_-8px_rgba(0,0,0,0.45)] ${wide ? 'max-w-2xl' : 'max-w-md'}`}
      >
        {children}
        {/* Over the card, not behind it: the panel fill is opaque, so anything
            underneath is simply invisible. Low opacity and `pointer-events-none`
            keep it a watermark rather than a thing to click, and it is
            aria-hidden because the page already says "Welcome to KTIP".

            The blend mode flips with the theme. Multiply can only darken, so on
            the cream card the mark tints it; on the near-black night card it
            lands on black and vanishes. Screen can only lighten, which is the
            same trick the other way up — and it needs more opacity to read,
            because the logo's greens are mid-tones and lift a dark ground far
            less than they stain a light one. */}
        <img
          src="/ktip-logo.webp"
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          width={512}
          height={512}
          className="pointer-events-none select-none absolute left-1/2 top-[12%] w-[85%] -translate-x-1/2 opacity-[0.12] mix-blend-multiply dark:opacity-[0.16] dark:mix-blend-screen"
        />
      </div>
    </div>
  )
}
