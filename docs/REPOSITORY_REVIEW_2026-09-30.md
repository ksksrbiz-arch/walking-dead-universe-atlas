# Repository review — September 30, 2026

Baseline: `9db428a41f4ebcae1384b75d0b84e66700b4c0b0`.

The review covered the application and its shared data/chronology helpers, gallery and AI clients, Vercel endpoints, Cloudflare workers, Supabase handlers, ingestion scripts, deployment configuration, and regression tooling. Generated datasets were checked structurally; external canon was not re-researched and production Supabase data was not modified.

## Corrections

- **Story order:** raw episode records used `airDate` as a day-precision story anchor. Detail lists therefore disagreed with the watch guide, which uses transformed records without air dates. Only explicit story dates now refine anchors. Raw records also use the canonical catalog position for ties. A regression compares all 363 raw episodes against the watch guide, including reversed input order.
- **Sync authorization:** both dormant cron dispatchers could accept `Bearer undefined` when `CRON_SECRET` was absent. They now reject missing and empty configuration before any upstream request. Tests cover absent/empty/wrong credentials and successful dispatch with the configured credential. Scheduling remains disabled.
- **Image viewer:** Tab previously returned to Close on every press, skipping navigation and attribution. Changing photos could remove the focused attribution link and let Escape dismiss the underlying detail. The viewer also lived beneath application navigation in the sheet's stacking context. It now uses a body portal, makes the application inert, cycles visible controls, recovers focus after credit changes, and restores the opener. Browser regressions cover four viewport sizes and hit-test the close button above app navigation.
- **Gallery recovery:** a failed fetch previously cached an empty result for the entire session. Failed network/HTTP/JSON loads now leave the cache retryable on the next detail load. Successful and concurrent requests still share a cache. Malformed gallery rows and inherited object keys are ignored.
- **AI response handling:** null or malformed citations could crash search during rendering. Invalid responses now produce a recoverable error while ordinary search remains usable. Model choice, provider credentials and Gateway budget are unchanged.
- **Windows tooling:** API import, SEO and enrichment audit scripts incorrectly treated URL pathname strings as filesystem paths. They now use file URLs or `fileURLToPath`. The API and SEO checks were reproduced failing on Windows before correction and passing afterward.

## Validation

- TypeScript checking and production build.
- Dataset structural audit: 363 episodes, 667 typed graph nodes, 5,983 validated edges. Existing warnings identify intentional IDs shared across different entity kinds.
- 30 journey checks; 14 chronology checks; 15 AI-worker tests; media-worker tests.
- 17 share/OG checks; SEO metadata/assets; all 10 Vercel API modules load directly without local imports.
- New resilience checks exercise both cron handlers, gallery failure/retry/coalescing and malformed AI responses.
- 40 existing browser checks cover map touch gestures, navigation, watch persistence and journeys. Ask Atlas and lightbox checks cover 390×844, 820×1180, 1440×900 and 844×390. AI and external media requests are mocked in these browser checks; they do not spend Gateway tokens.
- Screenshots inspected for the four viewer layouts. Physical-device behavior has not been re-tested.

Local checks ran on Windows with Node 26.7.0; the project specifies Node 24.x for deployment. The existing build warnings about initial bundle size and future native Vite configuration loading remain.

## Follow-up areas

- Initial JavaScript remains approximately 1.97 MB uncompressed / 456 KB gzip. Static geography and enrichment records are substantial; a separate loading/performance change should measure first render and preserve offline/static-data behavior.
- AI-worker corpus updates still require an explicit worker deployment when its source registries change. The frontend deployment alone does not refresh that snapshot.
- Supabase session-state/bookmark handlers are scaffolding separate from local browser watch state. Their aggregate storage limits, concurrent bookmark quota enforcement, and streamed request-size enforcement warrant a dedicated backend change before broader use.
- Media proxies check actual size after buffering some upstream responses. Bounded streaming and end-to-end timeout tests are a useful separate hardening change.
- Enrichment audit source artifacts are generated outside the checked-in canonical snapshot; this review does not claim a fresh network-wide media or canon audit.

The **$10 limit applies only to AI usage through the Cloudflare Gateway**. It is not a repository-review, hosting, or general project budget.
