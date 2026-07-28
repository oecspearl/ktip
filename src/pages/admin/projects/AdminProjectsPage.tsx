import { useMemo, useState } from 'react'
import { useAdminProjects, useUpdateProject } from '../../../hooks/useProjects'
import { useToast } from '../../../contexts/ToastContext'
import { formatDate, cn } from '../../../lib/utils'
import {
  FolderKanban,
  Star,
  StarOff,
  Search,
} from 'lucide-react'
import type { Project } from '../../../types'
import { PageHero } from '../../../components/layout/PageHero'

const PHASE_COLORS: Record<string, string> = {
  concept: 'bg-ktip-ocean-100 text-ktip-ocean-700',
  prototype: 'bg-ktip-ocean-100 text-ktip-ocean-700',
  funding: 'bg-ktip-sun-100 text-ktip-sun-700',
  launch: 'bg-ktip-tropical-100 text-ktip-tropical-800',
}

export default function AdminProjectsPage() {
  const toast = useToast()
  const { projects, loading, refetch } = useAdminProjects()
  const { updateProject } = useUpdateProject()

  const [search, setSearch] = useState('')
  const [toggling, setToggling] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const data = projects || []
    const q = search.toLowerCase()
    if (!q) return data
    return data.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q)
    )
  }, [projects, search])

  const featuredCount = (projects || []).filter((p) => p.is_featured).length

  const toggleFeatured = async (project: Project) => {
    setToggling(project.id)
    try {
      await updateProject(project.id, { is_featured: !project.is_featured })

      toast.success(
        project.is_featured
          ? `"${project.title}" removed from featured`
          : `"${project.title}" added to featured`
      )
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to update project')
    } finally {
      setToggling(null)
    }
  }

  return (
    <>
      <PageHero
        inset
        compact
        eyebrow="Admin"
        title="Manage Projects"
        subtitle="Toggle featured status to showcase projects on the homepage"
        imageSeed="admin-projects"
        actions={
          <div className="flex items-center gap-2 bg-ktip-sun-900/30 border border-ktip-sun-700/50 rounded-xl px-4 py-2">
            <Star size={18} className="text-ktip-sun-400" />
            <span className="text-ktip-sun-300 font-bold text-lg">{featuredCount}</span>
            <span className="text-ktip-sun-400/70 text-sm">featured</span>
          </div>
        }
      />

      {/* Search */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search projects..."
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:border-ktip-ocean-500 focus:outline-none text-sm"
          />
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((n) => (
            <div key={n} className="border border-gray-200 rounded-lg p-4 animate-pulse">
              <div className="h-5 w-48 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Project</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700 hidden md:table-cell">Owner</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700 hidden sm:table-cell">Phase</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700 hidden lg:table-cell">Created</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-700">Featured</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((project) => (
                <tr
                  key={project.id}
                  className={cn(
                    'border-b border-gray-100 hover:bg-gray-50/50 transition-colors',
                    project.is_featured && 'bg-ktip-sun-50/50'
                  )}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
                        project.is_featured ? 'bg-ktip-sun-100' : 'bg-gray-100'
                      )}>
                        <FolderKanban size={18} className={project.is_featured ? 'text-ktip-sun-600' : 'text-gray-500'} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">{project.title}</p>
                        <p className="text-xs text-gray-500 truncate max-w-[250px]">{project.description}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-gray-600">{project.owner?.display_name || 'Unknown'}</span>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className={cn(
                      'px-2 py-0.5 rounded-full text-xs font-medium capitalize',
                      PHASE_COLORS[project.phase] || 'bg-gray-100 text-gray-600'
                    )}>
                      {project.phase}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <span className="text-gray-500 text-xs">{formatDate(project.created_at, 'PP')}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => toggleFeatured(project)}
                      disabled={toggling === project.id}
                      className={cn(
                        'p-2 rounded-lg transition-all',
                        project.is_featured
                          ? 'bg-ktip-sun-100 text-ktip-sun-600 hover:bg-ktip-sun-200'
                          : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600',
                        toggling === project.id && 'opacity-50 cursor-not-allowed'
                      )}
                      title={project.is_featured ? 'Remove from featured' : 'Add to featured'}
                    >
                      {project.is_featured ? <Star size={18} className="fill-current" /> : <StarOff size={18} />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filtered.length === 0 && (
            <div className="text-center py-12">
              <FolderKanban size={40} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500 font-medium">No projects found</p>
              <p className="text-gray-400 text-sm mt-1">Try a different search term</p>
            </div>
          )}
        </div>
      )}
    </>
  )
}
