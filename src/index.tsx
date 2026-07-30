import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { watchForServiceWorkerTakeover } from './lib/service-worker'

// Must run before anything can navigate: a tab still driven by an older
// service worker gets the build it was served, routing bugs included.
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

createRoot(root!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
