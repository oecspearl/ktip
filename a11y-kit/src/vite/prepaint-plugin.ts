import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { resolveConfig, type A11yKitConfig } from '../core/config'

/**
 * The first-paint script: paint.js's own text, plus a call with the resolved
 * config. Read from disk rather than imported so no bundler ever rewrites the
 * copy that ends up inline (helpers like esbuild's __name would not exist in
 * <head>).
 */
export function buildPrepaintScript(config: A11yKitConfig, paintSource: string = readPaintSource()): string {
  const source = paintSource
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/^export /gm, '')
    // Indentation is safe to drop: paint.js has no template literals
    .replace(/^[ \t]+/gm, '')
    .replace(/\n\s*\n/g, '\n')
  const cfg = JSON.stringify(resolveConfig(config))
  return `(function(){${source}
try{var c=${cfg};paint(readStored(window.localStorage,c).settings,c,document.documentElement,window)}catch(e){}})()`
}

function readPaintSource(): string {
  return readFileSync(fileURLToPath(new URL('../core/paint.js', import.meta.url)), 'utf8')
}

/**
 * Inlines the first-paint script into index.html, so text size, contrast and
 * fonts are right on the first frame instead of snapping in after the bundle
 * loads. Pass the same config the app gives createA11yStore.
 */
export function a11yPrepaint(config: A11yKitConfig): Plugin {
  return {
    name: 'a11y-kit-prepaint',
    transformIndexHtml() {
      return [{ tag: 'script', children: buildPrepaintScript(config), injectTo: 'head' }]
    },
  }
}
