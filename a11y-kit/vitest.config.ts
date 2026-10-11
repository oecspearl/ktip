import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Standalone run for the kit on its own (`npx vitest run -c a11y-kit/vitest.config.ts`).
// Inside KTIP the root vitest config picks these tests up as well.
export default defineConfig({
  // Without this, `include` resolves against the shell's cwd, and running from
  // the host's root picks up the host's whole suite
  root: fileURLToPath(new URL('.', import.meta.url)),
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
  },
})
