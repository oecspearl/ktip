import { readFileSync, existsSync } from 'node:fs'

/**
 * Serves `public/_img/manifest.json` to the app as `virtual:image-manifest`.
 *
 * A virtual module rather than a plain JSON import because the manifest is
 * generated output: it is gitignored, so a normal import would fail to resolve
 * on a clean checkout and break the build for anyone who has not run the
 * generator. Here a missing file simply resolves to an empty manifest, every
 * runtime lookup misses, and the app renders the original single-size images.
 *
 * Registered in BOTH vite.config.ts and vitest.config.ts — this repo's two
 * configs do not extend one another (see the alias comment in either file), so
 * anything the app imports has to be declared twice or it resolves in the app
 * and not under test.
 *
 * Read once at load time. Regenerating variants while `npm run dev` is running
 * needs a dev-server restart to pick up the new hashes.
 */
const VIRTUAL_ID = 'virtual:image-manifest'
const RESOLVED_ID = '\0' + VIRTUAL_ID

export function imageManifestPlugin(manifestPath) {
  return {
    name: 'ktip-image-manifest',
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID
    },
    load(id) {
      if (id !== RESOLVED_ID) return
      let manifest = { v: 1, base: '/_img', images: {} }
      try {
        if (existsSync(manifestPath)) {
          const parsed = JSON.parse(readFileSync(manifestPath, 'utf8'))
          // A truncated or half-written manifest is worse than none: it would
          // produce srcsets pointing at variants that were never finished.
          if (parsed && typeof parsed === 'object' && parsed.images) manifest = parsed
        }
      } catch {
        // Corrupt JSON degrades to empty, same as absent.
      }
      return `export default ${JSON.stringify(manifest)}`
    },
  }
}
