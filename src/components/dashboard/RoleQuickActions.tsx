import { Link } from 'react-router'
import { Building2, CalendarPlus, ClipboardList, FilePlus, FileText, FolderPlus, type LucideIcon } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { canUseGrantApplications, effectiveRoles, primaryProfileLink } from '../../lib/permissions'
import { Trans } from '@lingui/react/macro'

/**
 * The things this member can do from the Overview, as a strip of buttons.
 *
 * A flat, capability-filtered list — the same table the homepage hero uses
 * for its CTA — plus the member's own profile link at the end. Zero new
 * logic: every predicate is a helper the navbar and the hero already share,
 * so the three surfaces cannot disagree about what a role may do.
 */
export function RoleQuickActions() {
  const auth = useAuth()
  if (!auth.user) return null

  const profile = primaryProfileLink(effectiveRoles(auth.roles, auth.activeRole))

  const actions: { to: string; icon: LucideIcon; label: React.ReactNode; show: boolean }[] = [
    { to: '/projects/new', icon: FolderPlus, label: <Trans>Start a project</Trans>, show: auth.can('project:create') },
    { to: '/events/new', icon: CalendarPlus, label: <Trans>Host an event</Trans>, show: auth.can('event:create') },
    { to: '/grants/my-applications', icon: ClipboardList, label: <Trans>My applications</Trans>, show: canUseGrantApplications(auth.can) },
    { to: '/grants/new', icon: FilePlus, label: <Trans>Post a funding call</Trans>, show: auth.can('grant:post') },
    {
      to: profile.to,
      icon: profile.kind === 'business' ? Building2 : FileText,
      label: profile.kind === 'business' ? <Trans>Business profile</Trans> : <Trans>My CV</Trans>,
      show: true,
    },
  ]

  const visible = actions.filter((a) => a.show)
  if (!visible.length) return null

  return (
    <div className="mb-8 flex flex-wrap gap-2" data-tutorial="dashboard-quick-actions">
      {visible.map((action) => (
        <Link
          key={action.to}
          to={action.to}
          className="neu-surface inline-flex items-center gap-2 rounded-xl border border-ktip-sand-200 bg-ktip-cream px-3.5 py-2 text-sm font-medium text-ktip-sand-800 shadow-neu-sm transition-colors hover:border-ktip-ocean-300 hover:text-ktip-ocean-700"
        >
          <action.icon size={16} className="text-ktip-ocean-600" />
          {action.label}
        </Link>
      ))}
    </div>
  )
}
