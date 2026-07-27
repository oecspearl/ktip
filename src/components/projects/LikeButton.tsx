import { createSignal, createEffect, on } from 'solid-js'
import { Heart } from 'lucide-solid'
import { Button } from '../ui/Button'
import { useProjectLike } from '../../hooks/useProjects'
import { useAuth } from '../../contexts/AuthContext'

interface LikeButtonProps {
  projectId: string
}

export function LikeButton(props: LikeButtonProps) {
  const auth = useAuth()
  const { likeProject, unlikeProject, checkLike, getLikeCount, loading } = useProjectLike()

  const [hasLiked, setHasLiked] = createSignal(false)
  const [likeCount, setLikeCount] = createSignal(0)

  createEffect(
    on(
      () => [auth.user()?.id, props.projectId] as const,
      ([userId, projectId]) => {
        if (!userId || !projectId) return

        Promise.all([checkLike(projectId, userId), getLikeCount(projectId)])
          .then(([liked, count]) => {
            setHasLiked(liked)
            setLikeCount(count)
          })
          .catch((err) => {
            console.error('Error checking like status:', err)
          })
      }
    )
  )

  const handleToggleLike = async () => {
    const userId = auth.user()?.id
    if (!userId || loading()) return

    const wasLiked = hasLiked()

    // Optimistic update
    setHasLiked(!wasLiked)
    setLikeCount((c) => (wasLiked ? c - 1 : c + 1))

    try {
      if (wasLiked) {
        await unlikeProject(props.projectId, userId)
      } else {
        await likeProject(props.projectId, userId)
      }
    } catch {
      // Revert on error
      setHasLiked(wasLiked)
      setLikeCount((c) => (wasLiked ? c + 1 : c - 1))
    }
  }

  return (
    <Button
      variant="outline"
      onClick={handleToggleLike}
      disabled={loading()}
      icon={
        <Heart
          size={20}
          class={hasLiked() ? 'fill-red-500 text-red-500' : ''}
        />
      }
    >
      Like ({likeCount()})
    </Button>
  )
}
