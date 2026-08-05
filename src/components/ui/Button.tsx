import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/utils'

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'quiet'
type ButtonSize = 'sm' | 'md' | 'lg'
type ButtonShape = 'pill' | 'circle'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: ReactNode
  fullWidth?: boolean
  shape?: ButtonShape
  /** Sticky pressed state for toggle buttons — holds the inset and sets aria-pressed. */
  pressed?: boolean
}

/**
 * Soft-UI (neumorphic) button.
 *
 * The skin is one idea: a single light source at the top-left casts a light
 * shadow at a NEGATIVE offset and a dark shadow at the same POSITIVE offset,
 * blur always 2 × offset. Pressed is the identical pair moved inside. The
 * numbers live in `--shadow-neu-*` in index.css so both halves flip together
 * under html.dark — see the note there.
 *
 * The button paints `--neu-surface`, not a colour of its own. Neumorphism only
 * works when the control is the same colour as what is behind it, and "behind"
 * changes with the container: body declares the page ground, `.neu-surface`
 * (Card, Modal, DropdownPanel, BentoCard) re-declares the card fill. So a
 * button blends wherever it lands without being told where it is.
 *
 * No hover lift. The shadow says the control is carved out of the surface; a
 * thing carved out of the page cannot also float off it, and the old
 * -translate-y-0.5 + scale read as two contradictory depth cues at once.
 */
export function Button({
  className,
  variant,
  size,
  loading,
  icon,
  fullWidth,
  shape,
  pressed,
  children,
  disabled,
  ...others
}: ButtonProps) {
  // Colour only — the shadow comes from the size, so the two never disagree.
  // primary/danger are the exception to the monochrome surface: they carry a
  // fill, which is what makes one action on a screen the obvious one.
  const variantStyles = {
    // Mode-distinct brand pairs (brand-navy/-green are fixed Pantone tokens):
    // light — navy fill, white text, hover flips to green fill + navy text;
    // dark — green fill, navy text, hover inverts to navy fill + green text.
    primary:
      'bg-brand-navy text-white hover:bg-brand-green hover:text-brand-navy disabled:bg-ktip-ocean-400 disabled:hover:bg-ktip-ocean-400 disabled:hover:text-white dark:bg-brand-green dark:text-brand-navy dark:hover:bg-brand-navy dark:hover:text-brand-green dark:disabled:hover:text-brand-navy',
    // "Raised" in the spec sheet: the surface itself, lifted. Label darkens on
    // hover because the shadow cannot brighten without breaking the light source.
    secondary: 'bg-[var(--neu-surface)] text-ktip-sand-700 hover:text-ktip-sand-900',
    // Also raised — no border, which soft-UI has no room for — but keeps the
    // ocean label so it stays tellable from secondary at a glance.
    outline: 'bg-[var(--neu-surface)] text-ktip-ocean-600 hover:text-ktip-ocean-700',
    // Flat until touched: no shadow at rest, inset on press (set below).
    ghost: 'bg-transparent text-ktip-sand-600 hover:text-ktip-sand-900',
    danger:
      'bg-red-600 text-white hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-400',
    // Permanently inset — a recessed well for secondary controls that should
    // read as part of the panel rather than as something to press.
    quiet: 'bg-ktip-sand-100 text-ktip-sand-700 hover:text-ktip-sand-900',
  }

  // min-h is what enforces the 44px minimum hit area: the control tokens carry
  // a max() floor, and a coarse pointer raises it further. Padding alone left
  // `sm` at roughly 34px, which is under the threshold on a phone.
  // The corner is --radius-neu, not --radius-control: at 6px there is not
  // enough arc for the edge gradient to turn and the button reads flat. This
  // is the one place the brand's 6px corner is overruled; see index.css.
  const sizeStyles = {
    sm: 'px-4 py-2 min-h-control-sm text-label rounded-neu-sm',
    md: 'px-6 py-3 min-h-control-md text-body rounded-neu',
    lg: 'px-8 py-4 min-h-control-lg text-body-lg rounded-neu-lg',
  }

  // Offset steps with the control: 5 / 10 / 20, per the sheet.
  // Every class is written out in full — Tailwind v4 scans this file as text,
  // so a composed `active:${...}` would name a class that never gets generated.
  const restShadow = { sm: 'shadow-neu-sm', md: 'shadow-neu', lg: 'shadow-neu-lg' }
  const pressShadow = {
    sm: 'shadow-neu-sm-inset',
    md: 'shadow-neu-inset',
    lg: 'shadow-neu-lg-inset',
  }
  const activeShadow = {
    sm: 'active:shadow-neu-sm-inset',
    md: 'active:shadow-neu-inset',
    lg: 'active:shadow-neu-lg-inset',
  }

  // Circle keeps the size's min-height as its diameter and drops the padding,
  // so an icon button lines up with the text buttons beside it.
  const shapeStyles = {
    sm: 'p-0 w-control-sm h-control-sm min-w-control-sm rounded-full',
    md: 'p-0 w-control-md h-control-md min-w-control-md rounded-full',
    lg: 'p-0 w-control-lg h-control-lg min-w-control-lg rounded-full',
  }

  const v = variant || 'primary'
  const s = size || 'md'
  // flat: carries no raised shadow at rest. filled: carries a colour fill, so
  // its label is read against that fill rather than against the surface.
  const flat = v === 'ghost' || v === 'quiet'
  const filled = v === 'primary' || v === 'danger'

  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 font-medium transition-all duration-200',
        // Shadows are invisible to a keyboard user, so the focus ring is the
        // only thing telling them where they are. It was missing before.
        'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ktip-sand-700',
        'disabled:cursor-not-allowed',
        'motion-reduce:transition-none motion-reduce:active:translate-y-0',
        variantStyles[v],
        sizeStyles[s],
        // quiet is inset at rest; ghost has no body at all until pressed.
        v === 'quiet' ? pressShadow[s] : v === 'ghost' ? 'shadow-none' : restShadow[s],
        // Hover has to say something. The shadow can't grow without changing
        // where the light is coming from, so the control rises one pixel out of
        // the surface instead — the smallest move that still reads as a
        // response, and the one the press then reverses.
        !flat && 'hover:-translate-y-px',
        // The press: 1px down and the same numbers turned inward. A sticky
        // `pressed` toggle holds it. quiet is already inset, so it only moves.
        v !== 'quiet' && activeShadow[s],
        'active:translate-y-px hover:active:translate-y-px',
        pressed && v !== 'quiet' && pressShadow[s],
        // Disabled half-flattens the shadow instead of fading the whole control
        // to 50% — an opacity fade greyed the light/dark pair into mud.
        // A filled variant keeps its own label colour and dims as a unit: on
        // the disabled ocean-400 fill, a sand-400 label lands near 2.5:1.
        // Only the surface variants, whose label sits on the page colour, mute.
        (disabled || loading) &&
          cn(
            'active:translate-y-0 hover:translate-y-0',
            !flat && 'shadow-neu-flat',
            filled ? 'opacity-60' : 'text-ktip-sand-400'
          ),
        shape === 'circle' && shapeStyles[s],
        fullWidth && 'w-full',
        className
      )}
      aria-pressed={pressed === undefined ? undefined : pressed}
      disabled={disabled || loading}
      {...others}
    >
      {loading && (
        <div className="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent" />
      )}
      {!loading && icon}
      {children}
    </button>
  )
}
