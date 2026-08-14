import {
  Suspense,
  createContext,
  lazy,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Tutorial } from '../components/tutorial/types'
import { getCompletedTutorials, markTutorialComplete } from '../lib/tutorialStorage'

/**
 * Both the tour content and the overlay that draws it load on demand.
 *
 * This provider sits in MainLayout, so anything it imports statically is in the
 * entry bundle for every visitor on every route. That was `src/data/tutorials`
 * (~82 kB of step copy for ~70 tours) plus TutorialOverlay (~18 kB) — carried
 * by everyone who never opens a tour, which is almost everyone, on the landing
 * page where no tour exists at all.
 *
 * The registry is still a plain synchronous module; only the edge is async.
 * Pages that need `TUTORIAL_IDS` or `useTutorialAutoStart` import it directly
 * and pay for it inside their own lazy route chunk, which is where the cost
 * belongs.
 */
const TutorialOverlay = lazy(() =>
  import('../components/tutorial/TutorialOverlay').then((m) => ({ default: m.TutorialOverlay }))
)

interface TutorialContextValue {
  activeTutorialId: string | null
  startTutorial: (id: string) => void
  stopTutorial: () => void
  isTutorialCompleted: (id: string) => boolean
}

const TutorialContext = createContext<TutorialContextValue | null>(null)

export function TutorialProvider({ children }: { children: ReactNode }) {
  // The resolved tutorial, not just its id: the registry is now behind a
  // dynamic import, so holding the object avoids a second async lookup at
  // render time (and a frame where the overlay has an id but no steps).
  const [active, setActive] = useState<Tutorial | null>(null)
  const [completed, setCompleted] = useState<string[]>(() => getCompletedTutorials())

  const startTutorial = useCallback((id: string) => {
    void import('../data/tutorials').then(({ getTutorialById }) => {
      const tutorial = getTutorialById(id)
      if (!tutorial) {
        console.warn(`[tutorial] unknown tutorial id: ${id}`)
        return
      }
      setActive(tutorial)
    })
  }, [])

  const stopTutorial = useCallback(() => setActive(null), [])

  const handleComplete = useCallback(() => {
    setActive((tutorial) => {
      if (tutorial) setCompleted(markTutorialComplete(tutorial.id))
      return null
    })
  }, [])

  const isTutorialCompleted = useCallback((id: string) => completed.includes(id), [completed])

  const activeTutorialId = active?.id ?? null

  const value = useMemo(
    () => ({ activeTutorialId, startTutorial, stopTutorial, isTutorialCompleted }),
    [activeTutorialId, startTutorial, stopTutorial, isTutorialCompleted]
  )

  return (
    <TutorialContext.Provider value={value}>
      {children}
      {active && (
        // fallback null, not a spinner: the tour is an overlay on a page the
        // reader is already looking at, and a flash of chrome while the chunk
        // arrives would be worse than the tour simply beginning a beat later.
        <Suspense fallback={null}>
          {/* Remount per tour so step state never bleeds between tutorials */}
          <TutorialOverlay
            key={active.id}
            steps={active.steps}
            onComplete={handleComplete}
            onExit={stopTutorial}
          />
        </Suspense>
      )}
    </TutorialContext.Provider>
  )
}

export function useTutorials(): TutorialContextValue {
  const ctx = useContext(TutorialContext)
  if (!ctx) throw new Error('useTutorials must be used within a TutorialProvider')
  return ctx
}
