import { Bell } from 'lucide-react'
import { Button } from '../ui/Button'
import { useProjectFollow } from '../../hooks/useProjects'
import { useAuth } from '../../contexts/AuthContext'

interface FollowButtonProps {
  projectId: string
}

export function FollowButton({ projectId }: FollowButtonProps) {
  const auth = useAuth()
  const userId = auth.user?.id
  const { followed, followCount, followProject, unfollowProject, loading } = useProjectFollow(
    projectId,
    userId
  )

  const handleToggleFollow = async () => {
    if (!userId || loading) return

    try {
      if (followed) {
        await unfollowProject()
      } else {
        await followProject()
      }
    } catch {
      // hook's optimistic update already reverts on error
    }
  }

  return (
    <Button
      variant="outline"
      onClick={handleToggleFollow}
      disabled={loading}
      icon={
        <Bell
          size={20}
          className={followed ? 'fill-ktip-ocean-500 text-ktip-ocean-500' : ''}
        />
      }
    >
      {followed ? 'Following' : 'Follow'} ({followCount ?? 0})
    </Button>
  )
}
