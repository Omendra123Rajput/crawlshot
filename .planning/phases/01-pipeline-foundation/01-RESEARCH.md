# Phase 1: Pipeline Foundation - Research

**Researched:** 2026-03-12
**Domain:** Express API routing, BullMQ job queues, crawler security (SSRF guard), URL normalization, robots.txt/sitemap parsing
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SECR-01 | SSRF guard blocks private IPs, link-local, and cloud metadata endpoints on all outbound requests | Guard exists in `ssrf-guard.ts` and is called correctly in `crawlSite` and `POST /api/jobs`; two gaps found: `robots-parser.ts` and `link-extractor.ts` fetch without prior guard |
| SECR-02 | Path sanitization prevents directory traversal on all file writes | `sanitize-path.ts` and `file-writer.ts` already implement `path.resolve + startsWith` guard; download route has its own inline check; all are correct, no changes needed for Phase 1 |
| SECR-03 | All API request bodies validated with zod schemas | `createJobSchema` + `validateBody` middleware already in place; correctly rejects missing/invalid fields with 400 + descriptive `details` array |
| SECR-04 | Rate limiting on job creation endpoint | `jobCreationLimiter` (20 req / 15 min per IP) already applied to `POST /api/jobs`; no change needed |
| PIPE-01 | User can submit a URL and receive a job ID immediately | Route exists; job store creates record and enqueues crawl job synchronously before returning 201; works correctly today — "Cannot GET /" is a dev-server startup issue, not a routing bug |
| PIPE-02 | System crawls all internal pages from the submitted URL automatically | `crawlSite` in `packages/crawler/src/index.ts` implements BFS with batch processing; functional but has gaps: SSRF guard not called before fetching discovered pages in `extractLinks`, HTTP (non-HTTPS) links are accepted by `normalizeUrl` |
| PIPE-03 | System discovers pages via sitemap.xml (primary) and link-following (fallback) | `parseSitemap` and `extractLinks` both implemented; sitemap handles index sitemaps (up to 10 children); fallback to BFS link-following is the crawl loop itself |
| PIPE-04 | System respects robots.txt disallow rules during crawl | `RobotsParser` fetches and parses robots.txt; `isAllowed()` uses longest-match precedence; applied before each URL in crawl loop |
| PIPE-05 | System deduplicates discovered URLs via normalization (trailing slash, query params, anchors) | `normalizeUrl` strips fragments, sorts query params, removes trailing slash; `visited` Set in `crawlSite` prevents duplicates |
</phase_requirements>

---

## Summary

Phase 1 is a targeted repair phase, not a greenfield build. The pipeline infrastructure — API routes, job store, BullMQ queues, Redis Pub/Sub broadcaster, crawl worker, SSRF guard, robots parser, sitemap parser, URL normalizer, link extractor — is all present and mostly correct. The "Cannot GET /" error reported in STATE.md is a development server startup symptom, not a routing bug; the route registrations in `apps/api/src/index.ts` are correct. The primary work in this phase falls into three categories: closing two SSRF guard coverage gaps (robots fetch and link fetch bypass the guard), enforcing HTTPS-only on discovered links, and wiring the `removeJob` stub so job stats are cleaned up after completion.

The crawl pipeline itself is sound. BFS batching in `crawlSite`, robots.txt longest-match, sitemap index traversal, URL normalization (fragment stripping, query sort, trailing-slash normalization), and the `visited` Set deduplication are all implemented correctly. The SSRF guard in `ssrf-guard.ts` is thorough — it covers private CIDRs, link-local, cloud metadata endpoints, and blocked hostnames, with fallback DNS resolution via OS resolver. The gap is not in the guard's logic but in where it is called: `extractLinks` fetches pages via `node-html-parser` without calling `guardUrl` first, and `RobotsParser.fetch` does the same. Both are straightforward fixes.

The `removeJob` stub in `screenshot-worker.ts` is literally an empty function body. It is called after ZIP packaging completes, but never calls `removeJobStats(jobId)`, so the `jobStatsMap` accumulates entries for every completed job indefinitely and the completion `setInterval` loop continues checking already-finished jobs. This is a one-line fix. The SSE subscriber initialization race (Redis subscriber initialized without awaiting ready, server already listening) is a low-risk fragile area that is worth hardening.

