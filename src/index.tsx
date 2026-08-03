// First import in the app: Sentry.init has to run before any module that could
// throw, or that module's failure goes unreported.
import './instrument'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import './index.css'
import App from './App.tsx'
import type { ErrorCode } from './lib/app-error'
import { watchForServiceWorkerTakeover, purgeSupabaseResponseCache } from './lib/service-worker'

// Must run before anything can navigate: a tab still driven by an older
// service worker gets the build it was served, routing bugs included. Sits below
// the './instrument' import so a failure in here is itself reported.
watchForServiceWorkerTakeover()

// Fire-and-forget: drops the cross-account response cache an older build left
// behind. Not awaited — nothing in the first paint depends on it, and the
// entries it removes are only ever read on a network failure.
void purgeSupabaseResponseCache()

const root = document.getElementById('root')

// React 19 routes render errors to these root callbacks. Without them, an error
// that a boundary re-throws or that React recovers from is only ever a console
// message — AppErrorBoundary alone does not see either case.
const reportUncaughtReactError = Sentry.reactErrorHandler()
const reportRecoverableReactError = Sentry.reactErrorHandler()

createRoot(root!, {
  onUncaughtError: (error, errorInfo) => {
    // Passing onUncaughtError REPLACES React's default console logging, so
    // without this line a render crash in dev (where Sentry has no DSN) is
    // swallowed whole: blank page, clean console, nothing to debug from.
    console.error('Uncaught React render error:', error, errorInfo)
    Sentry.withScope((scope) => {
      scope.setTags({
        area: 'react-render',
        operation: 'uncaught-error',
        error_code: 'REACT_UNCAUGHT_ERROR' satisfies ErrorCode,
      })
      reportUncaughtReactError(error, errorInfo)
    })
  },
  onRecoverableError: (error, errorInfo) => {
    console.error('Recoverable React render error:', error, errorInfo)
    Sentry.withScope((scope) => {
      scope.setTags({
        area: 'react-render',
        operation: 'recoverable-error',
        error_code: 'REACT_RECOVERABLE_ERROR' satisfies ErrorCode,
      })
      reportRecoverableReactError(error, errorInfo)
    })
  },
}).render(
  <StrictMode>
    <App />
  </StrictMode>
)
