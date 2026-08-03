import { useState, useEffect } from 'react'
import { useLingui } from '@lingui/react/macro'
import { msg } from '@lingui/core/macro'

// Single words on purpose — the animation flips one character at a time, so
// each translation should stay one word (Innover / Innovar, not a phrase).
const WATERMARK_WORDS = [msg`Innovate`, msg`Connect`, msg`Collaborate`]

/** Giant background word that flips character-by-character between words. */
export function FlipWatermark({
  className,
  charClassName = '',
}: {
  className: string
  charClassName?: string
}) {
  const { i18n } = useLingui()
  const [wordIndex, setWordIndex] = useState(0)

  useEffect(() => {
    const interval = setInterval(
      () => setWordIndex((i) => (i + 1) % WATERMARK_WORDS.length),
      4000,
    )
    return () => clearInterval(interval)
  }, [])

  const word = i18n._(WATERMARK_WORDS[wordIndex])

  return (
    <p
      aria-hidden
      className={`absolute font-display font-extrabold uppercase text-[16vw] md:text-[9rem] leading-none tracking-tight select-none pointer-events-none flex [perspective:600px] ${className}`}
    >
      {word.split('').map((ch, i) => (
        <span
          key={`${wordIndex}-${i}`}
          className={`inline-block animate-char-flip ${charClassName}`}
          style={{ animationDelay: `${i * 70}ms` }}
        >
          {ch}
        </span>
      ))}
    </p>
  )
}
