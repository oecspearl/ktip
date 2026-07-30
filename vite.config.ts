import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import { visualizer } from 'rollup-plugin-visualizer'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'

/**
 * Read OPENAI_API_KEY directly from .env file as a fallback,
 * since loadEnv may not always surface non-VITE_ prefixed vars.
 */
function getOpenAIKey(envFromVite: Record<string, string>): string | undefined {
  // Try loadEnv result first
  if (envFromVite.OPENAI_API_KEY) return envFromVite.OPENAI_API_KEY

  // Try process.env (set by vercel dev or other tooling)
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY

  // Fallback: read .env file directly
  try {
    const envFile = readFileSync(resolve(process.cwd(), '.env'), 'utf-8')
    const match = envFile.match(/^OPENAI_API_KEY=(.+)$/m)
    return match?.[1]?.trim()
  } catch {
    return undefined
  }
}

/**
 * Non-/api paths that vercel.json rewrites to an Edge Function, mirrored here
 * so `npm run dev` routes them the same way.
 *
 * These exist because the OECS Virtual Campus was given
 * `https://oecsinnovation.org/auth/vc/callback` as the redirect URI — a path
 * with no /api prefix, registered on their side, so it cannot be moved. In
 * production the rewrite in vercel.json catches it before the SPA catch-all.
 * Without the same mapping here, the dev server would hand those URLs to
 * index.html and the flow could only ever be tested against a deploy.
 *
 * Keep this table and vercel.json's `rewrites` in step.
 */
const DEV_REWRITES: Record<string, string> = {
  '/auth/vc/callback': 'auth/vc/callback',
  '/auth/vc/start': 'auth/vc/start',
}

/**
 * Dev-only middleware that runs the real Edge Functions in `api/` (ai-chat,
 * ai-search, …) so `npm run dev` behaves like production without needing
 * `vercel dev`. Each request is turned into a web `Request`, handed to the
 * route's default export, and its `Response` piped back out — so there is one
 * implementation of every endpoint, not a dev copy that can drift.
 */
