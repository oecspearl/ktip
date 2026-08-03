import type { I18n, MessageDescriptor } from '@lingui/core'

/**
 * A piece of copy that may already be a descriptor, or may still be a source
 * string.
 *
 * Both turn up in the same array all over this codebase, because two mechanisms
 * feed the catalogs:
 *
 *   msg`All Categories`   — ours, wrapped in place, arrives as a descriptor
 *   c.label               — from lib/constants, harvested, arrives as the
 *                           source English which IS its catalog id
 *
 * They resolve identically at runtime. They do not type-check identically:
 * `i18n._` is overloaded on `MessageDescriptor` and on `string`, and a union of
 * the two matches neither overload.
 */
export type Copy = string | MessageDescriptor

/**
 * Resolve either form against the active catalog.
 *
 * The two branches are the same call — the point is the narrowing, which is
 * what lets a call site hold a mixed list without casting at every use.
 */
export function resolveCopy(i18n: I18n, copy: Copy): string {
  return typeof copy === 'string' ? i18n._(copy) : i18n._(copy)
}
