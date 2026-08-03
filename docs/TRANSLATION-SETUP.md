# Azure Translator Setup

KTIP's static UI (menus, buttons, forms) ships pre-translated in French and
Spanish and needs **nothing** from this guide. This key powers the second
layer: member-written content — project titles, descriptions, event pages,
forum posts — translated on first view and cached in Postgres for every
visitor after that.

Without the key the app still works: `/api/translate` answers politely with
the English source and the page renders normally. Nothing errors.

**Cost: free.** The F0 tier gives 2 million translated characters per month,
permanently — not a trial. Because every translation is cached and shared,
each sentence on the platform costs characters exactly once, ever. F0 never
converts to a paid charge; if the month's 2M runs out it throttles, readers
see English for uncached content, and it resets next month.

---

## 1. Get an Azure subscription (one-time)

Signing in to the Azure portal is not enough — resources live inside a
*subscription*, and a fresh Microsoft account has none (the Create form shows
"No available items" under Subscription).

1. Go to <https://azure.microsoft.com/free> and click **Start free**.
2. Sign in with the Microsoft account you use for the portal.
3. Complete phone and card verification. The card is for identity only:
   the F0 tier used below never bills it. The signup also grants ~$200 of
   30-day trial credit you won't need.
4. When it finishes you have a subscription (usually named
   "Azure subscription 1" or "Free Trial").

## 2. Create the Translator resource

1. In <https://portal.azure.com>: **Create a resource** → search
   **Translator** → **Create**.
2. Fill the **Basics** tab:

   | Field | Value |
   |---|---|
   | Subscription | the one from step 1 |
   | Resource group | **Create new** → `ktip` |
   | Region | **Global** (recommended by the form; routes to the nearest datacenter) |
   | Name | `ktip-translator` (any unique name) |
   | Pricing tier | **Free F0** — *this is the important one; up to 2M characters/month* |

   The Pricing tier dropdown only populates after Subscription and Region
   are chosen. A subscription can hold **one** F0 Translator.
3. Skip the Network / Identity / Tags tabs (defaults are fine) →
   **Review + create** → **Create**.
4. Wait for "Your deployment is complete" → **Go to resource**.

## 3. Copy the key and region

In the resource's left menu open **Keys and Endpoint**:

- **KEY 1** → this is `AZURE_TRANSLATOR_KEY`
- **Location/Region** → this is `AZURE_TRANSLATOR_REGION`
  (`global` if you picked Global above)

Either of the two keys works; KEY 2 exists so you can rotate without
downtime.

## 4. Set the environment variables

### Vercel (production)

Project → **Settings** → **Environment Variables**, add to all environments:

```
AZURE_TRANSLATOR_KEY    = <KEY 1>
AZURE_TRANSLATOR_REGION = global
```

Then **redeploy** — env changes don't apply to already-built deployments.

### Local development

Add the same two lines to `.env` in the project root and restart
`npm run dev`. Both variables are already on the dev-server promote list in
`vite.config.ts`, so no config change is needed.

### Optional variables

| Variable | Purpose |
|---|---|
| `AZURE_TRANSLATOR_ENDPOINT` | Only for non-default endpoints (sovereign clouds). Leave unset otherwise. |
| `TRANSLATION_MONTHLY_CHAR_CAP` | Your own monthly ceiling *below* Azure's 2M, e.g. `1500000`. When it's reached, cached content stays translated and only new content falls back to English. |
| `TRANSLATION_IP_SALT` | Random string used to hash reader IPs for rate limiting (`openssl rand -hex 32`). Set this in production. |

## 5. Verify it works

1. Open the site, switch to Français, and view any project list —
   member-written titles and descriptions should translate within a second
   (English shows first, then swaps in place).
2. DevTools → Network: a list of 20 cards should produce **one**
   `/api/translate` POST, not twenty.
3. Reload the page: **zero** requests — the browser cache tier answers.
4. Open the same page in a private window: one POST where every result has
   `"cached": true` — served from the shared Postgres cache, costing zero
   Azure characters. That shared cache is the whole design: one member's
   first view pays for everyone's.

## Troubleshooting

- **Everything stays English** — the response body's `degraded` field says
  why: `no_key` (env var missing or deployment not rebuilt), `over_budget`
  (monthly cap hit), `rate_limited`, or `provider_error`.
- **Works in production, not locally** — `.env` line missing or the dev
  server wasn't restarted after adding it.
- **401/403 from Azure** — key and region don't match the resource; re-copy
  both from Keys and Endpoint.

## Swapping providers later

All Azure-specific code lives in `api/_lib/translate-provider.ts` behind a
three-method interface. Moving to DeepL (better French, 500K free/month) or
a self-hosted LibreTranslate (unlimited, data never leaves your server) is
a change to that one file — the cache, budget accounting and client remain
untouched, and everything already cached stays cached.
