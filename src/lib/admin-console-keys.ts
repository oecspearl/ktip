import type { PermissionKey } from '../types'

/**
 * The capability keys that admit an account to the admin console.
 *
 * This is an admission gate, not an authorization. What a console-holder can
 * actually see is decided per page by AdminLayout's `requires` and the
 * PermissionRoute around each route; what they can actually write is decided in
 * SQL.
 *
 * `sme:verify` and `institution:verify` are deliberately NOT here, even though
 * two console pages require them. Chambers, BSOs, governments, diaspora bodies
 * and IGOs all hold one or the other — they vet the members they are competent
 * to vet — and listing them would hand five organisation roles the admin
 * console. Everyone who should reach /admin/chamber or /admin/institutions is
 * admitted by another key on this list.
 *
 * Lives in its own Lingui-free module because api/ai-search.ts needs the same
 * list to work out, server-side, whether the caller may be pointed at admin
 * pages — and permissions.ts pulls in the Lingui macro, which the edge bundler
 * cannot compile. Same arrangement as site-map.ts.
 */
export const ADMIN_CONSOLE_KEYS: PermissionKey[] = [
  'org:manage',
  'members:view',
  'members:manage',
  'role:manage',
  'moderation:view',
  'verification:review',
  'project:manage_all',
  'event:manage',
  'grant:manage',
  'forum:manage',
  'resource:manage',
  'achievement:manage',
  'employer:manage',
]

/** True when this permission set should be shown the admin console at all. */
export function opensAdminConsole(can: (permission: PermissionKey) => boolean): boolean {
  return ADMIN_CONSOLE_KEYS.some(can)
}
