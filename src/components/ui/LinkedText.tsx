import { Fragment, useMemo } from 'react'
import { Link } from 'react-router'
import { linkify } from '../../lib/linkify'
import { cn } from '../../lib/utils'

interface LinkedTextProps {
  text: string
  /** Applied to the anchors only, so a bubble can set its own contrast. */
  linkClassName?: string
}

/**
 * Message text with its URLs clickable.
 *
 * Renders tokens from `linkify` — never HTML — so the text a member typed can
 * only ever become text or an anchor, and a link back to this site becomes a
 * router `Link` rather than a full page load.
 */
export function LinkedText({ text, linkClassName }: LinkedTextProps) {
  const tokens = useMemo(() => linkify(text), [text])
  const anchorClass = cn('underline underline-offset-2 break-all hover:opacity-80', linkClassName)

  return (
    <>
      {tokens.map((token, i) =>
        token.kind === 'text' ? (
          <Fragment key={i}>{token.text}</Fragment>
        ) : token.internal ? (
          <Link key={i} to={token.internal} className={anchorClass}>
            {token.text}
          </Link>
        ) : (
          <a
            key={i}
            href={token.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className={anchorClass}
          >
            {token.text}
          </a>
        )
      )}
    </>
  )
}
