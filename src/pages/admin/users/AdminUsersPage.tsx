import { createSignal, Show, For, Suspense } from 'solid-js'
import { AdminLayout } from '../../../components/layout/AdminLayout'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Modal } from '../../../components/ui/Modal'
import { ConfirmModal } from '../../../components/admin/ConfirmModal'
import { useAdminUsers, useAdminUserActions } from '../../../hooks/useAdminDashboard'
import { useToast } from '../../../contexts/ToastContext'
import { ROLE_LABELS, ROLE_COLORS } from '../../../lib/constants'
import { debounce } from '../../../lib/utils'
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
} from 'lucide-solid'

const ALL_ROLES: UserRole[] = ['student', 'mentor', 'investor', 'entrepreneur', 'private_sector', 'oecs']

const getInitials = (name: string | null) => {
  if (!name) return '?'
  return name.split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

function AdminUsersContent() {
  const toast = useToast()

  // Filter state
  const [searchQuery, setSearchQuery] = createSignal('')
  const [debouncedSearch, setDebouncedSearch] = createSignal('')
  const [roleFilter, setRoleFilter] = createSignal('')
  const [verifiedFilter, setVerifiedFilter] = createSignal('')

  const debouncedSetSearch = debounce((val: string) => setDebouncedSearch(val), 300)

  // Data
  const { users, refetch } = useAdminUsers({
    get search() { return debouncedSearch() || undefined },
    get role() { return roleFilter() || undefined },
    get verified() { return verifiedFilter() || undefined },
  })

  const { updateRoles, toggleVerified, createUser, resetPassword, deleteUser, loading: actionLoading } = useAdminUserActions()

  // Edit roles modal
  const [editingUser, setEditingUser] = createSignal<Profile | null>(null)
  const [selectedRoles, setSelectedRoles] = createSignal<UserRole[]>([])

  // Confirm verified toggle
  const [confirmVerify, setConfirmVerify] = createSignal<{
    userId: string
    userName: string
    newVerified: boolean
  } | null>(null)

  // Create user modal
  const [createModalOpen, setCreateModalOpen] = createSignal(false)
  const [newEmail, setNewEmail] = createSignal('')
  const [newPassword, setNewPassword] = createSignal('')
  const [newDisplayName, setNewDisplayName] = createSignal('')
  const [newRoles, setNewRoles] = createSignal<UserRole[]>([])
  const [showNewPassword, setShowNewPassword] = createSignal(false)

  // Reset password modal
  const [resetUser, setResetUser] = createSignal<{ id: string; name: string } | null>(null)
  const [resetNewPassword, setResetNewPassword] = createSignal('')
  const [showResetPassword, setShowResetPassword] = createSignal(false)

  // Delete user confirm
  const [confirmDelete, setConfirmDelete] = createSignal<{
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
    const user = editingUser()
    if (!user) return

    try {
      await updateRoles(user.id, selectedRoles())
      toast.success(`Roles updated for ${user.display_name || 'user'}`)
      closeEditRoles()
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to update roles')
    }
  }

  const handleToggleVerified = async () => {
    const action = confirmVerify()
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
    if (!newEmail() || !newPassword()) return

    try {
      await createUser({
        email: newEmail(),
        password: newPassword(),
        display_name: newDisplayName() || undefined,
        roles: newRoles().length > 0 ? newRoles() : undefined,
      })
      toast.success(`User account created for ${newEmail()}`)
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
    const user = resetUser()
    if (!user || !resetNewPassword()) return

    try {
      await resetPassword(user.id, resetNewPassword())
      toast.success(`Password reset for ${user.name}`)
      setResetUser(null)
      setResetNewPassword('')
      setShowResetPassword(false)
    } catch (err: any) {
      toast.error(err.message || 'Failed to reset password')
    }
  }

  const handleDeleteUser = async () => {
    const action = confirmDelete()
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
      {/* Dark Header Band */}
      <div class="bg-gray-800 rounded-lg p-6 mb-8">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p class="text-gray-400 text-xs uppercase tracking-widest mb-1">Administration</p>
            <div class="flex items-center gap-3">
              <h1 class="text-2xl font-bold text-white">
                User Management
              </h1>
              <Suspense>
                <Show when={users()}>
                  <Badge size="sm" variant="primary">
                    {users()!.length} users
                  </Badge>
                </Show>
              </Suspense>
            </div>
            <p class="mt-1 text-gray-400 text-sm">
              Create accounts, manage roles, reset passwords, and verify users
            </p>
          </div>
          <Button
            onClick={() => setCreateModalOpen(true)}
            class="shrink-0"
          >
            <UserPlus size={16} />
            Create User
          </Button>
        </div>
      </div>

      {/* Inline Filter Bar */}
      <div class="mb-6">
        <div class="flex flex-col sm:flex-row gap-3">
          <div class="relative flex-1">
            <Search size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search users..."
              value={searchQuery()}
              onInput={(e) => {
                setSearchQuery(e.currentTarget.value)
                debouncedSetSearch(e.currentTarget.value)
              }}
              class="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none"
            />
          </div>
          <select
            value={roleFilter()}
            onChange={(e) => setRoleFilter(e.currentTarget.value)}
            class="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:border-ktip-ocean-500 focus:outline-none"
          >
            <option value="">All Roles</option>
            <For each={ALL_ROLES}>
              {(role) => (
                <option value={role}>{ROLE_LABELS[role]}</option>
              )}
            </For>
          </select>
          <select
            value={verifiedFilter()}
            onChange={(e) => setVerifiedFilter(e.currentTarget.value)}
            class="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:border-ktip-ocean-500 focus:outline-none"
          >
            <option value="">All Status</option>
            <option value="true">Verified</option>
            <option value="false">Unverified</option>
          </select>
          <Show when={roleFilter() || verifiedFilter() || searchQuery()}>
            <button
              type="button"
              onClick={() => {
                setRoleFilter('')
                setVerifiedFilter('')
                setSearchQuery('')
                setDebouncedSearch('')
              }}
              class="text-sm text-ktip-ocean-600 hover:text-ktip-ocean-700 font-medium whitespace-nowrap"
            >
              Clear all
            </button>
          </Show>
        </div>
      </div>

      {/* Users Table */}
      <div class="overflow-hidden">
        <Suspense
          fallback={
            <div class="p-12 text-center text-gray-500">
              Loading users...
            </div>
          }
        >
          <Show
            when={users()?.length}
            fallback={
              <div class="p-12 text-center">
                <Users size={48} class="mx-auto text-gray-300 mb-4" />
                <h3 class="text-lg font-semibold text-gray-700 mb-1">No users found</h3>
                <p class="text-gray-500 text-sm">
                  {roleFilter() || verifiedFilter() || searchQuery()
                    ? 'Try adjusting your filters'
                    : 'No users have signed up yet'}
                </p>
              </div>
            }
          >
            <div class="overflow-x-auto">
              <table class="w-full">
                <thead>
                  <tr class="border-b border-gray-200">
                    <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">User</th>
                    <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Country</th>
                    <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Roles</th>
                    <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Verified</th>
                    <th class="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-200">
                  <For each={users()}>
                    {(user) => (
                      <tr class="hover:bg-gray-50 transition-colors">
                        {/* User */}
                        <td class="px-4 py-3">
                          <div class="flex items-center gap-3">
                            <Show
                              when={user.avatar_url}
                              fallback={
                                <div class="w-8 h-8 rounded-full bg-ktip-ocean-100 flex items-center justify-center text-xs font-semibold text-ktip-ocean-700">
                                  {getInitials(user.display_name)}
                                </div>
                              }
                            >
                              <img
                                src={user.avatar_url!}
                                alt={user.display_name || 'User'}
                                class="w-8 h-8 rounded-full object-cover"
                              />
                            </Show>
                            <div>
                              <p class="font-medium text-gray-900 text-sm">
                                {user.display_name || 'Unnamed User'}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Country */}
                        <td class="px-4 py-3">
                          <span class="text-sm text-gray-700">
                            {user.country || '--'}
                          </span>
                        </td>

                        {/* Roles */}
                        <td class="px-4 py-3">
                          <div class="flex flex-wrap gap-1">
                            <Show
                              when={user.roles.length > 0}
                              fallback={
                                <span class="text-xs text-gray-400">No roles</span>
                              }
                            >
                              <For each={user.roles}>
                                {(role) => (
                                  <Badge size="sm" class={ROLE_COLORS[role]}>
                                    {ROLE_LABELS[role]}
                                  </Badge>
                                )}
                              </For>
                            </Show>
                          </div>
                        </td>

                        {/* Verified */}
                        <td class="px-4 py-3">
                          <Show
                            when={user.is_verified}
                            fallback={
                              <Badge size="sm" variant="danger">
                                <XCircle size={12} />
                                Unverified
                              </Badge>
                            }
                          >
                            <Badge size="sm" variant="success">
                              <CheckCircle size={12} />
                              Verified
                            </Badge>
                          </Show>
                        </td>

                        {/* Actions */}
                        <td class="px-4 py-3">
                          <div class="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => openEditRoles(user)}
                              class="p-1.5 text-gray-400 hover:text-ktip-ocean-600 transition-colors"
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
                              class="p-1.5 text-gray-400 hover:text-amber-600 transition-colors"
                              title="Reset password"
                            >
                              <KeyRound size={16} />
                            </button>
                            <Show
                              when={user.is_verified}
                              fallback={
                                <button
                                  type="button"
                                  onClick={() => setConfirmVerify({
                                    userId: user.id,
                                    userName: user.display_name || 'this user',
                                    newVerified: true,
                                  })}
                                  class="p-1.5 text-gray-400 hover:text-ktip-tropical-600 transition-colors"
                                  title="Verify user"
                                >
                                  <ShieldCheck size={16} />
                                </button>
                              }
                            >
                              <button
                                type="button"
                                onClick={() => setConfirmVerify({
                                  userId: user.id,
                                  userName: user.display_name || 'this user',
                                  newVerified: false,
                                })}
                                class="p-1.5 text-gray-400 hover:text-red-600 transition-colors"
                                title="Unverify user"
                              >
                                <ShieldX size={16} />
                              </button>
                            </Show>
                            <button
                              type="button"
                              onClick={() => setConfirmDelete({
                                userId: user.id,
                                userName: user.display_name || 'this user',
                              })}
                              class="p-1.5 text-gray-400 hover:text-red-600 transition-colors"
                              title="Delete user"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </Show>
        </Suspense>
      </div>

      {/* Create User Modal */}
      <Modal
        open={createModalOpen()}
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
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Email *</label>
            <input
              type="email"
              value={newEmail()}
              onInput={(e) => setNewEmail(e.currentTarget.value)}
              placeholder="user@example.com"
              class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
            <input
              type="text"
              value={newDisplayName()}
              onInput={(e) => setNewDisplayName(e.currentTarget.value)}
              placeholder="John Doe"
              class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Password *</label>
            <div class="relative">
              <input
                type={showNewPassword() ? 'text' : 'password'}
                value={newPassword()}
                onInput={(e) => setNewPassword(e.currentTarget.value)}
                placeholder="Minimum 8 characters"
                class="w-full px-3 py-2 pr-10 border border-gray-200 rounded-lg text-sm focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword())}
                class="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <Show when={showNewPassword()} fallback={<Eye size={16} />}>
                  <EyeOff size={16} />
                </Show>
              </button>
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Roles</label>
            <div class="flex flex-wrap gap-2">
              <For each={ALL_ROLES}>
                {(role) => (
                  <button
                    type="button"
                    onClick={() => toggleNewRole(role)}
                    class={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      newRoles().includes(role)
                        ? 'bg-ktip-ocean-50 border-ktip-ocean-300 text-ktip-ocean-700'
                        : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {ROLE_LABELS[role]}
                  </button>
                )}
              </For>
            </div>
          </div>
          <div class="flex justify-end gap-3 pt-4 border-t border-gray-100">
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
              disabled={actionLoading()}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleCreateUser}
              loading={actionLoading()}
              disabled={!newEmail() || !newPassword() || newPassword().length < 8}
            >
              <UserPlus size={14} />
              Create Account
            </Button>
          </div>
        </div>
      </Modal>

      {/* Reset Password Modal */}
      <Modal
        open={!!resetUser()}
        onClose={() => {
          setResetUser(null)
          setResetNewPassword('')
          setShowResetPassword(false)
        }}
        title={`Reset Password — ${resetUser()?.name || 'User'}`}
        size="sm"
      >
        <div class="space-y-4">
          <p class="text-sm text-gray-600">
            Set a new password for this user. They will need to use this password on their next login.
          </p>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">New Password</label>
            <div class="relative">
              <input
                type={showResetPassword() ? 'text' : 'password'}
                value={resetNewPassword()}
                onInput={(e) => setResetNewPassword(e.currentTarget.value)}
                placeholder="Minimum 8 characters"
                class="w-full px-3 py-2 pr-10 border border-gray-200 rounded-lg text-sm focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowResetPassword(!showResetPassword())}
                class="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <Show when={showResetPassword()} fallback={<Eye size={16} />}>
                  <EyeOff size={16} />
                </Show>
              </button>
            </div>
          </div>
          <div class="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setResetUser(null)
                setResetNewPassword('')
                setShowResetPassword(false)
              }}
              disabled={actionLoading()}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleResetPassword}
              loading={actionLoading()}
              disabled={!resetNewPassword() || resetNewPassword().length < 8}
            >
              <KeyRound size={14} />
              Reset Password
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Roles Modal */}
      <Modal
        open={!!editingUser()}
        onClose={closeEditRoles}
        title={`Edit Roles - ${editingUser()?.display_name || 'User'}`}
      >
        <div class="space-y-4">
          <p class="text-sm text-gray-600">
            Select the roles for this user.
          </p>
          <div class="space-y-3">
            <For each={ALL_ROLES}>
              {(role) => (
                <label class="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={selectedRoles().includes(role)}
                    onChange={() => toggleRole(role)}
                    class="w-4 h-4 rounded border-gray-300 text-ktip-ocean-600 focus:ring-ktip-ocean-500"
                  />
                  <div class="flex items-center gap-2">
                    <Badge size="sm" class={ROLE_COLORS[role]}>
                      {ROLE_LABELS[role]}
                    </Badge>
                  </div>
                </label>
              )}
            </For>
          </div>
          <div class="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <Button
              variant="outline"
              size="sm"
              onClick={closeEditRoles}
              disabled={actionLoading()}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSaveRoles}
              loading={actionLoading()}
            >
              Save Roles
            </Button>
          </div>
        </div>
      </Modal>

      {/* Confirm Verify/Unverify Modal */}
      <ConfirmModal
        open={!!confirmVerify()}
        title={confirmVerify()?.newVerified ? 'Verify User' : 'Unverify User'}
        message={
          confirmVerify()?.newVerified
            ? `Are you sure you want to verify "${confirmVerify()?.userName}"? They will receive a verified badge on their profile.`
            : `Are you sure you want to unverify "${confirmVerify()?.userName}"? Their verified badge will be removed.`
        }
        confirmLabel={confirmVerify()?.newVerified ? 'Verify' : 'Unverify'}
        confirmVariant={confirmVerify()?.newVerified ? 'primary' : 'danger'}
        loading={actionLoading()}
        onConfirm={handleToggleVerified}
        onCancel={() => setConfirmVerify(null)}
      />

      {/* Confirm Delete User Modal */}
      <ConfirmModal
        open={!!confirmDelete()}
        title="Delete User"
        message={`Are you sure you want to permanently delete "${confirmDelete()?.userName}"? This action cannot be undone. All their data (projects, posts, messages, etc.) will be removed.`}
        confirmLabel="Delete User"
        confirmVariant="danger"
        loading={actionLoading()}
        onConfirm={handleDeleteUser}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  )
}

export default function AdminUsersPage() {
  return (
    <AdminLayout>
      <AdminUsersContent />
    </AdminLayout>
  )
}
