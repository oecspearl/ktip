// TEMP repro: does a page load with ktip_lang=es stored actually render Spanish?
import { describe, expect, it, beforeAll } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { Trans } from '@lingui/react/macro'

describe('refresh with stored es', () => {
  beforeAll(() => {
    localStorage.setItem('ktip_lang', 'es')
  })

  it('renders Spanish after the catalog loads', async () => {
    // Import AFTER storage is set — the module resolves the initial language
    // at import time, exactly like a real page load.
    const { LanguageProvider } = await import('./LanguageProvider')
    render(
      <LanguageProvider>
        <Trans>Projects</Trans>
      </LanguageProvider>
    )
    // First paint may be English (empty catalog) — the question is whether the
    // catalog arriving re-renders subscribed components.
    await waitFor(() => expect(screen.getByText('Proyectos')).toBeInTheDocument(), {
      timeout: 3000,
    })
  })
})