function edgeApiPlugin(apiKey: string | undefined): Plugin {
  return {
    name: 'edge-api-dev',
    apply: 'serve',
    configureServer(server) {
      if (apiKey) {
        console.log('[edge-api-dev] OPENAI_API_KEY loaded — /api/ai-chat and /api/ai-search are live')
      } else {
        console.warn('[edge-api-dev] WARNING: OPENAI_API_KEY not found — AI endpoints will return 503')
      }

      server.middlewares.use(async (req, res, next) => {
        const url = req.url || ''
        const [pathname, query = ''] = url.split('?')

        // Keep the lookup inside api/ — no traversal out of the project
        const route = pathname.startsWith('/api/')
          ? pathname.replace(/^\/api\//, '')
          : DEV_REWRITES[pathname]

        if (!route) return next()
        if (!/^[a-z0-9/_-]+$/i.test(route) || route.includes('..')) return next()

        const modulePath = resolve(process.cwd(), 'api', `${route}.ts`)
        if (!existsSync(modulePath)) return next()

        try {
          const mod = await server.ssrLoadModule(modulePath)
          const handler = mod.default
          if (typeof handler !== 'function') return next()

          const headers = new Headers()
          for (const [key, value] of Object.entries(req.headers)) {
            if (typeof value === 'string') headers.set(key, value)
            else if (Array.isArray(value)) headers.set(key, value.join(', '))
          }

          let body: string | undefined
          if (req.method && !['GET', 'HEAD'].includes(req.method)) {
            const chunks: Buffer[] = []
            for await (const chunk of req) chunks.push(chunk as Buffer)
            body = Buffer.concat(chunks).toString('utf8')
          }

          // Build the URL from the Host header rather than a fixed
          // "http://localhost". A handler that derives redirects from
          // request.url — as the Virtual Campus routes do — would otherwise
          // send the browser to a portless origin and break the loopback.
          const host = req.headers.host || 'localhost'
          const request = new Request(`http://${host}${pathname}${query ? `?${query}` : ''}`, {
            method: req.method || 'GET',
            headers,
            body,
          })

          const response: Response = await handler(request)
          res.statusCode = response.status
          response.headers.forEach((value, key) => res.setHeader(key, value))
          res.end(Buffer.from(await response.arrayBuffer()))
        } catch (err) {
          console.error(`[edge-api-dev] ${pathname} failed:`, err)
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Dev API handler threw', detail: String(err).slice(0, 300) }))
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const openaiKey = getOpenAIKey(env)
  // The api/ handlers read process.env, exactly as they do on Vercel
  if (openaiKey) process.env.OPENAI_API_KEY = openaiKey
  // Endpoints that verify the caller's JWT (e.g. /api/extract-fields) need the
  // Supabase URL and anon key server-side too, or they 503 under `npm run dev`.
  // The service-role key is needed by every privileged handler — api/admin/*,
  // api/auth/*, api/partner/* — and lives in .env, but loadEnv() does not put
  // it on process.env by itself.
  // The Virtual Campus SSO routes need theirs for the same reason.
  for (const key of [
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY',
    'VITE_SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_SECRET_KEY',
    // Deprecated; still promoted so an un-migrated local .env keeps working.
    'SUPABASE_SERVICE_ROLE_KEY',
    'VC_ISSUER',
    'VC_JWKS_URL',
    'VC_CLIENT_ID',
    'VC_CLIENT_SECRET',
    'VC_AUTHORIZE_URL',
    'VC_TOKEN_URL',
    'VC_USERINFO_URL',
    'COMMONS_BASE_URLS',
    'COMMONS_API_KEY',
    'KTIP_CATALOG_BASE_URL',
    'MYPD_KTIP_API_KEY',
    // /api/admin/sentry reads these; without them it answers 501 and the
    // dashboard shows setup instructions instead of issues.
    'SENTRY_AUTH_TOKEN',
    'SENTRY_ORG',
    'SENTRY_PROJECT',
    'SENTRY_API_BASE_URL',
    'SENTRY_DSN',
    'SENTRY_ENVIRONMENT',
    // Outbound email. Without these, /api/invite/send answers 503 and the
    // alias flows fall back to logging a dev link instead of mailing one.
    'RESEND_API_KEY',
    'EMAIL_FROM',
    // Deprecated alias of EMAIL_FROM; still promoted for un-migrated .env files.
    'INVITE_FROM_EMAIL',
    // The origin baked into links inside those emails.
    'SITE_URL',
  ]) {
    if (!process.env[key] && env[key]) process.env[key] = env[key]
  }

  // Stamped into the bundle so a browser error can be tied to the exact commit
  // that produced it, and matched against the uploaded source maps.
  const sentryRelease = env.VITE_SENTRY_RELEASE || env.VERCEL_GIT_COMMIT_SHA || ''
  // Source maps are only emitted when they can actually be uploaded and then
  // deleted; shipping them publicly would hand out the unminified source.
  const uploadSentrySourceMaps = Boolean(
    env.SENTRY_AUTH_TOKEN && env.SENTRY_ORG && env.SENTRY_PROJECT && sentryRelease
  )

  return {
    define: {
      'import.meta.env.VITE_SENTRY_RELEASE': JSON.stringify(sentryRelease),
    },
    build: {
      sourcemap: uploadSentrySourceMaps ? ('hidden' as const) : false,
    },
    plugins: [
      react(),
      edgeApiPlugin(openaiKey),
      // ANALYZE=1 npm run build -> dist/stats.html treemap of the bundle.
      Boolean(process.env.ANALYZE) &&
        visualizer({ filename: 'dist/stats.html', gzipSize: true, brotliSize: false }),
      uploadSentrySourceMaps &&
        sentryVitePlugin({
          authToken: env.SENTRY_AUTH_TOKEN,
          org: env.SENTRY_ORG,
          project: env.SENTRY_PROJECT,
          release: { name: sentryRelease },
          sourcemaps: { filesToDeleteAfterUpload: ['dist/**/*.map'] },
          telemetry: false,
        }),
      VitePWA({
        registerType: 'autoUpdate',
        manifest: false, // Use public/manifest.json
        workbox: {
          maximumFileSizeToCacheInBytes: 2 * 1024 * 1024, // 2 MB
          // png deliberately absent: photos/logos are served as webp over the
          // network with HTTP caching; only the two PWA icons are precached.
          globPatterns: ['**/*.{js,css,html,ico,svg,woff2}', 'pwa-192x192.png', 'pwa-512x512.png'],
          // Any .html sitting in public/ gets precached by the pattern above,
          // and Workbox's precache route defaults to cleanURLs: true — so a
          // file at public/auth/callback.html silently answers /auth/callback
          // and the SPA route of that name never runs. index.html is the only
          // HTML this app should ever serve; keep stray pages out of the
          // manifest so that shadowing cannot come back.
          globIgnores: ['**/node_modules/**/*', '**/auth/**'],
          // vercel.json rewrites /auth/vc/* to Edge Functions rather than to
          // the SPA. Those are reached by a top-level navigation, so the
          // navigation fallback would answer them with index.html and the
          // Virtual Campus handoff would never touch the server.
          //
          // /auth/ is denied wholesale rather than just /auth/vc/, because the
          // OAuth return from Google is this app's only routine top-level
          // navigation — every other route change is client-side and issues no
          // navigation request at all. That makes /auth/callback the one URL
          // the navigation fallback can answer out of a precache belonging to
          // an older build, handing back an index.html whose hashed chunks
          // cleanupOutdatedCaches has already deleted. The sign-in then
          // dead-ends on a blank page or a stuck spinner. Going to the network
          // here costs one request and guarantees the current build.
          navigateFallbackDenylist: [/^\/api\//, /^\/auth\//],
          runtimeCaching: [
            {
              // Public storage objects only.
              //
              // The previous entry matched every *.supabase.co URL, which put
              // /auth/v1/user and /rest/v1/* responses into a cache keyed by
              // URL alone — Authorization is not part of a Cache Storage key
              // and these responses carry no Vary — so after an account switch
              // one slow request could serve the previous user's rows. Nothing
              // RLS-scoped belongs in a worker cache; only objects that are
              // public by definition do.
              urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/v1\/object\/public\/.*/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'supabase-storage',
                expiration: { maxEntries: 100, maxAgeSeconds: 86400 },
              },
            },
          ],
        },
      }),
    ],
    resolve: {
      // Kept in step with tsconfig.app.json "paths" and vitest.config.ts.
      alias: {
        // process.cwd(), not __dirname: this config is ESM, where __dirname is
        // undefined. Matches how loadEnv and the api/ loader above resolve.
        '@': resolve(process.cwd(), 'src'),
      },
      dedupe: ['react', 'react-dom', '@codemirror/state', '@codemirror/view', '@codemirror/language'],
    },
  }
})
