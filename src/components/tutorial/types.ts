/**
 * Step + tutorial shapes for the spotlight walkthrough engine.
 *
 * A step points at a plain DOM selector — components opt in by carrying a
 * `data-tutorial="..."` attribute, so the engine never needs refs or context
 * from the pages it describes.
 */
export type TutorialPosition = 'top' | 'bottom' | 'left' | 'right' | 'center'

export interface TutorialStep {
  /** CSS selector, e.g. '[data-tutorial="events-search"]' */
  target: string
  title: string
  /** Supports \n — rendered with whitespace-pre-line */
  description: string
  /** Preferred side for the card; the engine falls back if it does not fit */
  position?: TutorialPosition
  /** Step requires a click on the target before Next unlocks */
  interactive?: boolean
  /** Don't overlay a click relay — the user clicks the REAL element. Needed
   *  for nested controls where a synthetic click on the wrapper wouldn't reach
   *  the inner button/input. */
  manualClick?: boolean
  /** Element that satisfies `interactive`, when it isn't the spotlit one —
   *  e.g. a step framing a whole section but advanced by one control inside
   *  (or beside) it. Implies manualClick: the listener goes on the real node. */
  actionTarget?: string
  /** Bouncing pill above the target, e.g. "Click to open" */
  actionHint?: string
  /** Selector synthetically clicked when Next is pressed — drives the UI
   *  forward (switch view, open a panel) so later steps have their targets. */
  clickTarget?: string
  /** ms between the clickTarget dispatch and advancing (default 150) */
  clickTargetDelay?: number
  /** ms after the user's own click before auto-advancing (default 300) */
  advanceDelay?: number
  /** How scroll-into-view anchors the target (default center) */
  scrollMode?: 'top' | 'center'
  /** Second spotlight cutout, e.g. a section plus its toolbar */
  secondaryTarget?: string
}

export interface Tutorial {
  id: string
  name: string
  description: string
  steps: TutorialStep[]
  /** Fire once, unprompted, on a first-time visitor's first view of the page.
   *  Reserved for the handful of hub pages — every other tour is FAB-launch
   *  only. Keeping the policy here rather than in whichever pages happen to
   *  call useTutorialAutoStart makes "stop ambushing people on X" a one-word
   *  diff. */
  autoStart?: boolean
}
