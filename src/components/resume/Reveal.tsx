import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Fade-and-rise on first scroll into view.
 *
 * The source template used framer-motion's `whileInView`. framer-motion is not
 * a KTIP dependency and pulling in ~50KB for one effect is not a trade worth
 * making, so this is the same behaviour on an IntersectionObserver.
 *
 * Dropping framer also removes the need for the print rule that existed purely
 * to beat its inline `transform`/`filter` — see the résumé block in index.css.
 *
 * Honours prefers-reduced-motion by rendering visible immediately: an
 * accessibility requirement in Annex A, and the animation carries no meaning.
 */
export function Reveal({
  children,
  className = '',
  delay = 0,
}: {
  children: ReactNode
  className?: string
  delay?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          setShown(true)
          // One-shot: re-animating on every scroll past is noise, not feedback.
          observer.disconnect()
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.05 }
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      style={{ transitionDelay: delay ? `${delay}ms` : undefined }}
      className={`transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-none ${
        shown ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
      } ${className}`}
    >
      {children}
    </div>
  )
}
