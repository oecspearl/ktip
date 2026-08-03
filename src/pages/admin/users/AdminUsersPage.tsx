import { useMemo, useState } from 'react'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Modal } from '../../../components/ui/Modal'
import { ConfirmModal } from '../../../components/admin/ConfirmModal'
import { useAdminUsers, useAdminUserActions } from '../../../hooks/useAdminDashboard'
import { useToast } from '../../../contexts/ToastContext'
import { ROLE_LABELS, ROLE_COLORS } from '../../../lib/constants'
import { ROLE_DEFINITIONS } from '../../../lib/permissions'
import { debounce } from '../../../lib/utils'
import { PageHero } from '../../../components/layout/PageHero'
import type { Profile, UserRole } from '../../../types'
import {
  Search,
  Users,
  ShieldCheck,
  ShieldX,
  Edit,
  CheckCircle,
  XCircle,
  UserPlus,
  KeyRound,
  Trash2,
  Eye,
  EyeOff,
} from 'lucide-react'
import { DiamondAvatar } from '../../../components/ui/DiamondAvatar'
import { useLingui } from '@lingui/react/macro'
import { resolveCopy } from '../../../i18n/copy'

/**
 * Every assignable role, in catalog order.
 *
 * This was a hand-written list of the six roles that existed before 063, which
 * meant an admin could neither assign nor filter by super_admin, safety_admin,
 * sme, educational_partner, chamber_admin or researcher — the console simply
 * had no way to express them. Derived now, so a role added to the catalog shows
 * up here without a second edit.
 *
 * Aliases are excluded: 'oecs' resolves to super_admin, and offering both would
 * let an admin assign the same authority under two names.
 */
const ALL_ROLES: UserRole[] = ROLE_DEFINITIONS.filter((r) => !r.aliasOf).map((r) => r.slug)

