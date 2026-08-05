import { Fragment, useMemo, useState } from 'react'
import { Lock, RotateCcw, Search, ShieldCheck, History, Check, Minus } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Modal } from '../../../components/ui/Modal'
import { Switch } from '../../../components/ui/Toggle'
import { ConfirmModal } from '../../../components/admin/ConfirmModal'
import { PageHero } from '../../../components/layout/PageHero'
import { usePageTitle } from '../../../hooks/usePageTitle'
import { useToast } from '../../../contexts/ToastContext'
import { useAuth } from '../../../contexts/AuthContext'
import {
  useResetRolePermissions,
  useRoleMembers,
  useRolePermissionEvents,
  useRolePermissions,
  useSetRolePermission,
  useSetUserRoles,
} from '../../../hooks/useRolePermissions'
import {
  MATRIX_ROLES,
  PERMISSION_CATEGORY_LABELS,
  PERMISSION_DEFINITIONS,
  ROLE_BY_SLUG,
  SCOPED_ROLES,
  TIER_LABELS,
  isCellLocked,
} from '../../../lib/permissions'
import { formatDate } from '../../../lib/utils'
import type { PermissionCategory } from '../../../lib/permissions'
import type { PermissionKey, Profile, RoleSlug } from '../../../types'
import { DiamondAvatar } from '../../../components/ui/DiamondAvatar'
import { useLingui } from '@lingui/react/macro'
import { resolveCopy } from '../../../i18n/copy'

const TIER_ACCENT: Record<string, string> = {
  admin: 'text-ktip-ocean-700',
  organization: 'text-ktip-tropical-800',
  individual: 'text-ktip-sand-700',
}

/** Cell renderer. A locked cell is a policy statement, not a disabled control. */
function MatrixCell({
  allowed,
  locked,
  lockReason,
  busy,
  onToggle,
  label,
}: {
  allowed: boolean
  locked: boolean
  lockReason: string
  busy: boolean
  onToggle: () => void
  label: string
}) {
  if (locked) {
    return (
      <span
        title={lockReason}
        className="inline-flex items-center justify-center w-8 h-6 text-ktip-sand-400"
        aria-label={`${label} — ${lockReason}`}
      >
        {allowed ? <Check size={15} className="text-ktip-tropical-600" /> : <Lock size={13} />}
      </span>
    )
  }

  return <Switch checked={allowed} onChange={onToggle} label={label} disabled={busy} />
}

