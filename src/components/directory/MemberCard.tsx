import { A } from '@solidjs/router'
import { Show, For } from 'solid-js'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { User, MapPin, MessageSquare } from 'lucide-solid'
import type { Profile } from '../../types'
import { ROLE_LABELS, ROLE_COLORS } from '../../lib/constants'
import { truncate } from '../../lib/utils'

interface MemberCardProps {
  member: Profile
}

export function MemberCard(props: MemberCardProps) {
  return (
    <Card hover class="h-full flex flex-col">
      {/* Avatar & Name */}
      <div class="flex items-center gap-4 mb-4">
        <Show
          when={props.member.avatar_url}
          fallback={
            <div class="w-14 h-14 bg-ktip-ocean-100 rounded-full flex items-center justify-center text-xl font-bold text-ktip-ocean-700 shrink-0">
              {props.member.display_name?.charAt(0).toUpperCase() || <User size={24} />}
            </div>
          }
        >
          <img
            src={props.member.avatar_url!}
            alt={props.member.display_name || 'Member'}
            class="w-14 h-14 rounded-full object-cover shrink-0"
          />
        </Show>
        <div class="min-w-0">
          <h3 class="text-lg font-display font-bold text-ktip-sand-900 truncate">
            {props.member.display_name || 'Anonymous'}
          </h3>
          <Show when={props.member.country}>
            <div class="flex items-center gap-1 text-sm text-ktip-sand-500">
              <MapPin size={14} />
              <span>{props.member.country}</span>
            </div>
          </Show>
        </div>
      </div>

      {/* Roles */}
      <Show when={props.member.roles?.length > 0}>
        <div class="flex flex-wrap gap-1.5 mb-3">
          <For each={props.member.roles.slice(0, 3)}>
            {(role) => (
              <Badge class={ROLE_COLORS[role]} size="sm">
                {ROLE_LABELS[role] || role}
              </Badge>
            )}
          </For>
        </div>
      </Show>

      {/* Bio */}
      <Show when={props.member.bio}>
        <p class="text-sm text-ktip-sand-600 mb-3 line-clamp-2 flex-1">
          {truncate(props.member.bio!, 120)}
        </p>
      </Show>

      {/* Skills */}
      <Show when={props.member.skills?.length > 0}>
        <div class="flex flex-wrap gap-1.5 mb-4">
          <For each={props.member.skills.slice(0, 3)}>
            {(skill) => (
              <span class="text-xs px-2 py-0.5 bg-ktip-sand-100 text-ktip-sand-600 rounded-full">
                {skill}
              </span>
            )}
          </For>
          <Show when={props.member.skills.length > 3}>
            <span class="text-xs text-ktip-sand-400">
              +{props.member.skills.length - 3}
            </span>
          </Show>
        </div>
      </Show>

      {/* Actions */}
      <div class="mt-auto pt-3 border-t border-ktip-sand-100 flex gap-2">
        <A
          href={`/profile/${props.member.id}`}
          class="flex-1 text-center text-sm font-medium text-ktip-ocean-600 hover:text-ktip-ocean-700 py-1.5 rounded-lg hover:bg-ktip-ocean-50 transition-colors"
        >
          View Profile
        </A>
        <A
          href="/messages"
          class="flex items-center justify-center gap-1.5 text-sm font-medium text-ktip-sand-600 hover:text-ktip-sand-700 py-1.5 px-3 rounded-lg hover:bg-ktip-sand-50 transition-colors"
        >
          <MessageSquare size={14} />
          Connect
        </A>
      </div>
    </Card>
  )
}
