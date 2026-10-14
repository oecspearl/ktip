/**
 * The smallest useful integration: no router, no i18n library, no backend.
 * Settings live on the device only. Copy this, then add the adapters you need
 * (see README: sync, theme, navigation, messages).
 *
 * vite.config.ts:
 *   import { a11yPrepaint } from './a11y-kit/src/vite/prepaint-plugin'
 *   import { A11Y_CONFIG } from './src/a11y-config'
 *   plugins: [react(), a11yPrepaint(A11Y_CONFIG)]
 */
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  A11yProvider,
  SkipLinks,
  createA11yStore,
  onRequest,
  type A11yKitConfig,
} from '../src/index'
import { AccessibilityPanel } from '../src/ui'
import '../src/css/modes.css'
import '../src/css/ui.css'

// Plain data, shared with the Vite plugin so the first paint matches
export const A11Y_CONFIG: A11yKitConfig = {
  storageKey: 'myapp_a11y',
  fonts: [
    {
      id: 'atkinson',
      label: 'Atkinson Hyperlegible',
      // With a family the kit applies the font itself; no CSS of yours needed
      family: "'Atkinson Hyperlegible', system-ui, sans-serif",
      href: 'https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&display=swap',
    },
  ],
}

const store = createA11yStore(A11Y_CONFIG)

function AccessibilityButton() {
  const [open, setOpen] = useState(false)
  // Alt+Shift+A and the skip link ask for the panel this way
  useEffect(() => onRequest('panel', () => setOpen(true)), [])
  return (
    <div style={{ position: 'fixed', right: 16, bottom: 16 }}>
      {open && <AccessibilityPanel onClose={() => setOpen(false)} />}
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        Accessibility
      </button>
    </div>
  )
}

function App() {
  return (
    <A11yProvider
      store={store}
      routes={[
        { id: 'home', path: '/', label: 'Home', digit: 1 },
        { id: 'about', path: '/about', label: 'About', digit: 2 },
      ]}
    >
      <SkipLinks />
      <nav>
        <a href="/">Home</a> <a href="/about">About</a>
      </nav>
      <main id="main">
        <h1>Hello</h1>
        <p>Press Alt+Shift+K for the shortcuts, Alt+Shift+R to hear this page.</p>
      </main>
      <AccessibilityButton />
    </A11yProvider>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
