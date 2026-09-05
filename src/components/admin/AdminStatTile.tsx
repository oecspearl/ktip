import type { ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { Measured } from '../../lib/measured'

interface AdminStatTileProps {
  icon: ReactNode
  /** Tailwind classes for the icon chip, e.g. "bg-ktip-ocean-100". */
  iconClass?: string
  label: string
  measured: Measured
  /** Larger figure styling for the headline tiles. */
  emphasis?: boolean
}

/**
 * One number on the admin dashboard, or an honest blank.
 *
 * The page already argued the principle for permissions — "A tile reading 0 is
 * a claim about the platform; hiding the tile is the truth" — but applied it
 * only to whether the tile rendered at all. A tile that DID render still turned
 * a failed query into a confident zero, which is the same lie with fewer
 * warnings. An em dash and a reason is what the reader can act on.
 *
 * English, not lingui — src/pages/admin/ and its components are excluded in
 * scripts/i18n/config.mjs.
 */
export function AdminStatTile({ icon, iconClass, label, measured, emphasis }: AdminStatTileProps) {
  const failed = measured.state === 'unavailable'

  return (
    <div
      className={`border rounded-lg p-4 ${
        failed ? 'border-ktip-sun-200 bg-ktip-sun-50/50' : 'border-ktip-sand-200'
      }`}
      title={failed ? measured.reason : undefined}
    >
      <div className="flex items-center gap-3">
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center ${
            failed ? 'bg-ktip-sun-100' : iconClass || 'bg-ktip-ocean-100'
          }`}
        >
          {failed ? <AlertTriangle size={20} className="text-ktip-sun-700" /> : icon}
        </div>
        <div className="min-w-0">
          <p
            className={`font-bold ${emphasis ? 'text-2xl' : 'text-xl'} ${
              measured.state === 'ok' ? 'text-gray-900' : 'text-ktip-sand-400'
            }`}
          >
            {measured.state === 'ok'
              ? measured.value.toLocaleString()
              : /* U+2014. Not "0", and not "—" spelled as a hyphen. */ '—'}
          </p>
          <p className="text-xs text-gray-500">{label}</p>
          {failed && <p className="text-xs text-ktip-sun-700 mt-0.5">Couldn't load</p>}
          {measured.state === 'not-instrumented' && (
            <p className="text-xs text-ktip-sand-400 mt-0.5">Not yet measured</p>
          )}
        </div>
      </div>
    </div>
  )
}
