# a11y-kit

Accessibility settings, a page reader, keyboard shortcuts, voice commands and a
guided first-run setup for a React app. Built for KTIP, which uses it in
production from `src/a11y/`. Nothing in the kit imports KTIP: the app talks to
it through a few small adapters.

```
a11y-kit/
  src/
    index.ts               store, hooks, provider, skip links (small; load eagerly)
    ui.ts                  the panel and controls (load lazily)
    core/                  framework-free logic: settings, painting, sync,
                           shortcuts, speech, reader, voice grammar, setup
    react/                 provider, runtime, reader bar, voice, setup flow
    css/modes.css          what each display setting does to the page
    css/ui.css             the kit's own panel, dialogs and bars
    vite/prepaint-plugin.ts  first-paint script for index.html
    __tests__/
  examples/minimal-app.tsx
  PROMPT.md                a build prompt for wiring this into another app
```

Peer dependencies: `react` and `react-dom` 18 or later. Vite is optional and only
needed for the first-paint plugin. No router, i18n library, CSS framework or
backend is required.

## What it gives your users

Text size runs from 90% to 150%. Spacing opens up to the WCAG 1.4.12 values, and
you can offer any reading fonts you like. Links can be underlined and headings
highlighted.

Contrast can go higher, or follow the OS. The page can be dimmed or brightened
and its colours softened, photos on their own too, and a theme switch appears
if you pass one.

For pointer and keyboard users: 44px targets, a large cursor, a two-colour
focus ring, Alt+Shift shortcuts, skip links, and focus moved to the page title
after navigation.

A reading bar reads the main content aloud paragraph by paragraph, in the
page's language, with click-to-read and read-selection. Voice commands work in
English, French and Spanish, push-to-talk or always on, wherever the browser
has speech recognition.

And a first-run setup asks what would help, applies a matching preset live,
tours your real pages, then lets the person keep it, adjust it or undo it.

## Quick start

```ts
// a11y-config.ts — plain data, imported by the app AND vite.config.ts
import type { A11yKitConfig } from './a11y-kit/src/core/config'

export const A11Y_CONFIG: A11yKitConfig = {
  storageKey: 'myapp_a11y',
  fonts: [
    {
      id: 'atkinson',
      label: 'Atkinson Hyperlegible',
      family: "'Atkinson Hyperlegible', system-ui, sans-serif",
      href: 'https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&display=swap',
    },
  ],
}
```

```ts
// vite.config.ts
import { a11yPrepaint } from './a11y-kit/src/vite/prepaint-plugin'
import { A11Y_CONFIG } from './src/a11y-config'

export default defineConfig({ plugins: [react(), a11yPrepaint(A11Y_CONFIG)] })
```

```tsx
// app entry
import 'a11y-kit/css/modes.css' // after your own global CSS
import 'a11y-kit/css/ui.css'
import { A11yProvider, createA11yStore } from 'a11y-kit'

const store = createA11yStore(A11Y_CONFIG)

root.render(
  <A11yProvider store={store}>
    <App />
  </A11yProvider>
)
```

Then put the panel somewhere: `import { AccessibilityPanel } from 'a11y-kit/ui'`,
lazily, and open it when the kit asks (`onRequest('panel', open)`), which is what
Alt+Shift+A and the skip link do. `examples/minimal-app.tsx` is a working version
of all of this.

The path alias is up to you. KTIP maps `@a11y-kit` to `a11y-kit/src` in
`vite.config.ts`, `vitest.config.ts` and `tsconfig.json`.

## Adapters

Everything app-specific comes in through `<A11yProvider>` props. Leave any of
them out and that feature falls back or switches off.

