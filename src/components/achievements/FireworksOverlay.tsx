import { useEffect, useMemo, useState } from 'react'

/**
 * Celebration particles behind the unlock popup.
 *
 * CSS transforms on a few dozen spans, not canvas: this runs at most once per
 * unlock, on devices that include low-end phones across the region, and a
 * canvas loop would be more machinery than the effect is worth.
 *
 * Honours prefers-reduced-motion by rendering nothing at all — a static burst
 * of confetti is not a meaningful substitute, and the popup reads fine without it.
 */

const PARTICLE_COUNT = 28

// Brand primitives only. Sun and tropical are used as fills here, never as
// text, so the index.css contrast floor does not apply.
const COLORS = ['#FFC72C', '#97D700', '#2A5788', '#FFD75C', '#AEE12B']

interface FireworksOverlayProps {
  /** Restarting the animation on a new unlock: change this. */
  runKey?: string | number
  durationMs?: number
}

export function FireworksOverlay({ runKey, durationMs = 1600 }: FireworksOverlayProps) {
  const [reduced, setReduced] = useState(true)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(query.matches)

    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    setDone(false)
    const timer = setTimeout(() => setDone(true), durationMs)
    return () => clearTimeout(timer)
  }, [runKey, durationMs])

  // Deterministic per run so a re-render mid-animation does not reshuffle
  // every particle into a new position.
  const particles = useMemo(
    () =>
      Array.from({ length: PARTICLE_COUNT }, (_, i) => {
        const angle = (i / PARTICLE_COUNT) * Math.PI * 2
        const distance = 90 + ((i * 37) % 70)
        return {
          x: Math.cos(angle) * distance,
          y: Math.sin(angle) * distance,
          color: COLORS[i % COLORS.length],
          delay: (i % 6) * 40,
          size: 5 + (i % 4) * 2,
        }
      }),
    [runKey]
  )

  if (reduced || done) return null

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <style>{`
        @keyframes ktip-firework {
          0%   { transform: translate(-50%, -50%) scale(0.4); opacity: 1; }
          70%  { opacity: 1; }
          100% { transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(1); opacity: 0; }
        }
      `}</style>
      {particles.map((particle, i) => (
        <span
          key={i}
          className="absolute left-1/2 top-1/2 rounded-full"
          style={
            {
              width: particle.size,
              height: particle.size,
              background: particle.color,
              '--dx': `${particle.x}px`,
              '--dy': `${particle.y}px`,
              animation: `ktip-firework ${durationMs}ms cubic-bezier(0.16, 1, 0.3, 1) ${particle.delay}ms forwards`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  )
}
