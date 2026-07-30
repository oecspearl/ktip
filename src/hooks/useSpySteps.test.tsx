import { describe, it, expect, afterEach } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { useSpySteps, type SpyStep } from './useSpySteps'

// The hook scans #main-content, which MainLayout renders — the harness stands in
// for that shell and lets a test write markers into it directly.
function Harness({ onSteps }: { onSteps: (steps: SpyStep[]) => void }) {
  onSteps(useSpySteps())
  return <main id="main-content" />
}

function mount() {
  let steps: SpyStep[] = []
  const router = createMemoryRouter(
    [{ path: '/', element: <Harness onSteps={(s) => { steps = s }} /> }],
    { initialEntries: ['/'] },
  )
  const view = render(<RouterProvider router={router} />)
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
})
