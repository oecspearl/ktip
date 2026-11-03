import { PageHero } from '../../../components/layout/PageHero'
import { usePageTitle } from '../../../hooks/usePageTitle'
import { AssociationReviewQueue } from '../../../components/association/AssociationReviewQueue'

/**
 * Every country's business verification queue. Business associations review
 * their own countries at /association/review; this is the OECS view: how long
 * each business has waited, which association covers its country, and an
 * override for when no association can act.
 *
 * Was /admin/chamber, which still redirects here.
 */
export default function AdminAssociationPage() {
  usePageTitle('Association Review')

  return (
    <div>
      <PageHero
        inset
        compact
        eyebrow="Administration"
        title="Association Review"
        subtitle="Businesses waiting for verification in every member state, and the association that covers each one"
        imageSeed="business-association"
      />
      <AssociationReviewQueue mode="admin" />
    </div>
  )
}
