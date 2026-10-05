import { useLingui } from '@lingui/react/macro'

/** Four small marks the strip cycles through between names. */
const MARKS = [
  <circle key="c" cx="6" cy="6" r="5" />,
  <rect key="s" x="1" y="1" width="10" height="10" />,
  <path key="t" d="M6 1 11 11H1z" />,
  <path key="d" d="M6 0 12 6 6 12 0 6z" />,
]

function Mark({ i }: { i: number }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
      {MARKS[i % MARKS.length]}
    </svg>
  )
}

/**
 * Skills and interests, scrolling under the hero. The list runs twice so the
 * loop is seamless; the copy is hidden from assistive tech, which reads the
 * list once. Pauses on hover; reduced motion stops it (editorial.css).
 */
export function SkillsStrip({ items }: { items: string[] }) {
  const { t } = useLingui()
  if (!items.length) return null
  const run = (hidden: boolean) =>
    items.map((item, i) => (
      <span key={`${hidden ? 'b' : 'a'}${i}`} className="pf-mq-item" aria-hidden={hidden || undefined}>
        <Mark i={i} />
        {item}
      </span>
    ))
  return (
    <div className="pf-marquee">
      <p className="pf-eyebrow">{t`Skills & interests`}</p>
      <div className="pf-mq">
        <div className="pf-mq-track">
          {run(false)}
          {run(true)}
        </div>
      </div>
    </div>
  )
}
