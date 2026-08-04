import type { BannerSpec } from '../../lib/banner'
import { AURORA_GRAIN_URI, auroraCss, auroraLayout } from '../../lib/banner'
import { cn } from '../../lib/utils'

interface BannerAuroraProps {
  spec: Extract<BannerSpec, { kind: 'gradient' }>
  /**
   * Animated (blurred blob layers that drift, the full formula) or static
   * (the radial-gradient approximation). Static is for surfaces that show
   * many banners at once — 48 directory cards each running three blurred,
   * animated, blended layers is a compositor bill nobody needs to pay.
   */
  animated?: boolean
  className?: string
}

/**
 * The aurora gradient banner: near-black canvas, flat colour shapes diffused
 * into glow by heavy blur, blended additively (`plus-lighter`, the reference
 * technique), grain on top. Blobs drift on slow offset loops so the gradient
 * appears to move as they diffuse through each other; stilled under
 * prefers-reduced-motion by the global animation rules in index.css.
 *
 * Positioned absolute-inset: give the parent `relative overflow-hidden`.
 */
export function BannerAurora({ spec, animated = true, className }: BannerAuroraProps) {
  if (!animated) {
    return (
      <div aria-hidden className={cn('absolute inset-0', className)}>
        <div className="absolute inset-0" style={auroraCss(spec)} />
        <Grain />
      </div>
    )
  }

  const { base, blobs } = auroraLayout(spec)
  return (
    <div
      aria-hidden
      className={cn('absolute inset-0 overflow-hidden', className)}
      style={{ backgroundColor: base }}
    >
      {blobs.map((b, i) => (
        <div
          key={i}
          className={`absolute rounded-full aurora-blob aurora-drift-${b.driftTrack}`}
          style={{
            left: `${b.cx}%`,
            top: `${b.cy}%`,
            // Sized off the larger axis so a blob stays round on wide bands.
            width: `${b.r * 2}%`,
            aspectRatio: '1 / 1',
            marginLeft: `-${b.r}%`,
            marginTop: `-${b.r}%`,
            // The falloff does half the diffusion, the blur does the rest —
            // pure blur on a hard-edged circle needs 200px+ to stop ringing.
            background: `radial-gradient(circle closest-side, ${b.color}, transparent 78%)`,
            animationDuration: `${b.driftDuration}s`,
            animationDelay: `-${(i * b.driftDuration) / Math.max(blobs.length, 1)}s`,
          }}
        />
      ))}
      <Grain />
    </div>
  )
}

function Grain() {
  return (
    <div
      className="absolute inset-0 opacity-[0.14] mix-blend-overlay"
      style={{ backgroundImage: `url("${AURORA_GRAIN_URI}")`, backgroundSize: '160px 160px' }}
    />
  )
}
