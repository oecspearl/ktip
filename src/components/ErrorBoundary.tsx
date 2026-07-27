import { ErrorBoundary as SolidErrorBoundary } from 'solid-js'
import type { ParentComponent } from 'solid-js'
import { AlertTriangle, RefreshCw, Home } from 'lucide-solid'
import { Button } from './ui/Button'

export const AppErrorBoundary: ParentComponent = (props) => {
  return (
    <SolidErrorBoundary
      fallback={(err, reset) => (
        <div class="min-h-screen bg-ktip-canvas flex items-center justify-center p-4">
          <div class="max-w-md w-full text-center">
            <div class="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertTriangle size={40} class="text-red-500" />
            </div>
            <h1 class="text-3xl font-display font-bold text-ktip-sand-900 mb-3">
              Something went wrong
            </h1>
            <p class="text-ktip-sand-600 mb-8">
              An unexpected error occurred. Please try refreshing the page or go back to the home page.
            </p>
            <div class="flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={reset} icon={<RefreshCw size={18} />}>
                Try Again
              </Button>
              <a href="/">
                <Button variant="outline" icon={<Home size={18} />}>
                  Go Home
                </Button>
              </a>
            </div>
            <details class="mt-8 text-left">
              <summary class="text-sm text-ktip-sand-500 cursor-pointer hover:text-ktip-sand-700">
                Error details
              </summary>
              <pre class="mt-2 p-4 bg-ktip-sand-100 rounded-xl text-xs text-ktip-sand-700 overflow-auto max-h-40">
                {err?.message || String(err)}
              </pre>
            </details>
          </div>
        </div>
      )}
    >
      {props.children}
    </SolidErrorBoundary>
  )
}
