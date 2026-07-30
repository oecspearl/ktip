import { Link } from 'react-router'
import { FolderKanban, Plus } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { ProjectCard } from '../../../components/projects/ProjectCard'
import { useUserProjects } from '../../../hooks/useProfile'
import { useAuth } from '../../../contexts/AuthContext'
import { usePageTitle } from '../../../hooks/usePageTitle'

export default function ProjectsTab() {
  usePageTitle('My Projects')
  const auth = useAuth()
  const { projects } = useUserProjects(auth.user?.id)

  if (!projects?.length) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 bg-ktip-sand-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <FolderKanban size={32} className="text-ktip-sand-400" />
        </div>
        <p className="text-ktip-sand-600 mb-4">No projects yet.</p>
        {auth.can('project:create') && (
          <Link to="/projects/new">
            <Button icon={<Plus size={18} />}>Create a project</Button>
          </Link>
        )}
      </div>
    )
  }

  return (
    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4 auto-rows-fr stagger-children">
      {projects.map((project) => (
        <ProjectCard key={project.id} project={project} />
      ))}
    </div>
  )
}