| Prop | What it is | Without it |
|---|---|---|
| `sync` | `{ identity, remote, write }`: the signed-in user's id, their saved blob, and a function to save one | Settings stay on the device |
| `theme` | `{ get, set, subscribe }` over your light/dark switch | No theme control, presets leave the theme alone |
| `navigation` | `{ navigate(path), location: { get, subscribe } }` over your router | Shortcuts and voice navigate with full page loads |
| `messages` | Translations of `DEFAULT_MESSAGES`; values with a placeholder are functions | English |
| `routes` | Pages for Alt+Shift+1–9, `g` sequences and voice, with labels and spoken synonyms | No page shortcuts |
| `targets` | Selectors for `main` and `nav` | `main` and `nav` elements |
| `onSearch` | Opens your search, optionally with a spoken query | No search shortcut or command |
| `setup`, `journey`, `needs` | When setup may open by itself, the tour stops, the need presets | Setup only from "Run setup again" |
| `isBlocked` | True while something else owns the plain keys (your own page tour) | Single-key shortcuts always on |
| `voiceRestricted` | True while always-on listening is unsafe, such as in a live call | Always-on allowed everywhere |
| `onEvent` | Setup outcomes, for counting | No events |
| `chords`, `features` | Remap shortcuts; switch whole features off | Defaults |

Single-page routers do not scroll to a link's `#fragment`, so the kit does: after
each route change, and on first load, it waits for the target to render and
scrolls to it, moving focus too when focus-on-navigate is on. Turn it off with
`features: { hashLanding: false }`.

`src/a11y/` in KTIP is a full reference: Supabase sync over a JSONB column
(`sync.ts`, `display-prefs.ts`), Lingui messages (`messages.ts`), a React Router
bridge mounted outside the provider (`navigation.ts`), translated routes, the
setup gate and tour (`setup.ts`).

### Sync

The kit stores one versioned blob and decides each sign-in by `updatedAt`: the
newer side wins. Settings changed while signed out belong to the next person
who signs in, but settings changed under a *different* account are never pushed
into someone else's: the device adopts the newcomer's saved settings instead.
Writes are coalesced, fire-and-forget and retried on the next change. During a
setup trial they are held, so a half-tried preset never reaches other devices.

## Styling

Every display mode is a class or attribute on `<html>`, defaulting to the
`a11y-` prefix, and `modes.css` styles them. Its rules are unlayered on
purpose, so they win over Tailwind utilities without a specificity fight.

High contrast has a generic part in `modes.css`, but colours are yours: re-point
your own tokens under `html.a11y-contrast-more` the way a dark theme does.
KTIP's `src/a11y/a11y.css` is the worked example.

The kit's own UI reads `--ak-surface`, `--ak-surface-2`, `--ak-text`,
`--ak-muted`, `--ak-border`, `--ak-accent`, `--ak-accent-text`, `--ak-focus`,
`--ak-radius` and `--ak-shadow`. Set them on `:root`. Every element also has an
`ak-` class.

Dense views (calendars, charts, maps) can opt out of larger targets with
`data-a11y-compact`. The reader skips `[data-read-skip]` and reads anything
marked `[data-read-block]`.

## Privacy

- The answers to "what would help you?" are health information. They stay in
  the device's own storage, only to pre-fill a later run, and never reach
  `sync` or `onEvent`.
- Voice consent is per device, because it names the browser vendor that
  processes the audio. A synced "voice on" never starts a microphone on a
  device that has not agreed.
- `onEvent` sends the setup outcome and the number of tour stops seen. Gate it
  behind your own analytics consent.

## Browser support

The settings and shortcuts work everywhere modern. Reading aloud needs
`speechSynthesis` (all current browsers) and a voice for the page's language,
and says so when there is none. Voice commands need `SpeechRecognition`:
Chrome, Edge and Safari, not Firefox. Always-on listening is off on iOS, which
drops long sessions. Chrome sends speech to Google, Edge to Microsoft, Safari
to Apple; the consent dialog says so.

Only one speech-recognition session can run per page. If your app records
speech too, take the mic first with `acquireMic('captions', 10)` and voice
commands will step aside and say why.

## Voice phrases

`core/voice/phrases.ts` holds the phrasings per language. They are parser data,
not interface copy, so they do not go through your translation catalog. Add a
language by adding a table. The French and Spanish tables need a native
speaker's review before anyone relies on them.

## Tests

```bash
npx vitest run -c a11y-kit/vitest.config.ts
npx tsc -p a11y-kit/tsconfig.json --noEmit
```

Inside KTIP both also run as part of `npx vitest run` and `npx tsc -b`.
