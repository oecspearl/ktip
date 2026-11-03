import { usePageTitle } from '../../../hooks/usePageTitle'
import { Trans, useLingui } from '@lingui/react/macro'
import { useAuth } from '../../../contexts/AuthContext'
import { expandRoles, isOrganizationAccount } from '../../../lib/permissions'
import { VerificationTab as VerificationPanel } from '../../../components/settings/VerificationTab'
import { BusinessVerificationCard } from '../../../components/verification/BusinessVerificationCard'

/**
 * One page for every kind of verification.
 *
 * Organisation accounts get two sections: the business, which their business
 * association verifies (this was /sme/verification, which now redirects here),
 * and their own identity. Individuals get identity only.
 *
 * Was /settings?tab=verification, the address migration 145 wrote into every
 * "your account is verified" notification, so the redirect carries it here.
 *
 * The identity panel carries data-spy-off, which switches the scroll-spy rail
 * off for this whole route, hero included. That is what it did under Settings.
 */
export default function VerificationTab() {
  const { t } = useLingui()
  const auth = useAuth()
  usePageTitle(t`Verification`)

  const isOrg = !!auth.profile && isOrganizationAccount(expandRoles(auth.profile.roles))

  if (!isOrg) return <VerificationPanel />

  return (
    <div className="space-y-10">
      <section id="business" aria-labelledby="verification-business" className="scroll-mt-24 space-y-3">
        <div>
          <h2 id="verification-business" className="text-xl font-display font-bold text-ktip-sand-900">
            <Trans>Your business</Trans>
          </h2>
          <p className="text-sm text-ktip-sand-600">
            <Trans>Submit to your business association. Once they verify it, your business and your profile show the verified badge.</Trans>
          </p>
        </div>
        <BusinessVerificationCard />
      </section>

      <section id="you" aria-labelledby="verification-identity" className="scroll-mt-24 space-y-3">
        <div>
          <h2 id="verification-identity" className="text-xl font-display font-bold text-ktip-sand-900">
            <Trans>You</Trans>
          </h2>
          <p className="text-sm text-ktip-sand-600">
            <Trans>Your own identity, separate from the business.</Trans>
          </p>
        </div>
        <VerificationPanel />
      </section>
    </div>
  )
}
