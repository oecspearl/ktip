import { describe, it, expect, afterEach } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { useSpySteps, type SpyStep } from './useSpySteps'

// The hook scans #main-content, which MainLayout renders — the harness stands in
// for that shell and lets a test write markers into it directly.
function Harness({ onSteps }: { onSteps: (steps: SpyStep[]) => void }) {
  onSteps(useSpySteps())
  return <main id="main-content" />
}

// MemoryRouter, not createMemoryRouter + RouterProvider. The hook only needs
// useLocation to resolve, and pulling RouterProvider from 'react-router/dom'
// while the hook imports from 'react-router' loads two copies of the package
// under Vitest's node resolution — different context objects, so every render
// died with "useLocation() may be used only in the context of a <Router>",
// React Router swallowed it into its own error boundary, and the harness never
// mounted. One import specifier, one instance.
function mount() {
  let steps: SpyStep[] = []
  const view = render(
    <MemoryRouter initialEntries={['/']}>
      <Harness onSteps={(s) => { steps = s }} />
    </MemoryRouter>,
  )
  return { view, read: () => steps }
}

/** Write markers into <main> and let the MutationObserver's rAF land. */
async function setMarkers(html: string) {
  document.getElementById('main-content')!.innerHTML = html
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
  })
}

afterEach(cleanup)

describe('useSpySteps', () => {
  it('derives steps from data-spy markers in document order', async () => {
    const { read } = mount()
    await setMarkers(`
      <section id="one" data-spy="One"></section>
      <section id="two" data-spy="Two"></section>
    `)
    expect(read()).toEqual([
      { id: 'one', label: 'One', hide: false },
      { id: 'two', label: 'Two', hide: false },
    ])
  })

  it('assigns an id to markers that have none, so clicks have a target', async () => {
    const { read } = mount()
    await setMarkers(`
      <section data-spy="First"></section>
      <section data-spy="Second"></section>
    `)
    expect(read().map((s) => s.id)).toEqual(['spy-0', 'spy-1'])
    expect(document.getElementById('spy-1')?.dataset.spy).toBe('Second')
  })

  it('flags data-spy-hide bands and skips blank labels', async () => {
    const { read } = mount()
    await setMarkers(`
      <section id="hero" data-spy="Top" data-spy-hide></section>
      <section id="blank" data-spy="  "></section>
      <section id="body" data-spy="Body"></section>
    `)
    expect(read()).toEqual([
      { id: 'hero', label: 'Top', hide: true },
      { id: 'body', label: 'Body', hide: false },
    ])
  })

  it('re-derives when the page swaps its sections (tab change)', async () => {
    const { read } = mount()
    await setMarkers('<section id="a" data-spy="A"></section><section id="b" data-spy="B"></section>')
    expect(read()).toHaveLength(2)

    await setMarkers('<section id="c" data-spy="C"></section>')
    expect(read()).toEqual([{ id: 'c', label: 'C', hide: false }])
  })

  it('returns nothing on a page with no markers', async () => {
    const { read } = mount()
    await setMarkers('<section>No rail here</section>')
    expect(read()).toEqual([])
  })

  // Both opt-outs leave the markers in the DOM on purpose: the tutorials in
  // src/data/tutorials anchor their steps to `[data-spy="…"]`, so quieting the
  // rail by deleting a marker would take a walkthrough step down with it.
  it('drops every step when the page declares data-spy-off', async () => {
    const { read } = mount()
    await setMarkers(`
      <div data-spy-off>
        <section id="one" data-spy="One"></section>
        <section id="two" data-spy="Two"></section>
      </div>
    `)
    expect(read()).toEqual([])
    expect(document.querySelectorAll('[data-spy]')).toHaveLength(2)
  })

  it('drops a single marker flagged data-spy-skip, keeping the rest', async () => {
    const { read } = mount()
    await setMarkers(`
      <section id="filters" data-spy="Filters" data-spy-skip></section>
      <section id="rankings" data-spy="Rankings"></section>
      <section id="mine" data-spy="Your rank"></section>
    `)
    expect(read()).toEqual([
      { id: 'rankings', label: 'Rankings', hide: false },
      { id: 'mine', label: 'Your rank', hide: false },
    ])
    expect(document.getElementById('filters')?.dataset.spy).toBe('Filters')
  })

  it('re-derives when data-spy-off is toggled on a live page', async () => {
    const { read } = mount()
    await setMarkers(`
      <div id="page">
        <section id="one" data-spy="One"></section>
        <section id="two" data-spy="Two"></section>
      </div>
    `)
    expect(read()).toHaveLength(2)

    await act(async () => {
      document.getElementById('page')!.setAttribute('data-spy-off', '')
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
    })
    expect(read()).toEqual([])
  })
})
