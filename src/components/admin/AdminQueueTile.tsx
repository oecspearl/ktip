import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { AlertTriangle, Check } from 'lucide-react'
import type { Measured } from '../../lib/measured'

interface AdminQueueTileProps {
  icon: ReactNode
  label: string
  /** How much work is waiting, or why that could not be read. */
  measured: Measured
  /** The queue page. The whole point of the tile is that it is one click. */
  to: string
  /** What the number counts, e.g. "documents waiting". */
  noun: string
}

/**
 * One work queue on the admin dashboard.
 *
 * The difference between this and AdminStatTile is the difference between a
 * figure and a job. A stat tile reports the size of the platform; this reports
 * that eleven people are waiting on somebody at this desk, and takes them
 * there. It is styled loud when it is non-zero and quiet when it is not,
 * because a console where every tile shouts is a console nobody reads.
 *
 * Zero is rendered, not hidden. "Nothing waiting" is a real and useful answer —
 * hiding the tile would leave the reader unable to tell a cleared queue from a
 * queue they lack the permission to see, which is exactly the ambiguity
 * src/lib/measured.ts exists to kill.
 *
 * English, not lingui — src/pages/admin/ and its components are excluded in
 * scripts/i18n/config.mjs.
 */
export function AdminQueueTile({ icon, label, measured, to, noun }: AdminQueueTileProps) {
  const failed = measured.state !== 'ok'
  const waiting = measured.state === 'ok' ? measured.value : null
  const busy = waiting !== null && waiting > 0

  return (
    <Link
      to={to}
      title={measured.state === 'unavailable' ? measured.reason : undefined}
      className={`neu-surface group flex items-center gap-3 rounded-2xl border p-4 shadow-neu-sm transition-colors ${
        failed
          ? 'border-ktip-sun-200 bg-ktip-sun-50/50'
          : busy
            ? 'border-ktip-sun-300 bg-ktip-sun-50 hover:border-ktip-sun-400'
            : 'border-ktip-sand-200 bg-ktip-cream hover:border-ktip-ocean-300'
      }`}
    >
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
          failed ? 'bg-ktip-sun-100' : busy ? 'bg-ktip-sun-100' : 'bg-ktip-sand-100'
        }`}
      >
        {failed ? (
          <AlertTriangle size={20} className="text-ktip-sun-700" />
        ) : busy ? (
          icon
        ) : (
          <Check size={20} className="text-ktip-tropical-600" />
        )}
      </div>
      <div className="min-w-0">
        <p
          className={`text-2xl font-bold ${
            failed ? 'text-ktip-sand-400' : busy ? 'text-ktip-sun-800' : 'text-ktip-sand-400'
          }`}
        >
          {/* U+2014 for an unreadable queue. Never "0" — an unread queue and an
              empty one are opposite instructions to whoever is on shift. */}
          {waiting === null ? '—' : waiting.toLocaleString()}
        </p>
        <p className="text-xs font-medium text-gray-900">{label}</p>
        <p className="text-xs text-gray-500">
          {failed ? "Couldn't load" : busy ? noun : 'Nothing waiting'}
        </p>
      </div>
    </Link>
  )
}
