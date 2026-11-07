import { Component, type ErrorInfo, type PropsWithChildren } from 'react'
import { i18n } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { AppError } from '../lib/app-error'
import { captureException } from '../lib/monitoring'

/**
 * Keeps a crash inside a LiveKit call from taking the page down with it.
 *
 * LiveKit's components throw during render when something is wired wrong (a
 * control that needs a LayoutContextProvider, for one). Without a boundary
 * that reaches the router and the whole venue room becomes "Unexpected
 * Application Error". With it, only the call area shows a message, and chat,
 * panels and the map keep working. "Try again" remounts the call.
 *
 * The i18n singleton rather than <Trans>, the same as AppErrorBoundary, so the
 * fallback itself cannot throw.
 */
interface State {
  failed: boolean
  attempt: number
}

export class CallErrorBoundary extends Component<PropsWithChildren<{ area?: string }>, State> {
  state: State = { failed: false, attempt: 0 }

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('CallErrorBoundary caught an error:', error, info)
    captureException(
      new AppError({
        code: 'REACT_COMPONENT_ERROR',
        area: this.props.area ?? 'video-call',
        operation: 'call-error-boundary',
        cause: error,
      })
    )
  }

  retry = () => this.setState((s) => ({ failed: false, attempt: s.attempt + 1 }))

  render() {
    if (this.state.failed) {
      return (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-ktip-sand-900 px-4 py-3 text-sm text-ktip-sand-100"
        >
          <span>{i18n._(msg`The call ran into a problem and stopped.`)}</span>
          <button
            type="button"
            onClick={this.retry}
            className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-medium hover:bg-white/10"
          >
            {i18n._(msg`Try again`)}
          </button>
        </div>
      )
    }
    // The key remounts the call on retry, so it reconnects from scratch.
    return <div key={this.state.attempt} className="contents">{this.props.children}</div>
  }
}
