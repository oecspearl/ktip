import { A } from '@solidjs/router'
import { Show } from 'solid-js'
import { Badge } from '../ui/Badge'
import type { Grant } from '../../types'
import { ClimateBadge } from '../ui/ClimateBadge'
import { formatCurrency, formatDate, formatRelativeTime, truncate } from '../../lib/utils'
import { isPast } from 'date-fns'

interface GrantCardProps {
  grant: Grant
}

export function GrantCard(props: GrantCardProps) {
  const hasDeadline = () => !!props.grant.deadline
  const isExpired = () =>
    hasDeadline() && isPast(new Date(props.grant.deadline!))

  const getAmountDisplay = () => {
    if (props.grant.amount_min && props.grant.amount_max) {
      return `${formatCurrency(props.grant.amount_min, props.grant.currency)} - ${formatCurrency(props.grant.amount_max, props.grant.currency)}`
    } else if (props.grant.amount_min) {
      return `${formatCurrency(props.grant.amount_min, props.grant.currency)}+`
    } else if (props.grant.amount_max) {
      return `Up to ${formatCurrency(props.grant.amount_max, props.grant.currency)}`
    }
    return 'Amount varies'
  }

  const getTypeColor = (type: string | null) => {
    const colors: Record<string, string> = {
      startup: 'bg-purple-100 text-purple-700 border-purple-200',
      research: 'bg-blue-100 text-blue-700 border-blue-200',
      innovation: 'bg-ktip-tropical-100 text-ktip-tropical-700 border-ktip-tropical-200',
      development: 'bg-orange-100 text-orange-700 border-orange-200',
      education: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    }
    return colors[type || ''] || 'bg-gray-100 text-gray-700 border-gray-200'
  }

  const getTypeIcon = (type: string | null) => {
    const icons: Record<string, string> = {
      startup: '🚀',
      research: '🔬',
      innovation: '💡',
      development: '🛠️',
      education: '📚',
    }
    return icons[type || ''] || '💰'
  }

  return (
    <div class="flex flex-col md:flex-row border-b border-gray-200 pb-8 mb-8">
      {/* Left: Icon area */}
      <A href={`/grants/${props.grant.id}`} class="w-full md:w-40 h-36 shrink-0 relative">
        <div class="w-full h-full bg-gradient-to-br from-ktip-ocean-100 to-ktip-tropical-100 flex items-center justify-center text-5xl">
          {getTypeIcon(props.grant.grant_type)}
        </div>
        {/* Status overlays */}
        <Show when={isExpired()}>
          <div class="absolute top-3 left-3 z-10">
            <Badge variant="danger" class="bg-red-100 text-red-700">Expired</Badge>
          </div>
        </Show>
        <Show when={!props.grant.is_active}>
          <div class="absolute top-3 left-3 z-10">
            <Badge variant="default">Inactive</Badge>
          </div>
        </Show>
      </A>

      {/* Right: Content */}
      <div class="flex-1 md:pl-6 pt-4 md:pt-0 flex flex-col justify-center">
        {/* Type + Climate badges */}
        <div class="flex flex-wrap gap-2 mb-2">
          <Show when={props.grant.grant_type}>
            <Badge class={getTypeColor(props.grant.grant_type)} size="sm">
              {props.grant.grant_type?.replace('_', ' ').toUpperCase()}
            </Badge>
          </Show>
          <Show when={props.grant.is_climate_action}>
            <ClimateBadge />
          </Show>
        </div>

        {/* Title */}
        <A href={`/grants/${props.grant.id}`}>
          <h3 class="text-lg font-display font-bold text-ktip-sand-900 uppercase line-clamp-2 mb-2 hover:text-ktip-ocean-600 transition-colors">
            {props.grant.title}
          </h3>
        </A>

        {/* Description */}
        <Show when={props.grant.description}>
          <p class="text-sm text-gray-600 mb-3 line-clamp-2">
            {truncate(props.grant.description!, 150)}
          </p>
        </Show>

        {/* Amount + Deadline pills */}
        <div class="flex flex-wrap gap-3 mb-3">
          <span class="border border-ktip-ocean-500 rounded px-3 py-1 text-sm">
            <span class="font-bold text-ktip-ocean-600">Amount:</span>{' '}
            <span class="text-gray-700">{getAmountDisplay()}</span>
          </span>
          <Show when={hasDeadline()}>
            <span class={`border rounded px-3 py-1 text-sm ${isExpired() ? 'border-red-400' : 'border-ktip-ocean-500'}`}>
              <span class={`font-bold ${isExpired() ? 'text-red-600' : 'text-ktip-ocean-600'}`}>Deadline:</span>{' '}
              <span class={isExpired() ? 'text-red-600' : 'text-gray-700'}>
                {formatDate(props.grant.deadline!)}
              </span>
            </span>
          </Show>
        </div>

        {/* Bottom metadata */}
        <div class="flex flex-wrap items-center justify-between gap-2">
          <Show when={props.grant.eligibility}>
            <p class="text-xs text-gray-400 line-clamp-1">
              Eligibility: {props.grant.eligibility}
            </p>
          </Show>
          <Show when={hasDeadline() && !isExpired()}>
            <span class="text-xs text-gray-400">
              {formatRelativeTime(props.grant.deadline!)}
            </span>
          </Show>
        </div>
      </div>
    </div>
  )
}
