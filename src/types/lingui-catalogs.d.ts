/**
 * `lingui compile` writes plain .mjs files with no .d.ts beside them, and they
 * are gitignored (built by `npm run i18n:compile`, which both `dev` and `build`
 * run first). Without this declaration the dynamic imports in
 * src/i18n/LanguageProvider.tsx are implicit `any` under `strict`, and a fresh
 * clone fails `tsc -b` before it has ever compiled a catalog.
 */
declare module '*/messages.mjs' {
  import type { Messages } from '@lingui/core'
  export const messages: Messages
}
