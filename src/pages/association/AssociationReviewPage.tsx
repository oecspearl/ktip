import { Link } from 'react-router'
import { ShieldX } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { PageHero } from '../../components/layout/PageHero'
import { usePageTitle } from '../../hooks/usePageTitle'
import { useAuth } from '../../contexts/AuthContext'
import { useChamberCountries } from '../../hooks/useInstitutions'
import { AssociationReviewQueue } from '../../components/association/AssociationReviewQueue'

/**
 * The business association's review queue, outside the admin console.
 *
 * AdminRoute admits only ADMIN_CONSOLE_KEYS, and sme:verify is deliberately
 * not one of them, so an association account could never open /admin/chamber.
 * This route sits behind PermissionRoute require="sme:verify" alone.
 *
 * What it shows is bounded by chamber_countries(): the countries of the
 * verified associations this account is an approved admin of. RLS on employers
 * enforces the same thing.
 */
export default function AssociationReviewPage() {
  const { t } = useLingui()
  const auth = useAuth()
  usePageTitle(t`Association review`)

  const { countries, loading } = useChamberCountries(auth.user?.id)

  return (
    <>
      <PageHero
        compact
        eyebrow={t`Business association`}
        title={t`Association review`}
        subtitle={t`Check the businesses in your country and verify the real ones`}
        imageSeed="business-association"
        breadcrumb={[
          { label: t`Home`, href: '/' },
          { label: t`Dashboard`, href: '/dashboard' },
          { label: t`Association review` },
        ]}
      />
      <div data-tutorial="association-queue" className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {loading ? (
          <p className="text-ktip-sand-500"><Trans>Loading…</Trans></p>
        ) : countries.length === 0 ? (
          <div className="bg-ktip-cream rounded-2xl shadow-card border border-ktip-sand-100 p-8 text-center">
            <ShieldX size={28} className="text-ktip-sand-400 mx-auto mb-3" />
            <p className="text-ktip-sand-700 font-medium">
              <Trans>Your account is not linked to an association yet</Trans>
            </p>
            <p className="text-sm text-ktip-sand-600 mt-1 max-w-lg mx-auto">
              <Trans>
                Ask OECS to link your account to your business association. Once it is linked, the
                businesses waiting in your country show up here.
              </Trans>
            </p>
            <p className="text-sm mt-3">
              <Link to="/help" className="text-ktip-ocean-600 underline">
                <Trans>Contact OECS through the Help Center</Trans>
              </Link>
            </p>
          </div>
        ) : (
          <AssociationReviewQueue mode="association" jurisdiction={countries} />
        )}
      </div>
    </>
  )
}
