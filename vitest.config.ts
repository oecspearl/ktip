import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
// @ts-expect-error -- plain .mjs plugin, shared verbatim with vite.config.ts
import { imageManifestPlugin } from './vite/image-manifest-plugin.mjs'

export default defineConfig({
  // The Lingui macro has to be repeated here for the same reason the alias below
  // is: this config does not extend vite.config.ts. Without it, any test that
  // renders a component using `t` or <Trans> fails to compile — and it fails
  // only under `npm test`, never in the app.
  // The image manifest plugin is repeated here for the same reason: any test
  // that renders a component importing `virtual:image-manifest` would otherwise
  // fail to resolve it only under `npm test`.
  plugins: [
    react({ babel: { plugins: ['@lingui/babel-plugin-lingui-macro'] } }),
    imageManifestPlugin(resolve(process.cwd(), 'public/_img/manifest.json')),
  ],
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
