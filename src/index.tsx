// First import in the app: Sentry.init has to run before any module that could
// throw, or that module's failure goes unreported.
import './instrument'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import './index.css'
import App from './App.tsx'
import type { ErrorCode } from './lib/app-error'
import { watchForServiceWorkerTakeover } from './lib/service-worker'

// Must run before anything can navigate: a tab still driven by an older
// service worker gets the build it was served, routing bugs included. Sits below
// the './instrument' import so a failure in here is itself reported.
watchForServiceWorkerTakeover()

// Custom overlay scrollbar: native scrollbars are hidden in CSS (no gutter),
// this thumb tracks window scroll and fades in via html[data-scrolling].
const scrollThumb = document.createElement('div')
scrollThumb.id = 'overlay-scrollbar'
document.body.appendChild(scrollThumb)

const updateScrollThumb = () => {
  const doc = document.documentElement
  const viewH = window.innerHeight
  const scrollH = doc.scrollHeight
  if (scrollH <= viewH) return
  const thumbH = Math.max((viewH / scrollH) * viewH, 40)
  const top = (doc.scrollTop / (scrollH - viewH)) * (viewH - thumbH)
  scrollThumb.style.height = `${thumbH}px`
  scrollThumb.style.transform = `translateY(${top}px)`
}

let scrollbarTimer: number | undefined
window.addEventListener(
  'scroll',
  () => {
    updateScrollThumb()
    document.documentElement.setAttribute('data-scrolling', '')
    window.clearTimeout(scrollbarTimer)
    scrollbarTimer = window.setTimeout(
      () => document.documentElement.removeAttribute('data-scrolling'),
      800,
    )
  },
  { passive: true },
)
window.addEventListener('resize', updateScrollThumb, { passive: true })

const root = document.getElementById('root')

// React 19 routes render errors to these root callbacks. Without them, an error
// that a boundary re-throws or that React recovers from is only ever a console
// message — AppErrorBoundary alone does not see either case.
const reportUncaughtReactError = Sentry.reactErrorHandler()
const reportRecoverableReactError = Sentry.reactErrorHandler()

createRoot(root!, {
  onUncaughtError: (error, errorInfo) => {
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
