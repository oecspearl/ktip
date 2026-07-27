import { Show, type ParentComponent } from 'solid-js'
import { Navbar } from './Navbar'
import { Footer } from './Footer'
import { SessionRecoveryBanner } from '../SessionRecoveryBanner'
import { UATFeedbackButton } from '../uat/UATFeedbackButton'
import { useAuth } from '../../contexts/AuthContext'

export const MainLayout: ParentComponent = (props) => {
  const auth = useAuth()

  return (
    <div class="min-h-screen flex flex-col bg-ktip-canvas">
      <a
        href="#main-content"
        class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-ktip-ocean-600 focus:text-white focus:rounded-lg focus:text-sm focus:font-medium"
      >
        Skip to main content
      </a>
      <Navbar />
      <Show when={auth.user() && !auth.profile() && !auth.loading()}>
        <SessionRecoveryBanner />
      </Show>
      <main id="main-content" class="flex-1">{props.children}</main>
      <Footer />
      <UATFeedbackButton />
    </div>
  )
}