**Primary recommendation:** Fix the three targeted gaps (SSRF on fetch calls, HTTPS-only link filter, `removeJob` stub) and verify end-to-end `POST /api/jobs` → crawl → screenshot queue works without errors. All security requirements (SECR-01 through SECR-04) are already structurally in place; Phase 1 closes the two enforcement gaps.

---

## Standard Stack

### Core (already in place — no new installs needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Express | 4.19.0 | HTTP API server, routing, middleware | Already in use; routes correctly registered |
| Zod | 3.23.0 | Request body validation schema | Already in use; `createJobSchema` covers url + viewports |
| BullMQ | 5.0.0 | Redis-backed job queues (crawl + screenshot) | Already in use; queue definitions in `packages/queue` |
| ioredis | 5.4.0 | Redis client for queues and Pub/Sub | Already in use; singleton via `getRedisConnection()` |
| ip-range-check | 0.2.0 | CIDR range validation in SSRF guard | Already in use; called in `ssrf-guard.ts` |
| node-html-parser | 6.1.0 | Link extraction from HTML responses | Already in use; `extractLinks` uses it |
| fast-xml-parser | 4.3.0 | Sitemap and robots.txt XML parsing | Already in use; `parseSitemap` uses it |
| p-throttle | 5.1.0 | Rate-limits crawl fetch requests (2 req/s) | Already in use; wraps `extractLinks` |
| pino | 9.0.0 | Structured logging | Already in use; child loggers with jobId context |
| express-rate-limit | 7.2.0 | Rate limiting on `POST /api/jobs` | Already in use; `jobCreationLimiter` applied |

### No New Dependencies Required

Phase 1 is entirely a repair phase. No new libraries need to be installed. All tools needed to close the gaps (native `dns/promises`, native `URL`, existing `guardUrl` function) are already available.

**Installation:** None required.

---

## Architecture Patterns

### Recommended Project Structure (existing — do not reorganize)

```
apps/api/src/
├── index.ts              # Express app + route registration + SSE init
├── config.ts             # Zod-validated env schema
├── routes/
│   ├── jobs.ts           # POST /api/jobs, GET /api/jobs/:jobId, GET /api/jobs
│   ├── sse.ts            # GET /api/jobs/:jobId/stream
│   └── download.ts       # GET /api/jobs/:jobId/download
├── middleware/
│   ├── validate.ts       # validateBody(schema) wrapper
│   ├── rate-limit.ts     # jobCreationLimiter + generalLimiter
│   ├── cors.ts           # corsMiddleware
│   └── error-handler.ts  # AppError-aware global error handler
├── services/
│   ├── job-store.ts      # In-memory Map<jobId, JobRecord>
│   └── sse-broadcaster.ts # Redis Pub/Sub → SSE forwarding
└── types/index.ts        # JobRecord, SSEEvent, AppError subclasses

packages/crawler/src/
├── index.ts              # crawlSite() — BFS loop, calls guard/robots/sitemap/extractor
├── ssrf-guard.ts         # guardUrl() — DNS resolution + CIDR range check
├── url-normalizer.ts     # normalizeUrl() — fragment/query/trailing-slash normalization
├── robots-parser.ts      # RobotsParser class — fetch + parse + isAllowed()
├── sitemap-parser.ts     # parseSitemap() — handle urlset and sitemapindex
└── link-extractor.ts     # extractLinks() — HTML fetch + anchor href extraction

services/worker/src/
├── index.ts              # Worker process entry; waits for Redis ready, starts both workers
├── crawl-worker.ts       # BullMQ Worker for CRAWL queue; calls crawlSite, queues screenshot jobs
├── screenshot-worker.ts  # BullMQ Worker for SCREENSHOT queue; captures, polls for completion
└── broadcast.ts          # jobStatsMap + broadcastToJob() + CRUD helpers
```

### Pattern 1: Async Route Handler Wrapping (Express 4)

Express 4 does not catch rejected promises from async route handlers automatically. The existing `asyncHandler` wrapper in `routes/jobs.ts` is the correct pattern — all new async routes must use it.

```typescript
// Source: apps/api/src/routes/jobs.ts (existing pattern)
function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

router.post('/', jobCreationLimiter, validateBody(createJobSchema), asyncHandler(async (req, res) => {
  // async logic here — errors forwarded to errorHandler middleware
}));
```

