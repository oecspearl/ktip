import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
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
        if (!url.startsWith('/api/')) return next()

        const [pathname, query = ''] = url.split('?')
        // Keep the lookup inside api/ — no traversal out of the project
        const route = pathname.replace(/^\/api\//, '')
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

          const request = new Request(`http://localhost${pathname}${query ? `?${query}` : ''}`, {
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
  // Supabase URL and anon key server-side too, or they 503 under `npm run dev`
  for (const key of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']) {
    if (!process.env[key] && env[key]) process.env[key] = env[key]
  }

  return {
    plugins: [
      react(),
      edgeApiPlugin(openaiKey),
      VitePWA({
        registerType: 'autoUpdate',
        manifest: false, // Use public/manifest.json
        workbox: {
          maximumFileSizeToCacheInBytes: 3 * 1024 * 1024, // 3 MB
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
              handler: 'NetworkFirst',
              options: { cacheName: 'supabase-api', expiration: { maxEntries: 50, maxAgeSeconds: 300 } },
            },
          ],
        },
      }),
    ],
    resolve: {
      dedupe: ['react', 'react-dom', '@codemirror/state', '@codemirror/view', '@codemirror/language'],
    },
  }
})
