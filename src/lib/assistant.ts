import { ALL_ENTRIES } from './site-map'
import { filterByAccess, type Viewer } from './site-search'

/**
 * The KTIP Assistant is a client-side pseudo-conversation, not a database row.
 *
 * Messaging participants FK to `profiles` → `auth.users`, and the `messages`
 * INSERT policy is `auth.uid() = sender_id`, so a bot could not write its own
 * replies without a provisioned auth user and a SECURITY DEFINER RPC. The
 * thread lives in localStorage instead — see `useAIAssistant`.
 */

/** Deliberately not a UUID, so it can never collide with a real conversations.id. */
export const ASSISTANT_CONVERSATION_ID = 'ktip-assistant'
export const ASSISTANT_NAME = 'KTIP Assistant'
export const ASSISTANT_TAGLINE = 'Ask anything · navigate the platform'

export function isAssistantConversation(id: string | null | undefined): boolean {
  return id === ASSISTANT_CONVERSATION_ID
}

export interface AssistantDestination {
  id: string
  title: string
  href: string
  icon?: string
}

const ENTRIES_BY_ID = new Map(ALL_ENTRIES.map((entry) => [entry.id, entry]))

/**
 * Turn site-map ids returned by `/api/ai-search` into navigable chips.
 *
 * Entries without an `href` are dropped: those are walkthrough-only entries
 * whose value is the `steps` list, and a chip that navigates nowhere is worse
 * than no chip. Unknown ids cannot appear here — the edge function already
 * rejects anything outside `SITE_ENTRY_IDS` — but the lookup is defensive.
 */
export function resolveDestinations(ids: string[], viewer: Viewer): AssistantDestination[] {
  const entries = ids
    .map((id) => ENTRIES_BY_ID.get(id))
    .filter((entry): entry is NonNullable<typeof entry> => !!entry)

  return filterByAccess(entries, viewer)
    .filter((entry) => !!entry.href)
    .map((entry) => ({
      id: entry.id,
      title: entry.title,
      href: entry.href as string,
      icon: entry.icon,
    }))
}
