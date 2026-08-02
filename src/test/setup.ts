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
