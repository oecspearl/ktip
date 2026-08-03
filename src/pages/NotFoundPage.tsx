import { Link } from 'react-router'
import { Button } from '../components/ui/Button'
import { Home, ArrowLeft, MapPinOff } from 'lucide-react'
import { PageHero } from '../components/layout/PageHero'
import { Trans, useLingui } from '@lingui/react/macro'

export default function NotFoundPage() {
    const { t } = useLingui()
  return (
    <>
      <PageHero
        eyebrow={t`Error 404`}
        title={t`Page Not Found`}
        imageSeed="404"
        compact
        breadcrumb={[{ label: t`Home`, href: '/' }, { label: '404' }]}
      />
      <div className="min-h-[40vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        <div className="w-20 h-20 bg-ktip-ocean-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <MapPinOff size={40} className="text-ktip-ocean-500" />
        </div>
        <h1 className="text-6xl font-display font-bold text-ktip-ocean-600 mb-2">404</h1>
        <h2 className="text-2xl font-display font-bold text-ktip-sand-900 mb-3">
          <Trans>Page not found</Trans>
        </h2>
        <p className="text-ktip-sand-600 mb-8">
          <Trans>The page you're looking for doesn't exist or has been moved.</Trans>
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link to="/">
            <Button icon={<Home size={18} />}><Trans>Go Home</Trans></Button>
          </Link>
          <Button variant="outline" icon={<ArrowLeft size={18} />} onClick={() => window.history.back()}>
            <Trans>Go Back</Trans>
          </Button>
        </div>
      </div>
      </div>
    </>
  )
}
