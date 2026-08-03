/**
 * Vitest setup, loaded before every test file.
 *
 * `@testing-library/jest-dom` has been a devDependency for a long time but was
 * never imported anywhere, so its matchers — `toBeInTheDocument`,
 * `toHaveClass`, `toBeVisible` — did not exist and component tests had to
 * assert with bare `expect`. The `/vitest` entry point is the one that
 * registers against Vitest's `expect` rather than Jest's.
 */
import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'
import { i18n } from '@lingui/core'
import { messages } from '../locales/en/messages.mjs'

/**
 * Activate the singleton for PLAIN LIB TESTS, not just component renders.
 *
 * The render() wrapper below covers anything that mounts React, but the
 * migration also moved copy inside src/lib functions (calendar relation
 * labels, DM-block explanations), which call `i18n._()`/`t` directly. A lib
 * test that touches one without this throws "Lingui: Attempted to call a
 * translation function without setting a locale." The real English catalog
 * keeps assertions on message TEXT working unchanged.
 */
i18n.loadAndActivate({ locale: 'en', messages })

/**
 * Every `render()` gets an I18nProvider, without any test asking for one.
 *
 * `<Trans>` and `useLingui` throw outright without the provider — "Trans
 * component was rendered without I18nProvider" — so the alternative is editing
 * every component test that touches a migrated file and every one written from
 * here on. The i18n migration touches essentially the whole UI, so that is not
 * a one-off cost; it is a tax on every future slice, paid in churn that says
 * nothing about the component under test.
 *
 * A mock in a setup file applies to every test file, which is what makes this a
 * single edit rather than sixty. An explicit `wrapper` in a test still wins:
 * the caller's options are spread last.
 */
vi.mock('@testing-library/react', async (importOriginal) => {
  const rtl = await importOriginal<typeof import('@testing-library/react')>()
  const { I18nTestProvider } = await import('./i18n')

  return {
    ...rtl,
    render: (ui: React.ReactElement, options?: Parameters<typeof rtl.render>[1]) =>
      rtl.render(ui, { wrapper: I18nTestProvider, ...options }),
  }
})
