/**
 * Load a TypeScript module from a plain Node script.
 *
 * Used for two things, both of which have to read the REAL source rather than a
 * copy of it:
 *   - src/lib/i18n/should-translate.ts, so the scanner, the codemod, the CI
 *     ratchet and the browser all apply one definition of "this is copy". A
 *     second implementation here would drift within a month, and the symptom
 *     would be a catalog full of slugs.
 *   - the pure-data copy modules (site-map.ts, constants.ts, the tutorials), so
 *     the harvester walks their actual exported values instead of parsing them.
 *
 * Vite's ssrLoadModule is the mechanism, which is not a new dependency and not a
 * new idea: `edgeApiPlugin` in vite.config.ts already uses it to run the api/
 * Edge Functions under `npm run dev`.
 */

import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

let serverPromise = null

async function getServer() {
  if (!serverPromise) {
    serverPromise = createServer({
      // `configFile: false` skips the app's own config — this loader wants a
      // bare transform pipeline, not VitePWA, Sentry uploads and the dev API
      // middleware. It does mean the `@` alias has to be restated.
      configFile: false,
      logLevel: 'error',
      // The same macro transform the app build uses. Without it, any data
      // module that (transitively) imports @lingui/core/macro throws at
      // evaluation — permissions.ts started doing exactly that, which made
      // this loader silently SKIP constants.ts, which dropped every one of
      // its strings from the harvest and, via `lingui extract --clean`, from
      // the catalogs. The failure mode is a warning line and a smaller
      // catalog, so it has to be prevented here rather than noticed later.
      plugins: [react({ babel: { plugins: ['@lingui/babel-plugin-lingui-macro'] } })],
      server: { middlewareMode: true, hmr: false, watch: null },
      // Nothing here is served to a browser, so pre-bundling buys nothing — and
      // left on, its scan races the loader's own shutdown and prints an alarming
      // "Failed to scan for dependencies" after the script has already finished.
      optimizeDeps: { noDiscovery: true, include: [] },
      resolve: { alias: { '@': resolve(process.cwd(), 'src') } },
    })
  }
  return serverPromise
}

export async function loadTs(relPath) {
  const server = await getServer()
  return server.ssrLoadModule(resolve(process.cwd(), relPath))
}

export async function closeLoader() {
  if (!serverPromise) return
  const server = await serverPromise
  await server.close()
  serverPromise = null
}
