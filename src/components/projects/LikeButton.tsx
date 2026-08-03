import { Heart } from 'lucide-react'
import { Button } from '../ui/Button'
import { useProjectLike } from '../../hooks/useProjects'
import { useAuth } from '../../contexts/AuthContext'
import { Trans } from '@lingui/react/macro'

interface LikeButtonProps {
  projectId: string
}

export function LikeButton({ projectId }: LikeButtonProps) {
  const auth = useAuth()
  const userId = auth.user?.id
  const { liked, likeCount, likeProject, unlikeProject, loading } = useProjectLike(projectId, userId)
  // Named, so the catalog entry reads `Like ({likes})` rather than `Like ({0})`.
  const likes = likeCount ?? 0

  const handleToggleLike = async () => {
    if (!userId || loading) return

    try {
      if (liked) {
        await unlikeProject(projectId, userId)
      } else {
        await likeProject(projectId, userId)
      }
    } catch {
      // hook's optimistic update already reverts on error
    }
  }

  return (
    <Button
      variant="outline"
      onClick={handleToggleLike}
      disabled={loading}
      icon={
        <Heart
          size={20}
          className={liked ? 'fill-red-500 text-red-500' : ''}
        />
      }
    >
      <Trans>Like ({likes})</Trans>
    </Button>
  )
}