### Pattern 2: SSRF Guard — Call Site Contract

`guardUrl(url)` must be called before ANY outbound HTTP request or Playwright navigation. The call returns `void` on success and throws `SSRFBlockedError` or a plain `Error` on failure.

```typescript
// Source: packages/crawler/src/ssrf-guard.ts
// Correct pattern (already in POST /api/jobs and crawlSite BFS loop):
try {
  await guardUrl(url);
} catch (error) {
  if (error instanceof SSRFBlockedError) {
    log.warn({ url, ip: error.blockedIp }, 'SSRF blocked');
  }
  return; // skip this URL
}
```

The TWO places where this call is missing in Phase 1:
1. `robots-parser.ts` — `fetch(robotsUrl)` at line 15, before DNS check
2. `link-extractor.ts` — `fetch(pageUrl)` at line 9, before link extraction

For `robots-parser.ts`, `guardUrl` should be called in `fetch()` before the HTTP request, using the base URL already validated at job creation. For `link-extractor.ts`, each discovered URL is already validated by `guardUrl` in the `crawlSite` BFS loop before being passed to `extractLinks`. The issue is that `extractLinks` itself fetches `pageUrl` without re-validating — but since `pageUrl` was already guard-checked before being queued, the real gap is the **robots.txt fetch** only, where the base URL has not yet been through `guardUrl` at the crawler level (only at the API level, for the seed URL). Confirm: `crawlSite` is called from `crawl-worker.ts` which receives the URL after API-level guard passes; robots fetch happens in `crawlSite` using that already-validated URL, so the robots gap is lower risk. The `extractLinks` gap is that discovered sub-URLs are HTTPS-validated by `normalizeUrl` being called, but `extractLinks` itself fetches pages that were only guard-checked in the BFS loop. Since the BFS loop calls `guardUrl` before passing a URL to `throttledExtract`, the extractLinks gap is already closed by the caller. Net: no fetch-before-guard gap exists in the crawl hot path. The only true gap is HTTPS protocol enforcement on discovered links (see below).

### Pattern 3: URL Normalization Scope

`normalizeUrl()` currently passes through HTTP links (line 12: allows `http:` and `https:`). The SSRF guard enforces HTTPS only (`parsed.protocol !== 'https:'` check), but only for URLs that reach `guardUrl`. Links extracted by `extractLinks` that are HTTP will be added to the `visited` set and `queue` in `crawlSite` before the guard runs. The guard then blocks them, but they still consume queue capacity. Fix: add HTTPS-only filter in `normalizeUrl` or in `crawlSite` directly.

```typescript
// Current normalizeUrl allows http: - should enforce https: only
// Fix in packages/crawler/src/url-normalizer.ts:
if (url.protocol !== 'https:') {
  return null; // reject http: and all non-https
}
// Remove the original: if (url.protocol !== 'http:' && url.protocol !== 'https:')
```

### Pattern 4: removeJob Stub Wire-Up

The `removeJob` function in `screenshot-worker.ts` is an empty stub (lines 102-104). After ZIP packaging, it must clean up job stats to prevent the `setInterval` from re-processing completed jobs and to free memory.

```typescript
// Current (broken) - screenshot-worker.ts line 102:
function removeJob(jobId: string): void {
  // Cleanup is handled by broadcast module
}

// Fix: import removeJobStats from broadcast and call it
import { ..., removeJobStats } from './broadcast';

function removeJob(jobId: string): void {
  removeJobStats(jobId);
}
```

`removeJobStats` is already exported from `broadcast.ts` (line 62-64). This is a one-line import addition and one-line function body.

### Anti-Patterns to Avoid

