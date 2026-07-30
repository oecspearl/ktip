import { useEffect, useRef } from 'react'
import { useTutorials } from '../contexts/TutorialContext'
import { getTutorialById } from '../data/tutorials'
import { hasAutoStarted, markAutoStarted } from '../lib/tutorialStorage'

/** Let entrance animations and the first data render settle before spotlighting */
const SETTLE_MS = 500

/**
 * Fire a page's tour once, for a first-time visitor only.
 *
 * `ready` should go true when the page's content is actually on screen —
 * spotlighting a skeleton measures the wrong rect.
 *
 * Calling this is not enough on its own: the tour must also be marked
 * `autoStart` in the registry. Most tours are not — with ~70 of them, firing
 * every one unprompted would spotlight a new member a dozen times in a single
 * session. The flag lives in one file so the policy is reviewable in one place.
 */
export function useTutorialAutoStart(id: string, ready: boolean) {
  const { startTutorial } = useTutorials()
  const firedRef = useRef(false)

  useEffect(() => {
    if (!ready || firedRef.current) return
    if (!getTutorialById(id)?.autoStart) return
    if (hasAutoStarted(id)) return
    firedRef.current = true

    const timer = window.setTimeout(() => {
      markAutoStarted(id)
      startTutorial(id)
    }, SETTLE_MS)

    return () => window.clearTimeout(timer)
  }, [id, ready, startTutorial])
}
