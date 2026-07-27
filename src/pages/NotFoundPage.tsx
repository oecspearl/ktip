import { A } from '@solidjs/router'
import { MainLayout } from '../components/layout/MainLayout'
import { Button } from '../components/ui/Button'
import { Home, ArrowLeft, MapPinOff } from 'lucide-solid'

export default function NotFoundPage() {
  return (
    <MainLayout>
      <div class="min-h-[60vh] flex items-center justify-center p-4">
        <div class="max-w-md w-full text-center">
          <div class="w-20 h-20 bg-ktip-ocean-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <MapPinOff size={40} class="text-ktip-ocean-500" />
          </div>
          <h1 class="text-6xl font-display font-bold text-ktip-ocean-600 mb-2">404</h1>
          <h2 class="text-2xl font-display font-bold text-ktip-sand-900 mb-3">
            Page not found
          </h2>
          <p class="text-ktip-sand-600 mb-8">
            The page you're looking for doesn't exist or has been moved.
          </p>
          <div class="flex flex-col sm:flex-row gap-3 justify-center">
            <A href="/">
              <Button icon={<Home size={18} />}>Go Home</Button>
            </A>
            <Button variant="outline" icon={<ArrowLeft size={18} />} onClick={() => window.history.back()}>
              Go Back
            </Button>
          </div>
        </div>
      </div>
    </MainLayout>
  )
}