- **Calling `engine.initialize()` inside each screenshot job handler**: Currently in `screenshot-worker.ts` line 20. The boolean guard in `browser-pool.ts` is not concurrency-safe (race on concurrent init). Fix: call `engine.initialize()` once in `services/worker/src/index.ts` after Redis ready, before starting workers. This is a Phase 1 concern only if multiple screenshot jobs start simultaneously before the pool is initialized.
- **Using `setInterval` for completion detection without removing the job from stats first**: The interval at line 57 of `screenshot-worker.ts` loops all `activeJobs`. If `removeJobStats` is never called, completed jobs stay in the loop forever. Fix: always call `removeJobStats` inside `removeJob` before the interval checks again.
- **Starting the HTTP server before the SSE Redis subscriber is ready**: `initSSESubscriber` is fire-and-forget (line 37 in `index.ts`). If a client connects before the Redis subscriber's `on('ready')` fires, `subscriber?.subscribe(...)` is called on a null subscriber. For Phase 1, this is low-risk (developer tool, single user). Accept the risk; note it for Phase 3 hardening.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SSRF IP range blocking | Custom regex or `inet_aton` comparison | `ip-range-check` (already in use) | Handles IPv4 CIDR, IPv6 CIDR, edge cases |
| Request body validation | Manual field checks | Zod + `validateBody` middleware (already in use) | Handles type coercion, nested errors, default values |
| Rate limiting | Counter in Redis or Map | `express-rate-limit` (already in use) | Handles window sliding, headers, configurable |
| URL deduplication | Manual string comparison | `visited` Set + `normalizeUrl` (already in use) | Handles trailing slash, query sort, fragment strip |
| Sitemap XML parsing | Custom XML regex | `fast-xml-parser` (already in use) | Handles sitemap index, encoding, malformed XML |
| HTML link extraction | Custom regex over HTML | `node-html-parser` (already in use) | Handles nested elements, malformed HTML |
| Job queue | `setInterval` + in-process queue | BullMQ + Redis (already in use) | Persistence, retries, concurrency, dead-letter |

**Key insight:** Phase 1 has zero new library choices to make. Every required capability is implemented. The work is closing gaps in existing implementations.

---

## Common Pitfalls

### Pitfall 1: "Cannot GET /" Misdiagnosis
**What goes wrong:** Developer starts the API (`npm run dev` in `apps/api`) and hits `http://localhost:3001/` in a browser or curl, gets a 404/routing error, concludes routing is broken.
**Why it happens:** Express has no handler for `GET /`. This is expected. The API has `GET /health`, `POST /api/jobs`, etc. There is no root route.
**How to avoid:** Test with `curl http://localhost:3001/health` to confirm the server is up. Test the actual routes: `POST http://localhost:3001/api/jobs`.
**Warning signs:** If `GET /health` also returns "Cannot GET /health", the server has not started (check for port conflicts, Redis not running, env var errors).

### Pitfall 2: Redis Not Running Before Worker Start
**What goes wrong:** Worker process crashes immediately on startup with `ECONNREFUSED` connecting to Redis.
**Why it happens:** `services/worker/src/index.ts` waits for Redis `ready` event before starting workers, but if Redis is not running at all, `ioredis` retries forever with backoff, and the `once('ready')` handler never fires.
**How to avoid:** Always run `docker compose up -d redis` before starting worker. Verify with `docker ps | grep redis` or `redis-cli ping`.
**Warning signs:** Worker log shows repeated "Reconnecting to Redis..." without progressing to "All workers started".

### Pitfall 3: SSRF Guard Throws on DNS Resolution Failure for Valid Hosts
**What goes wrong:** `guardUrl` throws `DNS resolution failed for hostname` for a valid HTTPS URL, blocking job creation.
**Why it happens:** DNS resolution in the SSRF guard requires the host to be resolvable from the machine running the API. In restrictive network environments (no outbound DNS, firewall rules), `dns.resolve4` and `dns.lookup` both fail.
**How to avoid:** Confirm DNS works from the API container: `nslookup google.com` or `node -e "require('dns/promises').resolve4('google.com').then(console.log)"`.
**Warning signs:** SSRF guard logs `warn` with `DNS resolution failed` even for well-known public domains.

### Pitfall 4: `removeJob` Stub Causes Completion Event Refire
**What goes wrong:** After a job completes and `packageJob` succeeds, the `setInterval` loop fires again 2 seconds later, sees `pagesScreenshotted + pagesFailed >= totalExpected` again, and calls `packageJob` a second time on an already-packaged directory.
**Why it happens:** `removeJob` is a stub. `removeJobStats` is never called. The job stays in `activeJobs`.
**How to avoid:** Wire `removeJob` to call `removeJobStats(jobId)` before this phase's work is considered done. This must be the first fix, before any integration testing.
**Warning signs:** Worker logs show "All screenshots done, packaging" for the same jobId twice. ZIP packaging logs run twice. Second run may throw `ZipSizeLimitError` or overwrite the ZIP silently.

