import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [react()],
  // This config does not extend vite.config.ts, so the alias has to be repeated
  // here. Without it every aliased import fails only under `npm test`.
  resolve: {
    alias: {
      '@': resolve(process.cwd(), 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    // Vitest stubs CSS modules to an empty string by default, including
    // `?raw` imports. The error-console scoping test asserts on real
    // stylesheet text, so processing has to be on.
    css: true,
    // Registers the jest-dom matchers. Without it `toBeInTheDocument` and
    // friends are undefined, which is why the existing component tests assert
    // with bare `expect`.
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
