/**
 * KTIP's settings block for the hosted accessibility service. vite.config.ts
 * writes it into index.html as <script type="application/json"
 * id="viridion-a11y">, where the service's first-paint script reads it before
 * any of our code has loaded. Plain data, no imports: the Vite config bundles
 * this file too.
 */
export const A11Y_CONFIG = {
  // The key the old text-size/brightness hook used, so its values carried over
  storageKey: 'ktip_a11y',
  prefix: 'a11y-',
  // index.css keys its motion blanket to html.reduce-motion (155)
  classes: { reduceMotion: 'reduce-motion' },
  fonts: [
    {
      id: 'atkinson',
      label: 'Atkinson Hyperlegible',
      family: "'Atkinson Hyperlegible', system-ui, sans-serif",
      // index.css's readable-font rules predate the service
      className: 'readable',
      href: 'https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400;1,700&display=swap',
      preconnect: [{ href: 'https://fonts.googleapis.com' }, { href: 'https://fonts.gstatic.com', cors: true }],
    },
    {
      id: 'lexend',
      label: 'Lexend',
      family: "'Lexend', system-ui, sans-serif",
      href: 'https://fonts.googleapis.com/css2?family=Lexend:wght@400;500;600;700&display=swap',
      preconnect: [{ href: 'https://fonts.googleapis.com' }, { href: 'https://fonts.gstatic.com', cors: true }],
    },
    {
      id: 'opendyslexic',
      label: 'OpenDyslexic',
      family: "'OpenDyslexic', sans-serif",
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
  // KTIP recolours itself for higher contrast (src/a11y/a11y.css)
  contrastPalette: true,
  // The FAB carries the Accessibility button; A11yQuickButton covers pages without it
  floatingButton: false,
}