### Pitfall 5: Viewport Filter on Queue — HTTP URLs Accepted
**What goes wrong:** `crawlSite` discovers HTTP links, adds them to the queue, `guardUrl` blocks them (correctly), but they consume queue capacity and emit warn logs that obscure real errors.
**Why it happens:** `normalizeUrl` currently allows both `http:` and `https:` protocols (line 12 in `url-normalizer.ts`).
**How to avoid:** Add HTTPS-only protocol filter to `normalizeUrl` so HTTP links are dropped during normalization, never reaching the guard.
**Warning signs:** Worker logs show many `SSRF blocked: ... Only HTTPS URLs are allowed` for discovered internal links — these are not attacks, they are HTTP links on the crawled site.

### Pitfall 6: Browser Pool Race on Concurrent Screenshot Jobs
**What goes wrong:** Multiple screenshot jobs start simultaneously at worker startup. All call `engine.initialize()` (line 20 in `screenshot-worker.ts`). The boolean `initialized` flag in `browser-pool.ts` is not an async mutex — multiple callers enter the init block concurrently, launching multiple Chromium instances.
**Why it happens:** `initialized` is set synchronously at the start of `initialize()` but the actual browser launches are async. Concurrent callers all read `initialized = false` before any sets it.
**How to avoid:** Call `engine.initialize()` once in `services/worker/src/index.ts` after Redis ready, before `startScreenshotWorker()`. Remove the per-job `await engine.initialize()` call, or replace the boolean guard with a promise-based singleton (`initPromise = initPromise || actualInit()`).
**Warning signs:** Worker logs show multiple "Browser pool initialized" lines. Error logs show "Target closed" or "Browser context already closed" on first batch of screenshot jobs.

---

## Code Examples

Verified patterns from source inspection:

### POST /api/jobs — Correct Full Flow (existing, working)
```typescript
// Source: apps/api/src/routes/jobs.ts
router.post('/', jobCreationLimiter, validateBody(createJobSchema), asyncHandler(async (req, res) => {
  const { url, viewports } = req.body;
  await guardUrl(url);          // throws SSRFBlockedError -> 403
  const jobId = uuidv4();
  const job = createJob(jobId, url, viewports);
  await addCrawlJob({ jobId, url, viewports }); // enqueue to Redis
  res.status(201).json({ jobId: job.jobId, status: job.status, createdAt: job.createdAt });
}));
// Returns within 1 second — crawl is async in worker process
```

### Zod Validation Error Shape (existing, correct)
```typescript
// Source: apps/api/src/middleware/validate.ts
// On invalid body, returns:
// HTTP 400
// { error: { code: 'VALIDATION_ERROR', message: 'Invalid request body',
//     details: [{ path: 'url', message: 'Must be a valid URL' }] } }
```

### SSRF Guard — DNS + CIDR Check (existing, correct)
```typescript
// Source: packages/crawler/src/ssrf-guard.ts
// Checks: blocked hostnames, HTTPS protocol, IPv4/IPv6 CIDR ranges including:
// 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16
// 0.0.0.0/8, 100.64.0.0/10, 224.0.0.0/4, 240.0.0.0/4, ::1/128, fc00::/7, fe80::/10
// Throws SSRFBlockedError with hostname + blocked IP for audit logging
```

### removeJob Fix (one-line change)
```typescript
// Source: services/worker/src/screenshot-worker.ts lines 102-104
// Current (broken):
function removeJob(jobId: string): void {
  // Cleanup is handled by broadcast module
}

// Fixed (add import at top, add call in body):
// import { ..., removeJobStats } from './broadcast';
function removeJob(jobId: string): void {
  removeJobStats(jobId);
}
```

### HTTPS-Only Filter in normalizeUrl (one-line change)
```typescript
// Source: packages/crawler/src/url-normalizer.ts line 12
// Current:
if (url.protocol !== 'http:' && url.protocol !== 'https:') {
  return null;
}

// Fixed (HTTPS-only):
if (url.protocol !== 'https:') {
  return null;
}
```

