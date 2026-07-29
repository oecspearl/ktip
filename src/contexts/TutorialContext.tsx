import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { TutorialOverlay } from '../components/tutorial/TutorialOverlay'
import { getTutorialById } from '../data/tutorials'
import { getCompletedTutorials, markTutorialComplete } from '../lib/tutorialStorage'

interface TutorialContextValue {
  activeTutorialId: string | null
  startTutorial: (id: string) => void
  stopTutorial: () => void
  isTutorialCompleted: (id: string) => boolean
}

const TutorialContext = createContext<TutorialContextValue | null>(null)

export function TutorialProvider({ children }: { children: ReactNode }) {
  const [activeTutorialId, setActiveTutorialId] = useState<string | null>(null)
  const [completed, setCompleted] = useState<string[]>(() => getCompletedTutorials())

  const startTutorial = useCallback((id: string) => {
    if (!getTutorialById(id)) {
      console.warn(`[tutorial] unknown tutorial id: ${id}`)
      return
    }
    setActiveTutorialId(id)
  }, [])

  const stopTutorial = useCallback(() => setActiveTutorialId(null), [])

  const handleComplete = useCallback(() => {
    setActiveTutorialId((id) => {
      if (id) setCompleted(markTutorialComplete(id))
      return null
    })
  }, [])

  const isTutorialCompleted = useCallback((id: string) => completed.includes(id), [completed])

  const value = useMemo(
    () => ({ activeTutorialId, startTutorial, stopTutorial, isTutorialCompleted }),
    [activeTutorialId, startTutorial, stopTutorial, isTutorialCompleted]
  )

  const tutorial = activeTutorialId ? getTutorialById(activeTutorialId) : undefined

  return (
    <TutorialContext.Provider value={value}>
      {children}
      {tutorial && (
        // Remount per tour so step state never bleeds between tutorials
        <TutorialOverlay
          key={tutorial.id}
          steps={tutorial.steps}
          onComplete={handleComplete}
          onExit={stopTutorial}
        />
      )}
    </TutorialContext.Provider>
  )
}

export function useTutorials(): TutorialContextValue {
  const ctx = useContext(TutorialContext)
  if (!ctx) throw new Error('useTutorials must be used within a TutorialProvider')
  return ctx
}
