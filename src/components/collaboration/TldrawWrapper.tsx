import { onMount, onCleanup, createSignal } from 'solid-js'

interface TldrawWrapperProps {
  snapshot?: Record<string, any> | null
  onEditorReady?: (editor: any) => void
  readOnly?: boolean
}

export function TldrawWrapper(props: TldrawWrapperProps) {
  let containerRef!: HTMLDivElement
  let reactRoot: { unmount: () => void } | null = null
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal<string | null>(null)

  onMount(async () => {
    try {
      const [ReactModule, ReactDOMModule, TldrawModule] = await Promise.all([
        import('react'),
        import('react-dom/client'),
        import('tldraw'),
      ])

      const React = ReactModule
      const ReactDOM = ReactDOMModule
      const { Tldraw } = TldrawModule

      // Import tldraw CSS
      await import('tldraw/tldraw.css')

      const root = ReactDOM.createRoot(containerRef)
      reactRoot = root

      const tldrawProps: Record<string, any> = {
        licenseKey: import.meta.env.VITE_TLDRAW_LICENSE_KEY,
        inferDarkMode: true,
        onMount: (editor: any) => {
          if (props.readOnly) {
            editor.updateInstanceState({ isReadonly: true })
          }
          props.onEditorReady?.(editor)
        },
      }

      // Pass snapshot as initial data if available
      if (props.snapshot && Object.keys(props.snapshot).length > 0) {
        tldrawProps.snapshot = props.snapshot
      }

      root.render(React.createElement(Tldraw, tldrawProps))

      setLoading(false)
    } catch (err) {
      console.error('Failed to load tldraw:', err)
      setError(err instanceof Error ? err.message : 'Failed to load whiteboard')
      setLoading(false)
    }
  })

  onCleanup(() => {
    if (reactRoot) {
      reactRoot.unmount()
      reactRoot = null
    }
  })

  return (
    <div class="relative w-full h-[calc(100vh-12rem)] rounded-xl overflow-hidden border border-ktip-sand-200 bg-white">
      {loading() && (
        <div class="absolute inset-0 flex items-center justify-center bg-white z-10">
          <div class="text-center">
            <div class="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-3" />
            <p class="text-ktip-sand-500">Loading whiteboard...</p>
          </div>
        </div>
      )}
      {error() && (
        <div class="absolute inset-0 flex items-center justify-center bg-white z-10">
          <div class="text-center">
            <p class="text-red-500 mb-2">Failed to load whiteboard</p>
            <p class="text-ktip-sand-400 text-sm">{error()}</p>
          </div>
        </div>
      )}
      <div ref={containerRef!} class="w-full h-full" />
    </div>
  )
}
