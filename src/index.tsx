import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { watchForServiceWorkerTakeover } from './lib/service-worker'

// Must run before anything can navigate: a tab still driven by an older
// service worker gets the build it was served, routing bugs included.
watchForServiceWorkerTakeover()

const root = document.getElementById('root')

createRoot(root!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
