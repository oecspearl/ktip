# Design tokens — what landed, and what is left

The app used to size everything with hand-typed Tailwind classes. There were 42
distinct type sizes across four unit systems, 19 z-index values, six page
containers copied by hand, and — the finding that explains the whole effort —
**377 responsive prefixes across 368 files**, of which `xl:` appeared 7 times
and `2xl:` never. Nothing asked a wide screen for anything different, so a
2560×1600 desktop rendered byte-identical to a 1280px laptop, just with more
empty space around it.

Phases 0–6 and 12 are done. Phases 7–11 are not. This file is the handover.

---

## The system, in one page

Three multipliers, declared in `@layer base` in `src/index.css` beside the
existing `--nav-h` precedent. One factor per group, so proportions inside a
group cannot drift apart:

| Ramp | Governs | phone | 768 | **1440** | 1920 | **2560** |
|---|---|---|---|---|---|---|
| `--scale-display` | hero type, hero bands | 0.64 | 0.76 | **1.00** | 1.14 | **1.24** |
| `--scale-layout` | padding, boxes, controls, icons, section titles | 0.88 | 0.92 | **1.00** | 1.09 | **1.14** |
| `--scale-text` | reading type only | 1.00 | 1.00 | **1.00** | 1.08 | **1.125** |

Nine stepped media queries — 640 / 768 / 1024 / 1280 / **1440** / 1680 / 1920 /
2560 — not per-property `clamp()`. Clamp gives every property its own
interpolation curve, so ratios drift and the layout stops looking authored; the
same argument was already written in `src/hooks/useViewportScale.ts`.

**The ramps normalise at 1440, not at the 2560 design target.** That is what
lets `--text-micro: 0.8125rem` read as a literal 13px instead of `0.9125rem`,
and it gave the token phases a zero-pixel-diff checkpoint to prove they changed
nothing.

Everything is `rem` via `calc()`, so `useAccessibilityPrefs` (which scales the
root font-size 0.9×–1.4×) still composes.

### The one line that did most of the work

Tailwind v4 compiles every bare-numeric spacing utility to
`calc(var(--spacing) * N)`. Redefining the unit rescaled all 519 `px-4`, every
`p-*`, `gap-*`, and numeric `w-`/`h-`/`m-`/`inset-*` across 368 components with
no file edits:

```css
:root { --spacing: calc(0.25rem * var(--scale-layout)); }
```

### Reading the sizes

`/design` (dev only) renders the real app in nine iframes at true CSS widths and
**measures** the result out of them with probe elements — it does not restate
the numbers from the stylesheet, so a token that failed to generate shows a
wrong number rather than a table that agrees with itself. It also reports page
overflow and whether the navbar fits, per width.

---

## Done

| Phase | What |
|---|---|
| 0 | jest-dom setup (installed for ages, never imported — `toBeInTheDocument` did not exist); `src/design/tokens.test.ts` ratchet |
| 1 | The three ramps, the `--spacing` override, `extendTailwindMerge` in `src/lib/utils.ts` |
| 2 | 12 type steps, 24 spacing, 3 semantic radii, 5 containers, 13 z-index |
| 3 | 12 shared primitives onto tokens; deleted five dead `@layer components` rules |
| 4 | Page-container codemod (62 sites, 36 files); `/design` harness |
| 5 | Every arbitrary z-index removed; floating-dock collisions |
| 6 | `100vh` → `100svh`; corrected a wrong ratchet |
| 12 | Ratchets set to true floors; `useViewportScale` scoped to its two real consumers |

Plus, on request: navbar fit at 1024–1280, navbar left-alignment, phone/tablet
navbar parity, and the Discover hero right-aligned at every width.

### Things found along the way that were not on the plan

- **Four pages were rendering at the wrong width.** `FAQPage`, both grievance
  pages and `DirectoryPage` each had two `max-w` utilities in one raw class
  string. Tailwind emits arbitrary values *after* named ones, so
  `max-w-[calc(50vw+48rem)]` beat the `max-w-3xl` sitting next to it and the
  narrow reading width the author asked for was dead code. The dead class was
  removed rather than the wide one, to keep the phase visually neutral — **so
  those four pages are still wide, and probably should not be.**
- **`cn()` did not know the new tokens.** `twMerge` classifies `text-body` as a
  text *colour*, so `cn('text-sm', 'text-body')` emitted both and CSS source
  order picked the winner. Verified against plain `twMerge`: all six test cases
  kept both classes. Every `className` override in the app depended on this.
- **Test fixtures were shipping in the production CSS.** Tailwind scans test
  files, so a `cn('p-6 p-card-pad')` assertion put `.p-card-pad` in the bundle.
  Fixed with `@source not`.