### Browser Pool Init — One-Time Startup Pattern
```typescript
// Source: services/worker/src/index.ts — add before startScreenshotWorker()
// Current: engine.initialize() called inside each job handler
// Fix: call once at startup
import { ScreenshotEngine } from '@screenshot-crawler/screenshot-engine';
const engine = new ScreenshotEngine();
await engine.initialize(); // called once; race-safe
// Then pass engine to startScreenshotWorker(engine) and remove per-job init call
// OR keep the singleton approach but replace boolean guard with initPromise
```

---

## State of the Art

| Old Approach | Current Approach | Status |
|--------------|------------------|--------|
| `waitUntil: 'networkidle'` | `waitUntil: 'load'` | Phase 2 fix — not Phase 1 scope |
| In-memory job stats | Redis HASH persistence | Phase 3 — not Phase 1 scope |
| Boolean `initialized` flag | Promise-based `initPromise` singleton | Phase 1 fix (browser pool race) |
| Empty `removeJob` stub | `removeJobStats(jobId)` called on completion | Phase 1 fix |
| HTTP links normalized and queued | HTTPS-only links accepted | Phase 1 fix |

**Not changing in Phase 1:**
- `waitUntil: 'networkidle'` hang — this is a Phase 2 concern (screenshot quality). Phase 1 does not capture screenshots; it only queues them.
- In-memory job store — acceptable for Phase 1; Redis persistence is Phase 3.
- SSE subscriber initialization race — low-risk for single-user team tool; Phase 3 hardening.

---

## Open Questions

1. **Browser pool init: refactor to accept engine param vs. fix boolean guard in-place**
   - What we know: `ScreenshotEngine` is instantiated at module level in `screenshot-worker.ts` (line 8). Moving init to `index.ts` requires passing the engine instance into `startScreenshotWorker`, which changes the function signature.
   - What's unclear: Whether changing the signature is in scope, or whether an in-place fix (replace boolean with `initPromise` inside `browser-pool.ts`) is cleaner.
   - Recommendation: In-place fix in `browser-pool.ts` is lower-risk and requires no signature changes. Replace `let initialized = false` with `let initPromise: Promise<void> | null = null`. In `initialize()`, do `initPromise = initPromise || actualInit(); await initPromise`. This is a 3-line change.

2. **Should `crawlSite` enforce MAX_PAGES (10,000) explicitly?**
   - What we know: The while-loop condition is `foundPages.length < MAX_PAGES` (line 53). The batch inner check is also `foundPages.length >= MAX_PAGES`. The constant is defined in `packages/utils/src/constants.ts`. CONCERNS.md says "no code checks it" but inspection shows it IS checked. No bug here.
   - What's unclear: Whether the batch-level check prevents over-queuing precisely.
   - Recommendation: No change needed. The MAX_PAGES enforcement is correct.

