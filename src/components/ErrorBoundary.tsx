import { Component, type ErrorInfo, type PropsWithChildren } from 'react'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'
import { Button } from './ui/Button'
import { AppError } from '../lib/app-error'
import { captureException } from '../lib/monitoring'

interface State {
  hasError: boolean
  error: Error | null
}

export class AppErrorBoundary extends Component<PropsWithChildren, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('AppErrorBoundary caught an error:', error, errorInfo)
    // Wrapped rather than reported raw: the original message can contain
    // proposal text or an email, which the scrubber would strip and leave the
    // issue untitled. The AppError code survives scrubbing and groups the issue.
    captureException(
      new AppError({
        code: 'REACT_COMPONENT_ERROR',
        area: 'react-render',
        operation: 'error-boundary',
        cause: error,
      })
    )
  }

  reset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      const err = this.state.error
      return (
        <div className="min-h-screen bg-ktip-canvas flex items-center justify-center p-4">
          <div className="max-w-md w-full text-center">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertTriangle size={40} className="text-red-500" />
            </div>
            <h1 className="text-3xl font-display font-bold text-ktip-sand-900 mb-3">
              Something went wrong
            </h1>
            <p className="text-ktip-sand-600 mb-8">
              An unexpected error occurred. Please try refreshing the page or go back to the home page.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={this.reset} icon={<RefreshCw size={18} />}>
                Try Again
              </Button>
              <a href="/">
                <Button variant="outline" icon={<Home size={18} />}>
                  Go Home
                </Button>
              </a>
            </div>
            <details className="mt-8 text-left">
              <summary className="text-sm text-ktip-sand-500 cursor-pointer hover:text-ktip-sand-700">
                Error details
              </summary>
              <pre className="mt-2 p-4 bg-ktip-sand-100 rounded-xl text-xs text-ktip-sand-700 overflow-auto max-h-40">
                {err?.message || String(err)}
              </pre>
            </details>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