export default function AdminRolesPage() {
    const { i18n } = useLingui()
  const toast = useToast()
  const auth = useAuth()

  usePageTitle('Roles & Permissions')

  const [search, setSearch] = useState('')
  const [editingUser, setEditingUser] = useState<Profile | null>(null)
  const [draftRoles, setDraftRoles] = useState<RoleSlug[]>([])
  const [confirmReset, setConfirmReset] = useState(false)
  const [showAudit, setShowAudit] = useState(false)
  const [pendingCell, setPendingCell] = useState<string | null>(null)

  const { members, loading: membersLoading, refetch: refetchMembers } = useRoleMembers(search)
  const { matrix, loading: matrixLoading, refetch: refetchMatrix } = useRolePermissions()
  const { setPermission } = useSetRolePermission()
  const { resetToDefaults, loading: resetting } = useResetRolePermissions()
  const { setUserRoles, loading: savingRoles } = useSetUserRoles()
  const { events } = useRolePermissionEvents(50)

  const canEdit = auth.can('role:manage')

  const groupedPermissions = useMemo(() => {
    const groups = new Map<PermissionCategory, typeof PERMISSION_DEFINITIONS>()
    for (const permission of PERMISSION_DEFINITIONS) {
      const existing = groups.get(permission.category) ?? []
      existing.push(permission)
      groups.set(permission.category, existing)
    }
    return [...groups.entries()]
  }, [])

  const isAllowed = (role: RoleSlug, permission: PermissionKey) =>
    matrix?.[`${role}:${permission}`] ?? false

  const handleToggle = async (role: RoleSlug, permission: PermissionKey, next: boolean) => {
    const cellKey = `${role}:${permission}`
    setPendingCell(cellKey)
    try {
      await setPermission(role, permission, next)
      toast.success(
        `${ROLE_BY_SLUG[role]?.label ?? role}: ${permission} ${next ? 'granted' : 'revoked'}`
      )
    } catch (err: any) {
      toast.error(err.message || 'Failed to update permission')
      refetchMatrix()
    } finally {
      setPendingCell(null)
    }
  }

  const openRoleEditor = (user: Profile) => {
    setEditingUser(user)
    setDraftRoles((user.roles || []) as RoleSlug[])
  }

  const toggleDraftRole = (slug: RoleSlug) => {
    setDraftRoles((current) =>
      current.includes(slug) ? current.filter((r) => r !== slug) : [...current, slug]
    )
  }

  const handleSaveRoles = async () => {
    const user = editingUser
    if (!user) return
    try {
      await setUserRoles(user.id, draftRoles)
      toast.success(`Roles updated for ${user.display_name || 'user'}`)
      setEditingUser(null)
      refetchMembers()
    } catch (err: any) {
      toast.error(err.message || 'Failed to update roles')
    }
  }

  const handleReset = async () => {
    try {
      const changed = await resetToDefaults()
      toast.success(changed === 0 ? 'Already at defaults' : `Reset ${changed} permissions`)
      setConfirmReset(false)
      refetchMatrix()
    } catch (err: any) {
      toast.error(err.message || 'Failed to reset permissions')
    }
  }

  return (
    <div>
      <PageHero
        inset
        compact
        eyebrow="Administration"
        title="Roles & Permissions"
        subtitle="Assign roles to members and control exactly what each role can do"
        imageSeed="admin-roles"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" icon={<History size={15} />} onClick={() => setShowAudit(true)}>
              Audit trail
            </Button>
            {canEdit && (
              <Button
                variant="outline"
                size="sm"
                icon={<RotateCcw size={15} />}
                onClick={() => setConfirmReset(true)}
              >
                Reset to defaults
              </Button>
            )}
          </div>
        }
      />

      {/* Members & roles */}
      <div className="bg-ktip-cream rounded-2xl shadow-card border border-ktip-sand-100 overflow-hidden mb-6">
        <div className="p-4 border-b border-ktip-sand-100 flex flex-wrap items-center gap-3 justify-between">
          <h2 className="text-lg font-display font-bold text-ktip-sand-900">Members &amp; roles</h2>
          <div className="w-full sm:w-72">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search members"
              icon={<Search size={15} />}
              fullWidth
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-ktip-sand-100">
                <th className="text-left px-4 py-3 text-xs font-semibold text-ktip-sand-500 uppercase tracking-wider">Member</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-ktip-sand-500 uppercase tracking-wider">Roles</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-ktip-sand-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ktip-sand-100 stagger-rows">
              {membersLoading && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-ktip-sand-500">Loading members…</td>
                </tr>
              )}
              {!membersLoading && (members?.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-ktip-sand-500">No members found.</td>
                </tr>
              )}
              {members?.map((user) => (
                <tr key={user.id} className="hover:bg-ktip-sand-50/60 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <DiamondAvatar name={user.display_name || 'User'} size={36} />
                      <div className="min-w-0">
                        <p className="font-medium text-ktip-sand-900 truncate">{user.display_name || 'Unnamed'}</p>
                        {user.is_suspended && (
                          <p className="text-xs text-red-600">Suspended</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {(user.roles || []).length === 0 && (
                        <span className="text-xs text-ktip-sand-500">No roles</span>
                      )}
                      {(user.roles || []).map((slug) => (
                        <span
                          key={slug}
                          className="px-2 py-0.5 rounded-full text-xs font-medium bg-ktip-sand-100 text-ktip-sand-700 border border-ktip-sand-200"
                        >
                          {resolveCopy(i18n, ROLE_BY_SLUG[slug]?.label ?? slug)}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!canEdit}
                      onClick={() => openRoleEditor(user)}
                    >
                      Edit roles
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="px-4 py-3 text-sm text-ktip-sand-600 border-t border-ktip-sand-100">
          Global roles apply across the platform. Roles marked as requiring verification are granted by
          an institution, a Chamber of Commerce, or an OECS administrator — not chosen by the member.
        </p>
      </div>

      {/* Permission matrix */}
      <div className="bg-ktip-cream rounded-2xl shadow-card border border-ktip-sand-100 overflow-hidden">
        <div className="p-4 border-b border-ktip-sand-100">
          <h2 className="text-lg font-display font-bold text-ktip-sand-900">Complete permission matrix</h2>
          <p className="text-sm text-ktip-sand-600 mt-1">
            Changes take effect immediately and are enforced by the database, not just the interface.
            Cells marked with a lock are child-safety rules and cannot be changed.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="border-b border-ktip-sand-100">
                <th className="text-left px-4 py-3 text-xs font-semibold text-ktip-sand-500 uppercase tracking-wider sticky left-0 bg-ktip-cream z-10">
                  Permission
                </th>
                {MATRIX_ROLES.map((role) => (
                  <th key={role.slug} className="px-3 py-3 text-center">
                    <span className={`block text-xs font-semibold ${TIER_ACCENT[role.tier]}`}>
                      {i18n._(role.label)}
                    </span>
                    <span className="block text-[10px] uppercase tracking-wider text-ktip-sand-400">
                      {TIER_LABELS[role.tier]}
                    </span>
                  </th>
                ))}
                {SCOPED_ROLES.map((role) => (
                  <th key={role.slug} className="px-3 py-3 text-center">
                    <span className="block text-xs font-semibold text-ktip-sun-700">{i18n._(role.label)}</span>
                    <span className="block text-[10px] uppercase tracking-wider text-ktip-sun-600">
                      {role.scope}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ktip-sand-100">
              {matrixLoading && (
                <tr>
                  <td colSpan={MATRIX_ROLES.length + SCOPED_ROLES.length + 1} className="px-4 py-8 text-center text-ktip-sand-500">
                    Loading matrix…
                  </td>
                </tr>
              )}

              {!matrixLoading &&
                groupedPermissions.map(([category, permissions]) => (
                  <Fragment key={category}>
                    <tr className="bg-ktip-sand-50/70">
                      <td
                        colSpan={MATRIX_ROLES.length + SCOPED_ROLES.length + 1}
                        className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-ktip-sand-500"
                      >
                        {PERMISSION_CATEGORY_LABELS[category]}
                      </td>
                    </tr>

                    {permissions.map((permission) => (
                      <tr key={permission.key} className="hover:bg-ktip-sand-50/50 transition-colors">
                        <td className="px-4 py-2.5 sticky left-0 bg-ktip-cream z-10">
                          <div className="flex items-center gap-2">
                            <code className="text-xs font-mono text-ktip-sand-800">{permission.key}</code>
                            {permission.safeguard && (
                              <ShieldCheck size={13} className="text-ktip-tropical-600 flex-shrink-0" />
                            )}
                          </div>
                          <p className="text-xs text-ktip-sand-500 mt-0.5">{i18n._(permission.description)}</p>
                        </td>

                        {MATRIX_ROLES.map((role) => {
                          const cellKey = `${role.slug}:${permission.key}`
                          const locked = !canEdit || isCellLocked(role.slug, permission.key)
                          const lockReason = !canEdit
                            ? 'You do not have permission to edit the matrix'
                            : role.slug === 'super_admin'
                              ? 'Super Admin always holds every permission'
                              : 'Child-safety rule — enforced in the database and cannot be granted'
                          return (
                            <td key={cellKey} className="px-3 py-2.5 text-center">
                              <MatrixCell
                                allowed={isAllowed(role.slug, permission.key)}
                                locked={locked}
                                lockReason={lockReason}
                                busy={pendingCell === cellKey}
                                label={`${role.label}: ${permission.label}`}
                                onToggle={() =>
                                  handleToggle(
                                    role.slug,
                                    permission.key,
                                    !isAllowed(role.slug, permission.key)
                                  )
                                }
                              />
                            </td>
                          )
                        })}

                        {SCOPED_ROLES.map((role) => (
                          <td key={`${role.slug}:${permission.key}`} className="px-3 py-2.5 text-center">
                            <Minus size={14} className="inline text-ktip-sand-300" />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </Fragment>
                ))}
            </tbody>
          </table>
        </div>

        <p className="px-4 py-3 text-sm text-ktip-sand-600 border-t border-ktip-sand-100">
          Columns in amber are per-record roles held inside a single project, institution or employer.
          They are assigned on that record, not here.
        </p>
      </div>

      {/* Role assignment modal */}
      <Modal
        open={!!editingUser}
        onClose={() => setEditingUser(null)}
        title={`Edit roles — ${editingUser?.display_name || 'User'}`}
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-ktip-sand-600">
            Granting a verification-gated role here bypasses the normal review flow. Use it only when
            you have confirmed the member’s status yourself.
          </p>

          <div className="flex flex-wrap gap-2">
            {MATRIX_ROLES.map((role) => {
              const selected = draftRoles.includes(role.slug)
              return (
                <button
                  key={role.slug}
                  type="button"
                  onClick={() => toggleDraftRole(role.slug)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    selected
                      ? 'bg-ktip-ocean-50 border-ktip-ocean-300 text-ktip-ocean-700'
                      : 'bg-ktip-cream border-ktip-sand-200 text-ktip-sand-600 hover:border-ktip-sand-300'
                  }`}
                >
                  {i18n._(role.label)}
                  {role.requiresVerification && <span className="ml-1 text-ktip-sun-600">•</span>}
                </button>
              )
            })}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-ktip-sand-100">
            <Button variant="outline" size="sm" onClick={() => setEditingUser(null)}>
              Cancel
            </Button>
            <Button size="sm" loading={savingRoles} onClick={handleSaveRoles}>
              Save roles
            </Button>
          </div>
        </div>
      </Modal>

      {/* Audit trail */}
      <Modal open={showAudit} onClose={() => setShowAudit(false)} title="Permission change history" size="lg">
        {(events?.length ?? 0) === 0 ? (
          <p className="text-sm text-ktip-sand-600">No changes recorded yet.</p>
        ) : (
          <ul className="divide-y divide-ktip-sand-100">
            {events?.map((event) => (
              <li key={event.id} className="py-2.5 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm text-ktip-sand-900">
                    <span className="font-medium">{resolveCopy(i18n, ROLE_BY_SLUG[event.role_slug]?.label ?? event.role_slug)}</span>
                    {event.to_allowed ? ' granted ' : ' revoked '}
                    <code className="text-xs font-mono">{event.permission_key}</code>
                  </p>
                  <p className="text-xs text-ktip-sand-500">
                    {event.actor?.display_name || 'System'} · {formatDate(event.created_at)}
                  </p>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${
                    event.to_allowed
                      ? 'bg-ktip-tropical-100 text-ktip-tropical-800'
                      : 'bg-red-100 text-red-700'
                  }`}
                >
                  {event.to_allowed ? 'Granted' : 'Revoked'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      <ConfirmModal
        open={confirmReset}
        title="Reset permission matrix"
        message="Every role's permissions will be restored to the shipped defaults. Custom grants you have made will be lost. This is recorded in the audit trail."
        confirmLabel="Reset to defaults"
        confirmVariant="danger"
        loading={resetting}
        onConfirm={handleReset}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  )
}
