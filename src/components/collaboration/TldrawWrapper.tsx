import { Component, Suspense, lazy, useState, type ReactNode } from 'react'

// Lazily load tldraw (and its stylesheet) — this is a large dependency and
// mirrors the original's dynamic-import-on-mount strategy.
const Tldraw = lazy(() =>
  Promise.all([import('tldraw'), import('tldraw/tldraw.css')]).then(([mod]) => ({ default: mod.Tldraw }))
)

interface TldrawWrapperProps {
  snapshot?: Record<string, any> | null
  onEditorReady?: (editor: any) => void
  readOnly?: boolean
}

// Catches failures to load the tldraw chunk itself (network errors etc.),
// equivalent to the try/catch around the original's dynamic import.
class TldrawLoadBoundary extends Component<
  { children: ReactNode; onError: (message: string) => void },
  { hasError: boolean }
> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    console.error('Failed to load tldraw:', error)
    this.props.onError(error instanceof Error ? error.message : 'Failed to load whiteboard')
  }

  render() {
    if (this.state.hasError) return null
    return this.props.children
  }
}

export function TldrawWrapper({ snapshot, onEditorReady, readOnly }: TldrawWrapperProps) {
  const [error, setError] = useState<string | null>(null)

  const handleMount = (editor: any) => {
    if (readOnly) {
      editor.updateInstanceState({ isReadonly: true })
    }
    onEditorReady?.(editor)
  }

  const tldrawProps: Record<string, any> = {
    licenseKey: import.meta.env.VITE_TLDRAW_LICENSE_KEY,
    inferDarkMode: true,
    onMount: handleMount,
  }

  // Pass snapshot as initial data if available (tldraw only consumes this
  // once, at store-creation time — same as the original imperative mount).
  if (snapshot && Object.keys(snapshot).length > 0) {
    tldrawProps.snapshot = snapshot
  }

  return (
    <div className="relative w-full h-[calc(100vh-12rem)] rounded-xl overflow-hidden border border-ktip-sand-200 bg-white">
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
          <div className="text-center">
            <p className="text-red-500 mb-2">Failed to load whiteboard</p>
            <p className="text-ktip-sand-400 text-sm">{error}</p>
          </div>
        </div>
      )}
      {!error && (
        <TldrawLoadBoundary onError={setError}>
          <Suspense
            fallback={
              <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
                <div className="text-center">
                  <div className="w-10 h-10 border-4 border-ktip-ocean-200 border-t-ktip-ocean-600 rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-ktip-sand-500">Loading whiteboard...</p>
                </div>
              </div>
            }
          >
            <Tldraw {...tldrawProps} />
          </Suspense>
        </TldrawLoadBoundary>
      )}
    </div>
  )
}
