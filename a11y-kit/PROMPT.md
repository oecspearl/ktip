# Prompt: add a11y-kit to an app

> Paste everything below the line into your AI coding assistant, fill in
> section 0, and work through it in order. Each phase ships on its own. The
> rules in section 2 come from bugs this kit has already had, so keep them.

---

I want to add the accessibility kit in `a11y-kit/` to my app. Read
`a11y-kit/README.md` first, and `a11y-kit/examples/minimal-app.tsx`. Do not
rewrite the kit: wire it in through its adapters, and put everything specific
to my app in one folder of my own (call it `src/a11y/`).

## 0. My app (fill in before running)

- **Framework and bundler:** `<e.g. React 19 + Vite / Next.js>`
- **Router:** `<e.g. React Router 7 / TanStack Router / none>`
- **Translations:** `<e.g. Lingui / react-i18next / English only>`
- **Where a signed-in user's settings can be saved:** `<e.g. a JSONB column on the profiles table / a user_settings API / nowhere>`
- **Theme:** `<e.g. a "dark" class on <html> / none>`
- **Main pages, in menu order:** `<e.g. Home /, Search /search, Account /account>`
- **Things that already own the keyboard or the microphone:** `<e.g. a product tour, live captions, none>`

## 1. Phases

1. **Store and first paint.** A config file of plain data, `createA11yStore`
   from it, and the Vite plugin from the same config. If I already keep a
   text-size or dark-mode preference, migrate it with `legacy` in the config,
   and make my old hooks thin views over the store so their callers do not
   change. Import `modes.css` after my global CSS.
2. **Provider.** Wrap the app in `<A11yProvider>`, around the router rather
   than inside a layout, so sign-in pages get it too. Pass `theme` and
   `navigation` adapters. If the provider sits outside the router, bridge the
   router in with a component mounted at the router's root (see KTIP's
   `src/a11y/navigation.ts`).
3. **Sync.** If I have somewhere to save settings, write a `SyncAdapter`. It
   reports `remote` as `undefined` while the user's record is loading, `null`
   when there is none, and the blob otherwise.
4. **Panel.** Lazy-load `AccessibilityPanel` from `a11y-kit/ui`, open it from
   a visible button on every page, and answer `onRequest('panel')`. Put
   `AccessibilityControls variant="settings"` on my settings page.
5. **High contrast.** Re-point my colour tokens under `html.a11y-contrast-more`,
   light and dark, the way a dark theme does. Text at 7:1, hairlines at 3:1.
6. **Translations.** Pass every key of `DEFAULT_MESSAGES` through my i18n
   library. Values with a placeholder are functions. Type the messages object
   against `A11yMessages` so a new kit string fails my build until translated.
7. **Routes, shortcuts and voice.** Pass my main pages as `routes`, with digits
   1 to 9 in menu order and spoken synonyms. Give my nav element an id and pass
   it in `targets`. Pass `onSearch` if I have search.
8. **Setup.** Decide when setup may open by itself (`setup.ready`: signed in,
   any onboarding finished, no other first-visit dialog on screen) and on which
   page (`entryPaths`: where sign-in lands, with no tour of its own). Write the
   tour stops for my pages, each with one thing to try.
9. **Tell people.** Add an accessibility statement page that states a target,
   not a conformance claim, and lists what is still hard to use.

## 2. Rules

- **One painter.** Never write a second copy of the first-paint logic in
  `index.html`. The plugin inlines `paint.js` from the same config the store
  reads, so the first frame and the settled page cannot disagree.
- **Health data stays on the device.** The setup answers never go into the
  synced blob, a log or an analytics event. `onEvent` carries the outcome only.
- **Voice consent is per device.** Never start the microphone because a synced
  setting says voice is on.
- **One microphone.** If my app records speech anywhere else, that code takes
  `acquireMic(owner, priority)` first, or the two will silently cancel each
  other.
- **Do not lie in a preset.** If a need has nothing to switch on in my app,
  give it an empty preset and a hint that says so.
- **Tests run inside `act`.** Setup opens from a timer and arrives as a lazy
  chunk. Never call `findBy*` inside an outer `act`: nothing will flush.
- **Measure, then claim.** Do not write "fully accessible" or "WCAG compliant"
  anywhere until an audit says so.

## 3. Done means

- Reloading with every setting on shows no flash of the default look.
- Keyboard only: every control in the panel, the reading bar and the setup is
  reachable, nothing traps focus, Escape closes what it should.
- A screen reader announces the setup stage, reading progress and text-size
  changes.
- Signing in on a second device brings the settings and does not offer setup
  again.
- The kit's own tests pass: `npx vitest run -c a11y-kit/vitest.config.ts`.
