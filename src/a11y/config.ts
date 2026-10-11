// Relative, not '@a11y-kit': vite.config.ts imports this file to build the
// first-paint script, and the config bundler does not apply app aliases.
import type { A11yKitConfig } from '../../a11y-kit/src/core/config'

/**
 * KTIP's accessibility-kit configuration. Plain data: vite.config.ts inlines
 * it into the first-paint script and the store reads it at runtime, so both
 * paint the same thing.
 */
export const A11Y_CONFIG: A11yKitConfig = {
  // The key the old text-size/brightness hook used, so its values migrate
  storageKey: 'ktip_a11y',
  prefix: 'a11y-',
  // index.css keys its motion blanket to html.reduce-motion (155)
  classes: { reduceMotion: 'reduce-motion' },
  fonts: [
    {
      id: 'atkinson',
      label: 'Atkinson Hyperlegible',
      // index.css's readable-font rules predate the kit
      className: 'readable',
      href: 'https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400;1,700&display=swap',
      preconnect: [{ href: 'https://fonts.googleapis.com' }, { href: 'https://fonts.gstatic.com', cors: true }],
    },
    {
      id: 'lexend',
      label: 'Lexend',
      // Styled in src/a11y/a11y.css by re-pointing the font tokens
      href: 'https://fonts.googleapis.com/css2?family=Lexend:wght@400;500;600;700&display=swap',
      preconnect: [{ href: 'https://fonts.googleapis.com' }, { href: 'https://fonts.gstatic.com', cors: true }],
    },
    {
      id: 'opendyslexic',
      label: 'OpenDyslexic',
      // Self-hosted (OFL): no third-party request for the readers who choose it
      href: '/fonts/opendyslexic/opendyslexic.css',
    },
  ],
  legacy: {
    // ktip_a11y used to hold { fontScale, brightness }; brightness was photo-only
    fields: { brightness: 'photoBrightness' },
    keys: [
      { key: 'ktip_readable', equals: 'true', set: { font: 'atkinson' } },
      { key: 'ktip_motion', equals: 'true', set: { reduceMotion: true } },
    ],
  },
}
