import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'node:fs'
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
 * Dev-only middleware that handles /api/ai-chat requests locally,
 * so `npm run dev` works without needing `vercel dev`.
 * In production (Vercel), the Edge Function at api/ai-chat.ts handles this.
 */
function apiProxyPlugin(apiKey: string | undefined): Plugin {
  return {
    name: 'api-proxy',
    configureServer(server) {
      if (apiKey) {
        console.log('[api-proxy] OPENAI_API_KEY loaded — /api/ai-chat is available')
      } else {
        console.warn('[api-proxy] WARNING: OPENAI_API_KEY not found — AI chat will return 503')
      }

      server.middlewares.use('/api/ai-chat', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }

        if (!apiKey) {
          res.statusCode = 503
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'OPENAI_API_KEY not set in .env' }))
          return
        }

        let body = ''
        for await (const chunk of req) body += chunk

        let parsed: any
        try {
          parsed = JSON.parse(body)
        } catch {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Invalid JSON body' }))
          return
        }

        if (!parsed.messages || !Array.isArray(parsed.messages) || parsed.messages.length === 0) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'messages array is required' }))
          return
        }

        const model = parsed.model === 'gpt-4o-mini' ? parsed.model : 'gpt-4o-mini'
        const temperature = typeof parsed.temperature === 'number' ? Math.min(Math.max(parsed.temperature, 0), 2) : 0.7
        const max_tokens = typeof parsed.max_tokens === 'number' ? Math.min(parsed.max_tokens, 4000) : 1000

        try {
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 30000)

          const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({ model, messages: parsed.messages, temperature, max_tokens }),
            signal: controller.signal,
          })

          clearTimeout(timeout)

          const data = await response.text()
          res.statusCode = response.status
          res.setHeader('Content-Type', 'application/json')
          res.end(data)
        } catch {
          res.statusCode = 502
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Failed to reach AI service' }))
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const openaiKey = getOpenAIKey(env)

  return {
    plugins: [
      react(),
      apiProxyPlugin(openaiKey),
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