- **The FAB was invisible below 1024** — the analytics consent banner is
  effectively full width there and sat on top of it.
- **`UATFeedbackButton` and `FeedbackButton` are mounted nowhere.** Dead, and
  `UATReminderPopup` only renders inside the former. They were tokenised, not
  deleted, in case they are parked for a UAT round. **Decide and delete.**
- **`TutorialOverlay`'s `z-[10005..10009]` was cargo-cult.** Its root is `fixed`
  with a z-index, so it already opened a stacking context; those five values
  only ever ordered against each other. Now `z-tutorial isolation-isolate` plus
  plain `z-10/20/30/40`.
- **The codebase documented its own layer contract**, in `MemberPanel` and
  `MessagingPanel`. FAB-above-modal is deliberate ("stays visible as the
  toggle"), and a drawer's scrim belongs *under* its drawer — the first draft of
  the scale had it backwards.

---

## Not done

### Phase 7 — mechanical type swap · ~180 files · codemod

Zero-delta unless noted. Reuses `scripts/codemod-tokens.mjs` (add a rule).

| Old | Count | New | Δ at 1440 |
|---|---|---|---|
| `text-[8px]` `[9px]` `[10px]` `[11px]` `[0.6rem]` `[0.625rem]` `[0.6875rem]` | ~174 | `text-micro` | **+2 to +5px** |
| `text-[0.8rem]` `[0.8125rem]` | 4 | `text-caption` | +1px |
| `text-base`→`body` · `xl`→`title-sm` · `2xl`→`title` · `3xl`→`title-lg` · `4xl`→`display-sm` · `5xl`→`display` · `6xl`→`display-lg` · `7xl`→`display-xl` | ~179 | — | 0 |
| `sm:text-3xl` `md:text-4xl` … | 11 | **delete** — the ramp replaces them | 0 |
| `rounded-lg` + `rounded-xl` | ~776 | `rounded-control` | 0 — both are 0.375rem |
| `rounded-2xl` + `rounded-3xl` | ~139 | `rounded-surface` | 0 — both are 0.5rem |

**The ~174 sub-13px occurrences are the actual fix for "text is too small".** The
ramp is not what fixes it — the floor is.

Hand-review list, worst first: `VenueMapEditor` (32 sub-13px labels on a spatial
canvas — needs a layout change, not a size swap), `VenueMapExplorer` (11),
`SentryIssueDetail` (8), `NavbarSearchPanel` (7), `VenueRoomList` (6),
`CalendarEventCard` (packs 8/9/10/11px into one card and will not fit at a 13px
floor).

### Phase 8 — `text-xs` · ~687 sites · ~220 files

- → `text-micro` when the class string also has `uppercase` **and**
  `tracking-widest`/`tracking-wider`/`tracking-[0.3em]` — eyebrow labels, where
  13px is right.
- → `text-caption` otherwise (+2px). Largest readability win by volume.

Split into three PRs by directory: `components/`, `pages/admin/`, the rest.

### Phase 9 — `text-sm` · ~1,193 sites · ~300 files · **riskiest**

- Default → `text-label` (15px, +1px). Most `text-sm` here is chrome, so a wrong
  guess costs one pixel rather than a reflow.
- Promote to `text-body` (16px) where the element is a `<p>`, or carries
  `leading-relaxed`/`leading-normal`/`line-clamp-*`, or sits in a description or
  subtitle slot.

Risk: `line-clamp-2` titles that currently just fit will clip, and `truncate`
cut points move. `--spacing-tile-min*` rides `--scale-layout`, so tiles grow
*with* the type rather than against it. One PR per domain directory.

### Phase 10 — icons · ~1,293 `size={N}` · ~280 files

`9–12`→`icon-xs` · `13–15`→`icon-sm` · `16,18`→`icon` · `20,22`→`icon-md` ·
`24–30`→`icon-lg` · `32+`→`icon-xl` or hand review.

Two things to check first:

1. **Verify on one component that `className` beats the `width`/`height`
   attribute** lucide renders. It should — a CSS dimension outranks a
   presentational attribute — but the whole phase depends on it.
2. `strokeWidth` does not scale, so anything above `icon-xl` will read thin.

Land this **after** Phase 9 so icons and their labels move together.

The ratchet for this counter is currently `it.skip` in `src/design/tokens.test.ts`
— deliberately, because a ratchet only works when the better option exists, and
enforcing it today just fails the suite whenever anyone builds a feature.
**Re-enable it as `it` when this phase lands**; the swap takes the count to zero
in one pass.

### Phase 11 — card geometry · ~95 files

- `p-4`(130) / `p-5`(31) / `p-6`(72) / `p-8`(20) / `p-12`(20) → `p-card-pad*`.
- Four tile heights for one visual tile — `min-h-[13rem]`, `min-h-[180px]`,
  `minmax(11rem,auto)` in `src/lib/bento.ts`, `minmax(10.5rem,auto)` in
  `DiscoverPage` — collapse to `--spacing-tile-min` / `-sm`.
- The 11 arbitrary-rem lengths (`min-w-[52rem]`, `max-h-[28rem]`, …) drift ~14%
  from their scaled neighbours at 2560. Small enough to enumerate by hand.

### Then: delete the frozen radius aliases

`--radius-{md,lg,xl,2xl,3xl}` in `src/index.css` **cannot be removed until the
Phase 7 radius swap has run.** Around 900 call sites still name them, and four
are in `components/resume/` — a directory the token system deliberately does not
govern, so no codemod reaches them. Dropping an alias hands those Tailwind's
stock radius (0.5rem where this app means 0.375rem) rather than an error.

---

## Deferred deliberately

**The grid ladder.** Two ladders coexist: `sm:`-first (50 uses, matching
`useGridColumns` and `BENTO_GRID`) and `md:`-first (35). Standardising on `sm:`
means two columns from 640 instead of 768, which is a real layout change on 35
grids that I could not visually verify across every page. Inconsistent is not
broken. Do it with eyes on `/design`, not as a blind codemod.

**The 37 legacy `max-w-Nxl mx-auto` sites.** These are deliberately-narrow
reading measures, not copies of the page container. Swapping them changes
layout and needs design intent, not a regex. (The other ~15 `max-w-Nxl` are
content constraints inside components and should stay.)

**`PageContainer` / `PageHeader` / `SectionTitle` / `EmptyState`.** Worth
building, but introducing components nothing adopts is worse than not
introducing them, and the JSX restructuring across 60 files is real risk for no
responsiveness gain. The token swap already got the width consistency.

---

## Guardrails

`src/design/tokens.test.ts` runs inside `npm test`. No new toolchain: it extends
the pattern in `src/pages/admin/errors/scoping.test.ts`, which already reads
every source file via `import.meta.glob('?raw')` — and `css: true` in
`vitest.config.ts` exists specifically so that works. The obvious alternative,
`eslint-plugin-tailwindcss`, resolves classes by loading a `tailwind.config.js`;
this project deliberately has none, so it cannot see the `@theme` and cannot
validate these tokens.

**Ratchet state.** Each number may only go down.

| Counter | Start | Now | Floor |
|---|---|---|---|
| Page containers | 63 | **0** | done |
| Raw z-index | 76 | 40 | ~38 — the rest is local stacking inside components that own their context |
| Arbitrary font sizes | 183 | 179 | 0 after phases 7–8 |
| Legacy `max-w-Nxl` | 57 | 57 | ~15 |
| `100vh` | 13 | 1 | 1 — the survivor is a prose mention in a comment |
| Wide unconditional `min-w` | 8 | 5 | 5 — data tables, all wrapped in `overflow-x-auto` |
| Icon `size={N}` | 1,284 | 1,293 | not enforced; see Phase 10 |

The `min-w` counter was wrong in the first audit: it counted `max-w-` (a cap,
which cannot overflow), variant-prefixed forms (`sm:min-w-…`, which do not
apply at phone widths), and properly wrapped tables. It reported eight
phone-breaking widths where there were none. Static analysis cannot see whether
an ancestor scrolls — the real check is the page-overflow readout in `/design`,
which measures `scrollWidth` against `clientWidth` in a live frame.

The ramp-integrity half of the suite asserts the things that fail silently:
`--spacing` is driven by `--scale-layout`; every `--text-*` references a ramp
rather than a frozen number; `--text-micro` pins `0.8125rem` literally; the
ramps never appear under `@theme inline` (which would resolve `var()` at build
time and freeze them); `--breakpoint-*` is never overridden; print and
`.errors-console` reset the ramps.

---

## Surfaces the token system does not govern

- **`src/components/resume/`** — a 210×296mm sheet authored in `mm` and `pt`.
  `rem` would make a printed CV's padding depend on browser window width.
  Ramps are reset for `.resume-sheet`, `.resume-desk`, `.resume-picker` and
  `@media print`.
- **`src/pages/admin/errors/`** — vendored shadcn/ReUI against stock Tailwind,
  scoped by its own test. Ramps reset for `.errors-console` and
  `[data-base-ui-portal]` (portals mount outside the console).
- **`DiscoverPage`'s hero and `FloatingActionButton`** — both pass `height` to
  `useViewportScale`, so they fit to viewport *height*. No width-stepped media
  query can express that. They keep their `em` cascade; the hook's docstring
  names them as the only two legitimate consumers.
