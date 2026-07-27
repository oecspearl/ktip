import { Link } from 'react-router'
import { Badge } from '../ui/Badge'
import type { Grant } from '../../types'
import { ClimateBadge } from '../ui/ClimateBadge'
import { formatCurrency, formatDate, formatRelativeTime, truncate } from '../../lib/utils'
import { isPast } from 'date-fns'

interface GrantCardProps {
  grant: Grant
}

export function GrantCard({ grant }: GrantCardProps) {
  const hasDeadline = !!grant.deadline
  const isExpired = hasDeadline && isPast(new Date(grant.deadline!))

  const getAmountDisplay = () => {
    if (grant.amount_min && grant.amount_max) {
      return `${formatCurrency(grant.amount_min, grant.currency)} - ${formatCurrency(grant.amount_max, grant.currency)}`
    } else if (grant.amount_min) {
      return `${formatCurrency(grant.amount_min, grant.currency)}+`
    } else if (grant.amount_max) {
      return `Up to ${formatCurrency(grant.amount_max, grant.currency)}`
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
    <div className="flex flex-col md:flex-row border-b border-gray-200 pb-8 mb-8">
      {/* Left: Icon area */}
      <Link to={`/grants/${grant.id}`} className="w-full md:w-40 h-36 shrink-0 relative">
        <div className="w-full h-full bg-gradient-to-br from-ktip-ocean-100 to-ktip-tropical-100 flex items-center justify-center text-5xl">
          {getTypeIcon(grant.grant_type)}
        </div>
        {/* Status overlays */}
        {isExpired && (
          <div className="absolute top-3 left-3 z-10">
            <Badge variant="danger" className="bg-red-100 text-red-700">Expired</Badge>
          </div>
        )}
        {!grant.is_active && (
          <div className="absolute top-3 left-3 z-10">
            <Badge variant="default">Inactive</Badge>
          </div>
        )}
      </Link>

      {/* Right: Content */}
      <div className="flex-1 md:pl-6 pt-4 md:pt-0 flex flex-col justify-center">
        {/* Type + Climate badges */}
        <div className="flex flex-wrap gap-2 mb-2">
          {grant.grant_type && (
            <Badge className={getTypeColor(grant.grant_type)} size="sm">
              {grant.grant_type?.replace('_', ' ').toUpperCase()}
            </Badge>
          )}
          {grant.is_climate_action && <ClimateBadge />}
        </div>

        {/* Title */}
        <Link to={`/grants/${grant.id}`}>
          <h3 className="text-lg font-display font-bold text-ktip-sand-900 uppercase line-clamp-2 mb-2 hover:text-ktip-ocean-600 transition-colors">
            {grant.title}
          </h3>
        </Link>

        {/* Description */}
        {grant.description && (
          <p className="text-sm text-gray-600 mb-3 line-clamp-2">
            {truncate(grant.description!, 150)}
          </p>
        )}

        {/* Amount + Deadline pills */}
        <div className="flex flex-wrap gap-3 mb-3">
          <span className="border border-ktip-ocean-500 rounded px-3 py-1 text-sm">
            <span className="font-bold text-ktip-ocean-600">Amount:</span>{' '}
            <span className="text-gray-700">{getAmountDisplay()}</span>
          </span>
          {hasDeadline && (
            <span className={`border rounded px-3 py-1 text-sm ${isExpired ? 'border-red-400' : 'border-ktip-ocean-500'}`}>
              <span className={`font-bold ${isExpired ? 'text-red-600' : 'text-ktip-ocean-600'}`}>Deadline:</span>{' '}
              <span className={isExpired ? 'text-red-600' : 'text-gray-700'}>
                {formatDate(grant.deadline!)}
              </span>
            </span>
          )}
        </div>

        {/* Bottom metadata */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {grant.eligibility && (
            <p className="text-xs text-gray-400 line-clamp-1">
              Eligibility: {grant.eligibility}
            </p>
          )}
          {hasDeadline && !isExpired && (
            <span className="text-xs text-gray-400">
              {formatRelativeTime(grant.deadline!)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
