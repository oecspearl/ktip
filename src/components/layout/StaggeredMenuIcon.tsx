import { cn } from '../../lib/utils'

/*
 * Kept apart from StaggeredMobileMenu on purpose. The bar's hamburger has to
 * be there on first paint, but the drawer it opens does not — Navbar loads the
 * drawer on the first tap. Sharing a module would have pinned the drawer into
 * the entry chunk alongside the icon, since a bundler cannot split one file.
 */

// power4.out — the ease every stage of the open sequence shares
export const EASE_OUT = 'ease-[cubic-bezier(0.16,1,0.3,1)]'
// power3.in — closing is one motion, faster and accelerating away
export const EASE_IN = 'ease-[cubic-bezier(0.55,0,1,0.45)]'

/**
 * The bar's hamburger, in three beats rather than an icon swap: the middle
 * rule slides out to the right, the outer two converge into a cross, and only
 * then does the whole glyph spin. Closing runs the same beats in reverse —
 * every delay below is mirrored, which is why they are written out per state
 * instead of being shared.
 */
export function StaggeredMenuIcon({ open }: { open: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative block h-4 w-5 transition-transform',
        open
          ? `rotate-180 duration-[550ms] delay-[280ms] ${EASE_OUT}`
          : `rotate-0 duration-[350ms] delay-0 ${EASE_IN}`
      )}
    >
      {/* Top rule → the "\" of the cross */}
      <span
        className={cn(
          'absolute left-0 h-[2px] w-5 rounded-full bg-current transition-all duration-300',
          open ? `top-1/2 -translate-y-1/2 rotate-45 delay-[150ms] ${EASE_OUT}` : `top-0 rotate-0 delay-[120ms] ${EASE_IN}`
        )}
      />
      {/* Middle rule — leaves first, comes back last */}
      <span
        className={cn(
          'absolute left-0 top-1/2 h-[2px] w-5 -translate-y-1/2 rounded-full bg-current transition-all duration-200',
          open ? 'translate-x-6 opacity-0 delay-0' : 'translate-x-0 opacity-100 delay-[280ms]'
        )}
      />
      {/* Bottom rule → the "/" of the cross */}
      <span
        className={cn(
          'absolute left-0 h-[2px] w-5 rounded-full bg-current transition-all duration-300',
          open
            ? `top-1/2 -translate-y-1/2 -rotate-45 delay-[150ms] ${EASE_OUT}`
            : `top-full -translate-y-full rotate-0 delay-[120ms] ${EASE_IN}`
        )}
      />
    </span>
  )
}
