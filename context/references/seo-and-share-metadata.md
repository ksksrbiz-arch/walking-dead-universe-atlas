# SEO and share metadata (reference)

What crawlers and link unfurlers see, where it lives, and what is deliberately *not* done. The app is a client-rendered
SPA on one domain (`https://walking-dead-universe-atlas.vercel.app`); there is no server-rendered content.

## Two kinds of preview
| URL | Served by | Preview |
|---|---|---|
| `/` (home) | `index.html` (static) | `public/og-home.jpg`, a static 1200x630 card |
| `/j/…`, `/p/:id`, `/e/:id`, `/c/:id` (share links) | `api/share.ts` (HTML) + `api/og.ts` (dynamic PNG) | Per-entity card. See `journeys-and-sharing.md` |

`api/og.ts` has no "home" kind and is deliberately fragile (unbundled Vercel function, `@vercel/og` pinned to 0.11), so the
home card is a committed static asset instead of a new API branch.

## What `index.html` carries
Title, meta description (quotes the episode count), `robots`, canonical, Open Graph + Twitter `summary_large_image`, favicon
(`public/favicon.svg`), apple-touch-icon and web manifest, a schema.org `WebApplication` JSON-LD block (no ratings, prices
or reviews are claimed), and a `<noscript>` note.

`public/` also ships `robots.txt` (allow all; **do not `Disallow: /api/`**, social scrapers fetch `/api/og` cards from there),
`sitemap.xml` (home only) and `manifest.webmanifest`.

## Change checklist
- **Dataset size changes** (episode count): update the number in the `description`, `og:description`, `twitter:description`
  and JSON-LD in `index.html`. `npm run test:seo` fails if the description no longer quotes the real count.
- **Domain changes** (custom domain): replace `https://walking-dead-universe-atlas.vercel.app` in `index.html`,
  `public/robots.txt`, `public/sitemap.xml`. `test:seo` fails if they disagree with the canonical.
- **Brand assets** (`og-home.jpg`, `icons/icon-{180,192,512}.png`): `CHROMIUM_EXECUTABLE_PATH=<chromium> npm run build:brand-assets`
  (omit the variable if Playwright's own browser is installed). The card is drawn from the land outline, placed locations and
  episode count only, so re-run it after data changes. Keep the JPEG under 300 KB (WhatsApp/Telegram limit).
- **Verify:** `npm run build && npm run test:seo`. Then paste the URL into a link-preview debugger (Facebook Sharing Debugger,
  LinkedIn Post Inspector) after deploying; the test cannot fetch remote scrapers.

## Deliberately not done (needs a product decision)
- **Indexable entity pages.** Share URLs return OG metadata and then redirect (`meta refresh` + `location.replace`) to the SPA,
  and their canonical points at the app URL. Search engines therefore see one indexable page (`/`). Ranking for individual
  characters, places or episodes would need prerendered/SSR pages (one per entity: hundreds of pages) or a static snapshot mode. That
  is real infrastructure; weigh it against traffic before building.
- **Per-view titles.** Views (Map/Timeline/People/Watch) are app state, not routes, so the title does not change per view.
- **Analytics-grade tracking.** Only anonymous performance aggregates are collected (`supabase-backend.md`).
