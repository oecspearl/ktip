import { GraduationCap } from 'lucide-react'
import { Button } from '../ui/Button'
import { Trans } from '@lingui/react/macro'

/**
 * "Sign in with OECS Virtual Campus".
 *
 * Deliberately a plain link, not a fetch: /auth/vc/start is an Edge Function
 * that generates the PKCE verifier, stores it server-side and 302s to the
 * campus. The browser has to follow that redirect itself.
 *
 * This is the KTIP-initiated direction. The other one — a learner pressing
 * "Go to KTIP" on the campus — needs no button here at all; it arrives at
 * /auth/vc/callback with a signed assertion already in hand.
 */
export function VirtualCampusButton({ label = 'Sign in with OECS Virtual Campus' }: { label?: string }) {
  return (
    <div className="mt-4">
      <a href="/auth/vc/start" className="block">
        <Button
          type="button"
          variant="outline"
          fullWidth
          icon={<GraduationCap size={20} />}
          className="justify-center"
        >
          {label}
        </Button>
      </a>
      <p className="mt-2 text-center text-xs text-ktip-sand-500">
        <Trans>Brings your course history across and starts your CV.</Trans>
      </p>
    </div>
  )
}