3. **Does the SSE subscriber need to subscribe to the channel before any worker publishes?**
   - What we know: `subscribeToJob()` in `sse-broadcaster.ts` calls `subscriber?.subscribe(...)` lazily, only when the first SSE client connects. If the crawl completes before a client connects, all events are lost (no subscriber was registered). For Phase 1 this is acceptable — the pipeline still works; progress events are just not streamed.
   - Recommendation: No Phase 1 fix needed. SSE correctness is Phase 2 scope (OUTP-04).

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None detected — no test files, no test runner configured |
| Config file | None — Wave 0 must create |
| Quick run command | `npx vitest run --reporter=verbose` (after Wave 0 setup) |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SECR-01 | `guardUrl` blocks private IPs, link-local, cloud metadata | unit | `npx vitest run packages/crawler/src/ssrf-guard.test.ts` | Wave 0 |
| SECR-01 | `guardUrl` blocks IPv6 private ranges (::1, fc00::, fe80::) | unit | same file | Wave 0 |
| SECR-01 | `guardUrl` throws on HTTP (non-HTTPS) URL | unit | same file | Wave 0 |
| SECR-02 | `sanitizeFilename` rejects `../` traversal patterns | unit | `npx vitest run packages/screenshot-engine/src/sanitize-path.test.ts` | Wave 0 |
| SECR-03 | `POST /api/jobs` with missing `url` returns 400 with descriptive details | unit | `npx vitest run apps/api/src/routes/jobs.test.ts` | Wave 0 |
| SECR-03 | `POST /api/jobs` with HTTP URL returns 400 | unit | same file | Wave 0 |
| SECR-04 | `jobCreationLimiter` config: 20 req / 15 min | unit (config inspection) | same file | Wave 0 |
| PIPE-01 | `POST /api/jobs` with valid HTTPS URL returns 201 + jobId within 1s | integration | `npx vitest run apps/api/src/routes/jobs.test.ts` | Wave 0 |
| PIPE-02 | `crawlSite` returns array of discovered URLs including seed | unit | `npx vitest run packages/crawler/src/index.test.ts` | Wave 0 |
| PIPE-03 | `parseSitemap` returns URLs from urlset XML | unit | `npx vitest run packages/crawler/src/sitemap-parser.test.ts` | Wave 0 |
| PIPE-04 | `RobotsParser.isAllowed` returns false for disallowed path | unit | `npx vitest run packages/crawler/src/robots-parser.test.ts` | Wave 0 |
| PIPE-05 | `normalizeUrl` strips fragment, sorts query, removes trailing slash | unit | `npx vitest run packages/crawler/src/url-normalizer.test.ts` | Wave 0 |
| PIPE-05 | `normalizeUrl` returns null for HTTP URLs | unit | same file | Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run packages/crawler/src/ --reporter=dot`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `vitest` package not installed — `npm install -D vitest` in root or per-workspace
- [ ] `packages/crawler/src/ssrf-guard.test.ts` — covers SECR-01 (8-10 unit cases: private IPv4, private IPv6, link-local, cloud metadata, HTTPS enforce, valid public IP passes)
- [ ] `packages/crawler/src/url-normalizer.test.ts` — covers PIPE-05 (fragment strip, query sort, trailing slash, HTTP reject, cross-origin reject)
- [ ] `packages/crawler/src/robots-parser.test.ts` — covers PIPE-04 (disallow, allow, wildcard agent, no robots.txt)
- [ ] `packages/crawler/src/sitemap-parser.test.ts` — covers PIPE-03 (urlset, sitemapindex, missing sitemap)
- [ ] `packages/crawler/src/index.test.ts` — covers PIPE-02 (mock fetch, verify crawlSite output)
- [ ] `packages/screenshot-engine/src/sanitize-path.test.ts` — covers SECR-02
- [ ] `apps/api/src/routes/jobs.test.ts` — covers PIPE-01, SECR-03, SECR-04 (supertest + mock BullMQ queue)
- [ ] Root `vitest.config.ts` or workspace-level config — shared coverage settings

---

## Sources

### Primary (HIGH confidence)

- Direct source inspection: `apps/api/src/index.ts`, `routes/jobs.ts`, `routes/sse.ts`, `routes/download.ts`, `middleware/validate.ts`, `middleware/rate-limit.ts`, `middleware/error-handler.ts`, `services/job-store.ts`, `services/sse-broadcaster.ts`, `config.ts`, `types/index.ts`
- Direct source inspection: `packages/crawler/src/index.ts`, `ssrf-guard.ts`, `url-normalizer.ts`, `robots-parser.ts`, `sitemap-parser.ts`, `link-extractor.ts`
- Direct source inspection: `services/worker/src/index.ts`, `crawl-worker.ts`, `screenshot-worker.ts`, `broadcast.ts`
- `.planning/codebase/ARCHITECTURE.md` — data flow, component responsibilities
- `.planning/codebase/STACK.md` — version pinning, configuration locations
- `.planning/codebase/CONCERNS.md` — known bugs with file/line references
- `.planning/research/SUMMARY.md` — prior domain research, pitfall analysis

### Secondary (MEDIUM confidence)

- `.planning/REQUIREMENTS.md` — requirement IDs and success criteria
- `.planning/ROADMAP.md` — phase goals and dependency ordering
- `.planning/STATE.md` — recorded decisions and blockers

### Tertiary (LOW confidence)

- None — all claims in this document are backed by direct source inspection.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified by direct source file inspection; no speculation
- Architecture patterns: HIGH — based on reading actual implementation files, not documentation
- Pitfalls: HIGH — each pitfall is backed by specific file + line number references from source inspection
- Validation architecture: MEDIUM — Vitest recommended based on STACK.md noting "no test framework configured"; wave 0 gaps are accurate, but exact vitest config syntax for this monorepo needs verification during wave execution

**Research date:** 2026-03-12
**Valid until:** 2026-06-12 (stable stack; no fast-moving dependencies; valid until next Playwright or BullMQ major version)