export default function AdminUsersPage() {
    const { i18n } = useLingui()
  const toast = useToast()

  // Filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [verifiedFilter, setVerifiedFilter] = useState('')

  const debouncedSetSearch = useMemo(() => debounce((val: string) => setDebouncedSearch(val), 300), [])

  // Data
  const { users, loading: usersLoading, refetch } = useAdminUsers({
    search: debouncedSearch || undefined,
    role: roleFilter || undefined,
    verified: verifiedFilter || undefined,
  })

  const { updateRoles, toggleVerified, createUser, resetPassword, deleteUser, loading: actionLoading } = useAdminUserActions()

  // Edit roles modal
  const [editingUser, setEditingUser] = useState<Profile | null>(null)
  const [selectedRoles, setSelectedRoles] = useState<UserRole[]>([])

  // Confirm verified toggle
  const [confirmVerify, setConfirmVerify] = useState<{
    userId: string
    userName: string
    newVerified: boolean
  } | null>(null)

  // Create user modal
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newDisplayName, setNewDisplayName] = useState('')
  const [newRoles, setNewRoles] = useState<UserRole[]>([])
  const [showNewPassword, setShowNewPassword] = useState(false)

  // Reset password modal
  const [resetUser, setResetUser] = useState<{ id: string; name: string } | null>(null)
  const [resetNewPassword, setResetNewPassword] = useState('')
  const [showResetPassword, setShowResetPassword] = useState(false)

  // Delete user confirm
  const [confirmDelete, setConfirmDelete] = useState<{
    userId: string
    userName: string
  } | null>(null)

  const openEditRoles = (user: Profile) => {
    setEditingUser(user)
    setSelectedRoles([...user.roles])
  }

  const closeEditRoles = () => {
    setEditingUser(null)
    setSelectedRoles([])
  }

  const toggleRole = (role: UserRole) => {
    setSelectedRoles(prev =>
      prev.includes(role)
        ? prev.filter(r => r !== role)
        : [...prev, role]
    )
  }

  const toggleNewRole = (role: UserRole) => {
    setNewRoles(prev =>
      prev.includes(role)
        ? prev.filter(r => r !== role)
        : [...prev, role]
    )
  }

  const handleSaveRoles = async () => {
    const user = editingUser
    if (!user) return

    try {
      await updateRoles(user.id, selectedRoles)
      toast.success(`Roles updated for ${user.display_name || 'user'}`)
      closeEditRoles()
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to update roles')
    }
  }

  const handleToggleVerified = async () => {
    const action = confirmVerify
    if (!action) return

    try {
      await toggleVerified(action.userId, action.newVerified)
      toast.success(
        action.newVerified
          ? `${action.userName} has been verified`
          : `${action.userName} has been unverified`
      )
      setConfirmVerify(null)
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to update verification status')
    }
  }

  const handleCreateUser = async () => {
    if (!newEmail || !newPassword) return

    try {
      await createUser({
        email: newEmail,
        password: newPassword,
        display_name: newDisplayName || undefined,
        roles: newRoles.length > 0 ? newRoles : undefined,
      })
      toast.success(`User account created for ${newEmail}`)
      setCreateModalOpen(false)
      setNewEmail('')
      setNewPassword('')
      setNewDisplayName('')
      setNewRoles([])
      setShowNewPassword(false)
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to create user')
    }
  }

  const handleResetPassword = async () => {
    const user = resetUser
    if (!user || !resetNewPassword) return

    try {
      await resetPassword(user.id, resetNewPassword)
      toast.success(`Password reset for ${user.name}`)
      setResetUser(null)
      setResetNewPassword('')
      setShowResetPassword(false)
    } catch (err: any) {
      toast.error(err.message || 'Failed to reset password')
    }
  }

  const handleDeleteUser = async () => {
    const action = confirmDelete
    if (!action) return

    try {
      await deleteUser(action.userId)
      toast.success(`${action.userName} has been deleted`)
      setConfirmDelete(null)
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete user')
    }
  }

  return (
    <div>
      <PageHero
        inset
        compact
        eyebrow="Administration"
        title="User Management"
        subtitle="Create accounts, manage roles, reset passwords, and verify users"
        imageSeed="admin-users"
      >
        {users && (
          <Badge size="sm" variant="primary">
            {users.length} users
          </Badge>
        )}
      </PageHero>

      {/* Inline Filter Bar */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.currentTarget.value)
                debouncedSetSearch(e.currentTarget.value)
              }}
              className="w-full pl-9 pr-4 py-2 bg-ktip-cream border border-ktip-sand-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.currentTarget.value)}
            className="px-3 py-2 bg-ktip-cream border border-ktip-sand-200 rounded-lg text-sm text-gray-700 focus:border-ktip-ocean-500 focus:outline-none"
          >
            <option value="">All Roles</option>
            {ALL_ROLES.map((role) => (
              <option value={role} key={role}>{resolveCopy(i18n, ROLE_LABELS[role])}</option>
            ))}
          </select>
          <select
            value={verifiedFilter}
            onChange={(e) => setVerifiedFilter(e.currentTarget.value)}
            className="px-3 py-2 bg-ktip-cream border border-ktip-sand-200 rounded-lg text-sm text-gray-700 focus:border-ktip-ocean-500 focus:outline-none"
          >
            <option value="">All Status</option>
            <option value="true">Verified</option>
            <option value="false">Unverified</option>
          </select>
          {(roleFilter || verifiedFilter || searchQuery) && (
            <button
              type="button"
              onClick={() => {
                setRoleFilter('')
                setVerifiedFilter('')
                setSearchQuery('')
                setDebouncedSearch('')
              }}
              className="text-sm text-ktip-ocean-600 hover:text-ktip-ocean-700 font-medium whitespace-nowrap"
            >
              Clear all
            </button>
          )}
          <Button onClick={() => setCreateModalOpen(true)} className="sm:ml-auto shrink-0">
            <UserPlus size={16} />
            Create User
          </Button>
        </div>
      </div>

      {/* Users Table */}
      <div className="overflow-hidden">
        {usersLoading ? (
          <div className="p-12 text-center text-gray-500">
            Loading users...
          </div>
        ) : !users?.length ? (
          <div className="p-12 text-center">
            <Users size={48} className="mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-1">No users found</h3>
            <p className="text-gray-500 text-sm">
              {roleFilter || verifiedFilter || searchQuery
                ? 'Try adjusting your filters'
                : 'No users have signed up yet'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-ktip-sand-200">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">User</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Country</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Roles</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Verified</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ktip-sand-200 stagger-rows">
                {users.map((user) => (
                  <tr className="hover:bg-ktip-sand-50 transition-colors" key={user.id}>
                    {/* User */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <DiamondAvatar
                          src={user.avatar_url}
                          name={user.display_name || 'User'}
                          size={32}
                        />
                        <div>
                          <p className="font-medium text-gray-900 text-sm">
                            {user.display_name || 'Unnamed User'}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Country */}
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-700">
                        {user.country || '--'}
                      </span>
                    </td>

                    {/* Roles */}
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {user.roles.length > 0 ? (
                          user.roles.map((role) => (
                            <Badge size="sm" className={ROLE_COLORS[role]} key={role}>
                              {resolveCopy(i18n, ROLE_LABELS[role])}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-xs text-gray-400">No roles</span>
                        )}
                      </div>
                    </td>

                    {/* Verified */}
                    <td className="px-4 py-3">
                      {user.is_verified ? (
                        <Badge size="sm" variant="success">
                          <CheckCircle size={12} />
                          Verified
                        </Badge>
                      ) : (
                        <Badge size="sm" variant="danger">
                          <XCircle size={12} />
                          Unverified
                        </Badge>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEditRoles(user)}
                          className="p-1.5 text-gray-400 hover:text-ktip-ocean-600 transition-colors"
                          title="Edit roles"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setResetUser({
                            id: user.id,
                            name: user.display_name || 'this user',
                          })}
                          className="p-1.5 text-gray-400 hover:text-ktip-sun-600 transition-colors"
                          title="Reset password"
                        >
                          <KeyRound size={16} />
                        </button>
                        {user.is_verified ? (
                          <button
                            type="button"
                            onClick={() => setConfirmVerify({
                              userId: user.id,
                              userName: user.display_name || 'this user',
                              newVerified: false,
                            })}
                            className="p-1.5 text-gray-400 hover:text-red-600 transition-colors"
                            title="Unverify user"
                          >
                            <ShieldX size={16} />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmVerify({
                              userId: user.id,
                              userName: user.display_name || 'this user',
                              newVerified: true,
                            })}
                            className="p-1.5 text-gray-400 hover:text-ktip-tropical-600 transition-colors"
                            title="Verify user"
                          >
                            <ShieldCheck size={16} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setConfirmDelete({
                            userId: user.id,
                            userName: user.display_name || 'this user',
                          })}
                          className="p-1.5 text-gray-400 hover:text-red-600 transition-colors"
                          title="Delete user"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create User Modal */}
      <Modal
        open={createModalOpen}
        onClose={() => {
          setCreateModalOpen(false)
          setNewEmail('')
          setNewPassword('')
          setNewDisplayName('')
          setNewRoles([])
          setShowNewPassword(false)
        }}
        title="Create User Account"
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.currentTarget.value)}
              placeholder="user@example.com"
              className="w-full px-3 py-2 border border-ktip-sand-200 rounded-lg text-sm focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
            <input
              type="text"
              value={newDisplayName}
              onChange={(e) => setNewDisplayName(e.currentTarget.value)}
              placeholder="John Doe"
              className="w-full px-3 py-2 border border-ktip-sand-200 rounded-lg text-sm focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
            <div className="relative">
              <input
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.currentTarget.value)}
                placeholder="Minimum 8 characters"
                className="w-full px-3 py-2 pr-10 border border-ktip-sand-200 rounded-lg text-sm focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Roles</label>
            <div className="flex flex-wrap gap-2">
              {ALL_ROLES.map((role) => (
                <button
                  type="button"
                  onClick={() => toggleNewRole(role)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    newRoles.includes(role)
                      ? 'bg-ktip-ocean-50 border-ktip-ocean-300 text-ktip-ocean-700'
                      : 'bg-ktip-cream border-ktip-sand-200 text-gray-600 hover:border-ktip-sand-300'
                  }`}
                  key={role}
                >
                  {resolveCopy(i18n, ROLE_LABELS[role])}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-ktip-sand-100">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setCreateModalOpen(false)
                setNewEmail('')
                setNewPassword('')
                setNewDisplayName('')
                setNewRoles([])
                setShowNewPassword(false)
              }}
              disabled={actionLoading}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleCreateUser}
              loading={actionLoading}
              disabled={!newEmail || !newPassword || newPassword.length < 8}
            >
              <UserPlus size={14} />
              Create Account
            </Button>
          </div>
        </div>
      </Modal>

      {/* Reset Password Modal */}
      <Modal
        open={!!resetUser}
        onClose={() => {
          setResetUser(null)
          setResetNewPassword('')
          setShowResetPassword(false)
        }}
        title={`Reset Password — ${resetUser?.name || 'User'}`}
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Set a new password for this user. They will need to use this password on their next login.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
            <div className="relative">
              <input
                type={showResetPassword ? 'text' : 'password'}
                value={resetNewPassword}
                onChange={(e) => setResetNewPassword(e.currentTarget.value)}
                placeholder="Minimum 8 characters"
                className="w-full px-3 py-2 pr-10 border border-ktip-sand-200 rounded-lg text-sm focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowResetPassword(!showResetPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showResetPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-ktip-sand-100">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setResetUser(null)
                setResetNewPassword('')
                setShowResetPassword(false)
              }}
              disabled={actionLoading}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleResetPassword}
              loading={actionLoading}
              disabled={!resetNewPassword || resetNewPassword.length < 8}
            >
              <KeyRound size={14} />
              Reset Password
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Roles Modal */}
      <Modal
        open={!!editingUser}
        onClose={closeEditRoles}
        title={`Edit Roles - ${editingUser?.display_name || 'User'}`}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Select the roles for this user.
          </p>
          <div className="space-y-3">
            {ALL_ROLES.map((role) => (
              <label className="flex items-center gap-3 p-3 rounded-lg hover:bg-ktip-sand-50 cursor-pointer transition-colors" key={role}>
                <input
                  type="checkbox"
                  checked={selectedRoles.includes(role)}
                  onChange={() => toggleRole(role)}
                  className="w-4 h-4 rounded border-ktip-sand-300 text-ktip-ocean-600 focus:ring-ktip-ocean-500"
                />
                <div className="flex items-center gap-2">
                  <Badge size="sm" className={ROLE_COLORS[role]}>
                    {resolveCopy(i18n, ROLE_LABELS[role])}
                  </Badge>
                </div>
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-ktip-sand-100">
            <Button
              variant="outline"
              size="sm"
              onClick={closeEditRoles}
              disabled={actionLoading}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSaveRoles}
              loading={actionLoading}
            >
              Save Roles
            </Button>
          </div>
        </div>
      </Modal>

      {/* Confirm Verify/Unverify Modal */}
      <ConfirmModal
        open={!!confirmVerify}
        title={confirmVerify?.newVerified ? 'Verify User' : 'Unverify User'}
        message={
          confirmVerify?.newVerified
            ? `Are you sure you want to verify "${confirmVerify?.userName}"? They will receive a verified badge on their profile.`
            : `Are you sure you want to unverify "${confirmVerify?.userName}"? Their verified badge will be removed.`
        }
        confirmLabel={confirmVerify?.newVerified ? 'Verify' : 'Unverify'}
        confirmVariant={confirmVerify?.newVerified ? 'primary' : 'danger'}
        loading={actionLoading}
        onConfirm={handleToggleVerified}
        onCancel={() => setConfirmVerify(null)}
      />

      {/* Confirm Delete User Modal */}
      <ConfirmModal
        open={!!confirmDelete}
        title="Delete User"
        message={`Are you sure you want to permanently delete "${confirmDelete?.userName}"? This action cannot be undone. All their data (projects, posts, messages, etc.) will be removed.`}
        confirmLabel="Delete User"
        confirmVariant="danger"
        loading={actionLoading}
        onConfirm={handleDeleteUser}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  )
}
