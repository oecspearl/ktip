# Faster without looking cheaper

## Context

The audience is Caribbean, much of it on capped mobile data over high-latency links.
Measured in this repo (`dist/` built 2026-08-02, `public/`):

| Cost | Measurement |
|---|---|
| Hero photography | **42 photos, 4.1 MB**, every one 1600–1920 px wide, no `srcset` — a 390 px phone downloads the full-width file |
| Per-page hero | [PageHero.tsx:73-80](../src/components/layout/PageHero.tsx#L73-L80) is `loading="eager" fetchPriority="high"` — 60–300 KB before content paints |
| Paint cost | `backdrop-blur` in 22 files; the expensive one is `backdrop-blur-2xl` **full-bleed over every hero** |
| Entry JS | 291 KB gzip (944 KB raw) |
| Fonts | Atkinson Hyperlegible fetched from Google on **every** load, though only `html.readable` uses it |
| Chatter | 30–60 s `refetchInterval` in venue hooks; react-query `refetchOnWindowFocus` at default `true` |

**The governing constraint, restated:** every page stays modern and clean at every
setting. A blank navy band where a photo used to be is not an acceptable outcome.
That rules out the strip-it approach and sets a different rule:

> **Substitute cheaper materials for the same design.** Never remove a design
> element and leave a hole. Photos get smaller, not deleted. Blur becomes a solid
> tinted surface, not transparency. Motion gets cheaper, not zero.

That principle reorders the work. Most of the speed is available with **no visual
change at all** — those go first. Lite mode is the extra step for the worst
connections, and it is a designed variant, not a degraded one.

---

## What already exists (reuse, do not rebuild)

- **`scripts/convert-images.mjs`** — sharp-based resize/re-encode of `public/` photos,
  already written, already has a `jobs` array to extend. sharp is already a devDependency.
- **`HERO_WASH` and `BENTO_GRADIENTS`** in [hero-images.ts](../src/lib/hero-images.ts#L160-L173) — brand gradients already
  used over the heroes. Lite mode's hero treatment is built from these, so it looks
  like the same design system rather than an absence.
- **The boot-applied preference pattern**: [useThemeMode.ts](../src/hooks/useThemeMode.ts) / [useReadableMode.ts](../src/hooks/useReadableMode.ts)
  — `<html>` class + localStorage + `CustomEvent`, applied pre-render by the inline
  script in [index.html](../index.html#L29-L36) so there is no flash.
- **The motion list**: three `@media (prefers-reduced-motion: reduce)` blocks in
  [index.css](../src/index.css#L1124-L1176) already name every animation class in the app.
- **FAB panel idiom**: `NumberStepper` rows in [FloatingActionButton.tsx](../src/components/ui/FloatingActionButton.tsx#L316-L360), `em`-sized
  inside a `w-[15em]` panel. The settings [Toggle.tsx](../src/components/ui/Toggle.tsx) is `rem`/`px` with a
  description block — too wide for that panel, so the FAB row is written in its idiom.
- A ratchet-test precedent for hand-typed CSS: `src/design/tokens.test.ts`.

---

## Stage 1 — invisible wins (zero visual change, every user)

Nothing here alters a single pixel. This is the answer to "faster without losing
quality", and it is most of the win.

**1a. Responsive hero images — the biggest single item.**
Extend [scripts/convert-images.mjs](../scripts/convert-images.mjs) to emit `-640` and `-1024` siblings for the 42
photos in `public/hero`, `public/pages`, `public/grants`. Add `heroSrcSet(src)` beside
`pageHeroFor` in [hero-images.ts](../src/lib/hero-images.ts), then `srcSet` + `sizes="100vw"` on the three
heroes ([PageHero](../src/components/layout/PageHero.tsx#L73-L80), [AuthBackdrop](../src/components/layout/AuthBackdrop.tsx),
[AuthSplitShell](../src/components/auth/AuthSplitShell.tsx#L180)). The browser then picks by viewport **and** device pixel
ratio — a DPR-2 phone takes the 1024, a laptop the 1600. Identical picture, ~150 KB → ~40 KB.
Extend `hero-images.test.ts` for the new helper.

**1b. Stop shipping a font nobody uses.** [index.html:19-22](../index.html#L19-L22) fetches the Atkinson
stylesheet unconditionally for a face only `html.readable` applies. Inject the `<link>`
from the boot script, gated on the class; drop the two now-dead `preconnect`s to
`fonts.googleapis` / `fonts.gstatic`. Removes a render-blocking stylesheet and two TLS
handshakes from nearly every visit.

**1c. Preconnect Supabase.** The session lookup fires immediately on boot, so its
handshake currently follows the bundle download instead of overlapping it. One `<link
rel="preconnect">` in [index.html](../index.html). Worth 100–200 ms on a high-latency link.

**1d. react-query defaults.** [App.tsx:30-37](../src/App.tsx#L30-L37) — `refetchOnWindowFocus: false`,
`staleTime` 30 s → 60 s. Every tab focus currently re-runs every mounted query.

**1e. Cache the photos properly.** [vercel.json](../vercel.json) gives images `max-age=604800` with no
revalidation hint — add `stale-while-revalidate=86400`. Plus a Workbox
`StaleWhileRevalidate` `runtimeCaching` entry for `/hero/`, `/pages/`, `/grants/` in
[vite.config.ts](../vite.config.ts) (`ktip-photos`, `maxEntries: 60`), so a return visit pays nothing for
hero photography. These are public static assets — none of the RLS/auth-cache
reasoning in that file's comments applies.

**Expected after Stage 1:** a phone's first page load drops by roughly 150–250 KB, a
second page navigation by more, with the site pixel-identical.

---

## Stage 2 — lite mode, as a designed variant

Same harness discipline as before: one FAB toggle, all rules in one namespaced file,
provably inert when off. What changes is what lite mode *does*.

### The four substitution rules

**Photos: smaller, never absent.** Lite pins the hero to the `-640` variant from
1a — ~15–25 KB instead of 150–300 KB, and every hero already carries a dark
gradient wash (`HERO_WASH`) plus a black/60 scrim over it for text contrast, which
is exactly the condition under which a softer source is invisible. The page still
looks photographic. Content images (avatars, project cards) keep their normal
`srcset` — they are information, not decoration.

**Blur: replaced by a solid tinted surface, and only where it's expensive.**
Paint cost scales with *area*, so a blanket `backdrop-filter: none` across all 22
files would trade real quality for almost no gain — and worse, leave text sitting on
transparency, which is what actually reads as broken. Lite targets the large-area
blurs only: the full-bleed `backdrop-blur-2xl` over every [PageHero](../src/components/layout/PageHero.tsx#L80), and the
four in [DiscoverPage](../src/pages/discover/DiscoverPage.tsx) (lines 307, 988, 1068, 1119). Each one gets an opaque
brand-token background in its place — same colour, same shape, no live blur. Small
chrome (navbar, chips, the FAB panel) keeps its blur: tiny area, negligible cost,
and it is a lot of the "modern" you are paying for.

**Motion: cheaper, not zero.** `opacity` and `color` transitions run on the
compositor and cost essentially nothing — those stay, so the UI still feels alive
and responsive. What goes: `transform` and `filter` animations, the staggered
route-reveal parade (`.stagger-children`, `.stagger-rows`, `.animate-reveal-up`),
infinite decorative loops (portal spin, `animate-pulse-soft`), and any duration
above ~150 ms. Skeleton pulses stay — they are an opacity animation, they cost
nothing, and a frozen skeleton looks like a bug.

**Everything free stays.** Shadows, radii, gradients, the type scale, dark mode,
spacing, icons. None of it costs measurable time, and all of it is what makes the
site look considered. Removing any of it was never the win.

### Files added (3)

**`src/hooks/useLiteMode.ts`** — the `useThemeMode` shape exactly: key `ktip_lite`,
event `ktip-lite-change`, initial state read from the `<html>` class. Also exports
`isLiteMode()`, a non-reactive read for module scope and event handlers.

**`src/styles/lite.css`** — every selector prefixed `html.lite`, so with the class
absent the file paints nothing. Shape:

```css
/* Motion: keep the cheap kind, drop the expensive kind. */
html.lite *, html.lite *::before, html.lite *::after {
  transition-property: opacity, color, background-color, border-color;
  transition-duration: 120ms;
}
html.lite .animate-reveal-up,
html.lite .stagger-children > *,
html.lite .stagger-rows > *,
html.lite .venue-portal-spin,
html.lite .animate-pulse-soft { animation: none; }   /* full list mirrors index.css:1124 */

/* Large-area blur → opaque surface of the same colour. Never left transparent. */
html.lite [data-lite-solid] {
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  background-color: var(--color-ktip-navy-900);      /* per-site token */
}
html.lite .photo-dimmable { filter: none; }
```

`data-lite-solid` is the seam: the five expensive blur sites get the attribute, and
the rule reaches exactly those and nothing else. No blanket `!important` sweep.

**`src/design/lite-mode.test.ts`** — reads `src/styles/lite.css` as text, asserts
every selector starts with `html.lite`, and asserts every animation class named in
the `prefers-reduced-motion` blocks of `index.css` is accounted for (either
suppressed or explicitly listed as intentionally kept). That is the invariant the
harness rests on: nothing leaks out of the namespace, and the two lists cannot
silently diverge.

### Files edited

1. **[index.css](../src/index.css#L10)** — one line: `@import "./styles/lite.css";`
2. **[index.html](../index.html#L29-L36)** — one line in the existing boot `<script>`, beside the
   `ktip_readable` / `ktip_theme` lines:
   ```js
   try { if (localStorage.getItem('ktip_lite') === 'on' || location.search.indexOf('lite=1') > -1) document.documentElement.classList.add('lite') } catch (e) {}
   ```
   `?lite=1` is for testing — DevTools cannot emulate Save-Data, and a URL flag lets
   you compare two tabs side by side without touching storage.
3. **[FloatingActionButton.tsx](../src/components/ui/FloatingActionButton.tsx#L316-L360)** — a `role="switch"` row under the two
   `NumberStepper`s, in the panel's `em` idiom, `Gauge` icon, label "Lite mode".
   With the toggle off this is the only visible change in the app: one row in a
   panel that is closed by default.
4. **[PageHero.tsx](../src/components/layout/PageHero.tsx)** — `data-lite-solid` on the blur overlay, and the `-640`
   source pinned when `isLiteMode()`.
5. **[DiscoverPage.tsx](../src/pages/discover/DiscoverPage.tsx)** — `data-lite-solid` on the four large blurs; extend its
   existing local `useReducedMotion` ([line 81](../src/pages/discover/DiscoverPage.tsx#L81)) to OR in lite, which makes the
   branches already written at lines 528/669/1060 apply, and stop the 6 s hero
   rotation ([line 412](../src/pages/discover/DiscoverPage.tsx#L412)) — it stays on the first slide rather than
   fetching five more photos.

Revert cost: delete 3 files, remove the import and the boot line, drop the
attributes.

---

## Verification

**Automated**
- `npm test` green, including the new namespace/parity test and the extended
  `hero-images.test.ts`.
- `npm run build` — `tsc -b` passes.

**Stage 1 changed no pixels — prove it**
- Same page, same viewport, before vs after: the rendered hero must be
  indistinguishable. Confirm in the Network panel that the *chosen* `srcset`
  candidate is the 1024 on a DPR-2 phone and the 1600 on a desktop — a too-small
  pick is the one way 1a can cost quality, and it shows up as a soft hero.
- Lighthouse mobile on `/`, `/projects`, `/events` (Network *Slow 4G*, CPU 4×):
  record LCP, TBT, total transfer before and after.

**Stage 2 looks intentional — prove that too**
- `?lite=1` on `/`, `/projects`, `/events`, `/dashboard`, `/login`: every page still
  reads as designed. Specifically check no text sits on a transparent panel where a
  blur used to be, and that hero bands still carry a photo.
- Toggle off, walk the same pages: identical to today.
- Performance panel, CPU 4× throttle, scroll Discover: the `backdrop-blur-2xl` paint
  spike gone, frame times down. That number is what justifies the stage.
- Reload with lite on: no flash of the animated version during boot.
- Must not break: send a message (realtime still live), open a dropdown and the
  messaging panel — they open fast rather than easing, and nothing stays stuck
  mounted. [useDisclosureAnimation.ts:69](../src/components/ui/useDisclosureAnimation.ts#L69) unmounts on a JS timer, not on animation
  end, so suppressing the CSS animation is safe — confirm it on screen.

---

## Stage 3 — later, each independently shippable

- **Per-component lite gating**: seven call sites already branch on
  `prefers-reduced-motion` ([FireworksOverlay](../src/components/achievements/FireworksOverlay.tsx#L31), [SpyRail](../src/components/ui/SpyRail.tsx#L97),
  [useAnimatedValue](../src/components/venue/map/useAnimatedValue.ts#L21), [useDisclosureAnimation](../src/components/ui/useDisclosureAnimation.ts#L69),
  [AuthSplitShell](../src/components/auth/AuthSplitShell.tsx#L61), [FloatingActionButton](../src/components/ui/FloatingActionButton.tsx#L295),
  [DiscoverPage](../src/pages/discover/DiscoverPage.tsx#L81)) — one `|| isLiteMode()` each. Plus [FlipWatermark](../src/components/ui/FlipWatermark.tsx) and
  [StatsWheel](../src/components/reusable-components/StatsWheel.tsx) rendering their final value instead of counting to it.
- **Background chatter in lite**: `refetchInterval` 60 s → 300 s in [useVenue.ts](../src/hooks/useVenue.ts#L65),
  presence heartbeat 30 s → 120 s in [useVenuePresence.ts](../src/hooks/useVenuePresence.ts#L122). Leave
  [useMessages.ts](../src/hooks/useMessages.ts) and [useNotifications.ts](../src/hooks/useNotifications.ts) realtime alone — that is the product.
- **Settings card + auto-detect**: a "Data saver" card in [PreferencesTab.tsx](../src/pages/settings/PreferencesTab.tsx#L283-L325), and
  only then a `navigator.connection` / `saveData` default with a one-time toast
  explaining itself. Auto-detect goes last on purpose — it is the only change that
  alters what someone who never touched a toggle sees.
- **Sentry off the critical path — measure first.** `@sentry/react` plus router
  tracing sits in the 291 KB gzip entry chunk; only three files touch it
  ([index.tsx](../src/index.tsx), [App.tsx](../src/App.tsx#L28), [monitoring.ts](../src/lib/monitoring.ts#L118)). Run `ANALYZE=1 npm run build`
  and read `dist/stats.html` — under ~40 KB gzip, skip it. If worth it,
  `lib/monitoring` becomes a shim that buffers and `await import`s from
  `requestIdleCallback`. Cost: `Sentry.wrapCreateBrowserRouter` at [App.tsx:28](../src/App.tsx#L28)
  has to go, so transactions get named by URL instead of route pattern — exactly
  what that line exists to prevent. Worth a conversation, not a silent change.
