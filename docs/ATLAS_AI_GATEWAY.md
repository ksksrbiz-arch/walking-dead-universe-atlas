# Atlas AI — Mistral through Cloudflare AI Gateway

## Live connection
- App: https://walking-dead-universe-atlas.vercel.app (Cloudflare Pages mirror uses the same endpoint).
- Worker: https://walking-dead-atlas-ai.skdev-371.workers.dev
- Gateway: `walking-dead-universe-atlas`, account `371afa6149061390a094cfbf8a184aff`.
- Model: `mistral-small-latest` through the native `mistral/v1/chat/completions` route.
- Mistral's provider key is stored in AI Gateway under alias `default`. Cloudflare's AI binding authenticates the Worker; there is no gateway or provider credential in the browser.

Search stays local. Clicking **Ask Atlas** explicitly sends the question (maximum 600 characters) to the Worker. The Worker retrieves from the eight checked-in registries, limits evidence to 10 records / 14,000 characters, and returns an answer with links to supporting Atlas entities. Answers can contain spoilers. This is retrieval-based assistance, not a canon authority or a proof that every generated sentence is correct. It preserves uncertainty in its instructions and must cite retrieved IDs; verify important statements against sources.

## Budget and cost controls
Gateway settings:
- Authenticated gateway; BYOK only, so missing provider keys do not fall through to Cloudflare Unified Billing.
- Spend limit: **USD 10 over a rolling 30-day window** (2,592,000 seconds), shared by public questions and maintenance tasks.
- 120 gateway requests per 60 seconds; Worker adds 6 requests/minute per IP, or one shared maintenance-token key.
- Maximum 700 output tokens, one attempt, 20-second provider timeout. Browser and CLI time out after 25 seconds.
- Public answers cache for one hour. Requests include the evidence and a content hash derived from the checked-in data.
- Maintenance tasks skip cache and disable request/response logging to avoid retaining document or code contents. They still count against gateway cost controls.

Spend limits use estimated model pricing and are eventually consistent. Concurrent requests can briefly exceed the threshold; this is not a guaranteed exact provider invoice cap. See https://developers.cloudflare.com/ai-gateway/features/spend-limits/. Hosting charges and direct use of the Mistral key outside this gateway are outside this AI budget.

A budget/usage rejection returns 429 with a clear message. Ordinary Atlas search and navigation remain available. We verified live enforcement using a temporary tiny rule scoped to `general`: the first call succeeded, the next returned `budget_exhausted`. The temporary rule was removed; only the USD 10 rolling rule remains.

## Server maintenance tasks
`POST /tasks` requires `Authorization: Bearer <ATLAS_TASK_TOKEN>`. The token is a Worker secret, separate from the Mistral key. Never use a `VITE_` variable for either credential.

Supported tasks: `classify`, `extract`, `summarize`, `enrich`, `document`, `code`, `general`. All use Mistral Small initially; no automatic upgrades or paid fallback models.
- `classify` requires 1–12 labels and rejects output outside those labels.
- `enrich` requires an HTTPS source URL, returns proposals plus server-generated source URL / retrieval time / payload hash, and sets `reviewRequired: true`.
- `document` processes **text** (20,000 characters maximum). Scanned PDFs/images require a separately integrated OCR workflow; binary uploads are not supported.
- No task writes canonical data, executes generated code, crawls supplied URLs, or runs on a schedule.

Local CLI:
```
# Set ATLAS_TASK_TOKEN in the environment, or in workers/atlas-ai/.dev.vars (ignored).
npm run ai:task -- summarize notes.txt
npm run ai:task -- classify excerpt.txt --labels character,location,episode
npm run ai:task -- extract excerpt.txt --output entities.json
npm run ai:task -- enrich excerpt.txt --source-url https://epguides.com/WalkingDead/ --output proposals.json
npm run ai:task -- document notes.txt
npm run ai:task -- code code-question.txt
npm run ai:task -- general task.txt
```

The installation's private task token is stored locally in the ignored `workers/atlas-ai/.dev.vars`. A fresh checkout needs an operator-provided token. Rotate it by generating a cryptographically random token, using `wrangler secret put ATLAS_TASK_TOKEN` in `workers/atlas-ai`, and updating local callers. Do not put credentials in commits, issue comments, or browser configuration.

## Deployment and data freshness
```
npm ci
npm run build:ai
npm run test:ai
npm run typecheck
npm run build
# Start vite preview on :4173, then:
npm run test:ai-ui
npm run test:ui
# In workers/atlas-ai, after Cloudflare authentication:
npx wrangler deploy
```

Wrangler's build runs `scripts/build-atlas-ai.mjs`, which embeds checked-in data and derives the corpus hash. **Redeploy the AI Worker whenever those eight registries change**; the app's Vercel/Pages build does not deploy the Worker automatically. This separation avoids network enrichment in normal app builds. Source: `workers/atlas-ai`.

The browser defaults to the deployed Worker. `VITE_ATLAS_AI_ENDPOINT` can override the public endpoint at build time; it must contain a URL only. Allowed origins are the two known Vercel production aliases, the Pages project, and previews scoped to the same Vercel team / Pages project. For a custom domain, explicitly add it to the Worker's `ALLOWED_ORIGINS` and redeploy.

## Verification
- `GET /health` shows configured gateway, provider, model, corpus hash, and record count; it does not make inference calls.
- 15 backend tests cover auth, CORS, limits, malformed inputs, citations, provider/budget errors, private logging/cache, classification and provenance.
- Browser checks at 390×844, 820×1180, 1440×900, 844×390 cover explicit requests, linked entities, normal search, budget fallback, cancellation, overflow, and runtime errors.
- The existing 40-check UI regression suite passes; its two search interactions now wait for the lazily loaded input/results rather than assuming a 150 ms chunk load.
- Live Mistral classification, entity extraction, enrichment and text document processing succeeded. Costs are tracked in this gateway.
