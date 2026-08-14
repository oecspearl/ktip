import type { ReactNode } from 'react'
import { FALLBACK_IMAGE } from '../../lib/hero-images'
import { ResponsiveImage } from '../ui/ResponsiveImage'

// Homepage-style backdrop for the bare auth pages (login/signup/reset):
// hero photo + frosted blur + dark gradient overlays behind a centered card.
// The base fill is brand-navy rather than gray-900 — the gray scale inverts
// under html.dark, which turned this whole backdrop white at night.
export function AuthBackdrop({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="relative bg-brand-navy min-h-screen flex items-center justify-center p-4 overflow-hidden">
      <ResponsiveImage
        src={FALLBACK_IMAGE}
        alt=""
        sizes="100vw"
        className="absolute inset-0 w-full h-full object-cover"
        loading="eager" fetchPriority="high" decoding="async"
      />
      <div className="absolute inset-y-0 left-0 w-full md:w-[80%] backdrop-blur-2xl bg-black/10 [mask-image:linear-gradient(to_right,black_55%,transparent_100%)]" />
      <div className="absolute inset-0 bg-gradient-to-l from-black/75 via-black/40 to-black/30" />
      <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-black/70 to-transparent" />
      <div className={`relative w-full mx-auto ${wide ? 'max-w-2xl' : 'max-w-md'}`}>{children}</div>
    </div>
  )
}
