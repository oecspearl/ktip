# i18n slice playbook

How to migrate one directory of this app to Lingui. Written for a fresh agent
with no context beyond this file.

## What you are doing

Every user-visible English string in this codebase is hardcoded. The migration
wraps each one in a Lingui macro so it can be looked up in a translation
catalog. You are doing that for **one assigned directory**, and nothing else.

Two languages are targeted: French and Spanish. English is the source, and a
message's English text IS its catalog id — there are no invented keys.

## Rules that are not negotiable

1. **Only edit files matching your assigned glob.** Another agent is working in
   the next directory. If a fix seems to require editing a shared component,
   report it instead — do not reach outside your slice.
2. **Do not edit** `scripts/i18n/config.mjs`, `lingui.config.ts`, anything under
   `src/locales/`, or `i18n/manifest.json`. The orchestrator owns those.
3. **Do not run** `npm run i18n:scan`, `i18n:extract`, `i18n:compile`,
   `i18n:check`, or `npm run build`. They mutate shared state and other agents
   are running concurrently.
4. **Never wrap**: `className`, `id`, `key`, `to`, `href`, `src`, `type`,
   `variant`, `size`, `value`, any argument to `cn()`/`clsx()`/`cva()`, date-fns
   format strings like `'PPP'`, object **keys** (values only), or anything that
   is a slug, route, enum, or database column name. When a string is a value
   compared against — `variant === 'compact'` — it is a token, not copy.
5. **`profiles.display_name` is never translated.** Neither is any user's own
   name, handle, or organisation-supplied brand name.

## Step 1 — run the codemod

```bash
node scripts/i18n/apply.mjs --glob '<YOUR GLOB>' --dry-run   # look first
node scripts/i18n/apply.mjs --glob '<YOUR GLOB>'
```

It wraps the mechanical cases from a pre-computed manifest and reports what it
left for you. It is idempotent; running it twice changes nothing.

If it prints **"A nearer binding named 't' shadows the macro at"**, fix those
first: some callback parameter is named `t` and is now shadowing the `t` from
`useLingui()`. Rename the parameter.

## Step 2 — typecheck and fix what the codemod could not

```bash
npx tsc --noEmit -p tsconfig.app.json
```

Only fix errors in **your** files. The two failures you will actually see:

### `Type 'MessageDescriptor' is not assignable to type 'string'`

The codemod converted a module-scope object value to `msg\`…\``, which is
correct — a `t\`…\`` at module scope is evaluated once at import, before any
language is chosen, and then never changes again. But a descriptor is inert, so
the **render site** has to resolve it:

```tsx
// module scope
import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'

const STATUS: Record<string, { label: MessageDescriptor }> = {
  idle: { label: msg`Up to date` },
}

// render site
import { useLingui } from '@lingui/react/macro'
const { i18n } = useLingui()
return <span>{i18n._(STATUS[k].label)}</span>
```

If a list mixes descriptors with plain harvested strings, use the shared helper
rather than casting — `i18n._` is overloaded and a union matches neither
overload:

```tsx
import { resolveCopy, type Copy } from '../../i18n/copy'
const label = resolveCopy(i18n, option.label)
```

### `Cannot find name 't'` / `Cannot find name 'Trans'`

A component needs `const { t } = useLingui()`, or the file needs
`import { Trans, useLingui } from '@lingui/react/macro'`. Put the hook call
**above any early return** — a hook after `if (!x) return null` runs on some
renders and not others, which is a crash.

## Step 3 — the strings the codemod refused

Run this to list them for your slice:

```bash
node -e "const m=require('./i18n/manifest.json');for(const e of m.entries) if(e.action==='human'&&e.file.startsWith('<YOUR DIR>')) console.log(e.kind, e.file+':'+e.line, JSON.stringify(e.text))"
```

Each needs a judgment call. The patterns and their fixes:

### Fragmented sentence

```tsx
// before — three messages, and French cannot reorder them
Tip: press <kbd>Ctrl</kbd>+<kbd>K</kbd> to search.

// after — one message; Lingui extracts it as "Tip: press <0>Ctrl</0>+<1>K</1> to search."
<Trans>
  Tip: press <kbd>Ctrl</kbd>+<kbd>K</kbd> to search.
</Trans>
```

Wrap the **whole sentence**, markup included. If the codemod already wrapped a
fragment inside it, remove that inner `<Trans>` — nested macros are invalid.

### Template with an expression

```tsx
// before
aria-label={`Open ${label.toLowerCase()}`}

// after — .toLowerCase() is an English habit and is wrong in French and Spanish
aria-label={t`Open ${label}`}
```

Hoist any non-trivial expression to a named `const` first. Lingui names an
expression it cannot read `{0}`, and `"Nothing matched {0}"` is not something a
translator can place:

```tsx
const term = query.trim()
<Trans>Nothing matched “{term}”.</Trans>
```

### Counted noun

Never assemble a plural by concatenation. `project{n !== 1 ? 's' : ''}` is
wrong in both target languages — French and Spanish diverge from English at
zero, and from each other.

```tsx
import { Plural } from '@lingui/react/macro'
<Plural value={n} one="Found # project" other="Found # projects" />
```

### Server-message fallback

```tsx
// Only the fallback is ours. err.message comes from Postgres or the browser and
// stays in whatever language it arrived in.
toast.error(err.message || t`Could not save changes`)
```

### Content vs chrome

A string that comes out of the **database** — a project title, a grant summary,
someone's bio — is not catalog copy. It goes through the content pipeline:

```tsx
import { useTranslated } from '../../hooks/useTranslated'
const description = useTranslated(badge.description)
```

Chrome around it still uses `t`:

```tsx
title={t`${description} — earned ${awardedAt}`}
```

Getting this backwards is expensive: putting content in the catalog means it can
never be translated for rows added later, and putting chrome through the content
pipeline pays a machine-translation charge forever for a string that never
changes.

## Step 4 — verify

```bash
npx tsc --noEmit -p tsconfig.app.json          # must be clean
npx vitest run <your slice's test files>        # if any exist
node scripts/i18n/apply.mjs --glob '<GLOB>' --dry-run   # must report 0 files
```

## Step 5 — report back

Return, as plain text:

1. Files changed, and the count of strings wrapped.
2. **Every new English string you introduced or wrapped**, one per line. The
   orchestrator needs this list to write the French and Spanish.
3. Anything you deliberately left alone, and why.
4. Anything that needed a file outside your glob.

Do not attempt to write translations yourself.
