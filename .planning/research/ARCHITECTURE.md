# Architecture Research

**Domain:** Website Screenshot Crawler SaaS (monorepo, queue-based, real-time progress)
**Researched:** 2026-03-12
**Confidence:** HIGH — all findings derived directly from the existing codebase

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                        PRESENTATION LAYER                            │
│  ┌───────────────────────────────────────────────────────────────┐   │
│  │  apps/web  (Next.js 14, App Router)                          │   │
│  │  page.tsx → ScanForm → api-client.ts → POST /api/jobs        │   │
│  │  dashboard/page.tsx → SSEClient → EventSource stream         │   │
│  │  download-button.tsx → GET /api/jobs/:id/download            │   │
│  └───────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
                                   │ HTTP / SSE
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                          API LAYER                                   │
│  apps/api  (Express 4, :3001)                                        │
│                                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │
│  │ POST /jobs  │  │ GET /jobs/  │  │ GET /jobs/  │                  │
│  │ (create +   │  │ :id/stream  │  │ :id/download│                  │
│  │  enqueue)   │  │ (SSE)       │  │ (ZIP stream)│                  │
│  └──────┬──────┘  └──────┬──────┘  └─────────────┘                  │
│         │                │                                           │
│  ┌──────▼──────┐  ┌──────▼──────────────────────────────────────┐   │
│  │  job-store  │  │  sse-broadcaster                            │   │
│  │  (in-memory │  │  (IORedis subscriber → SSE clients)         │   │
│  │   Map)      │  │  channel: job:{jobId}:events                │   │
│  └─────────────┘  └─────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
         │ BullMQ enqueue (addCrawlJob)         │ Redis Pub/Sub subscribe
         ▼                                      ▼
┌────────────────────────────────┐    ┌────────────────────────────────┐
│          REDIS                 │    │    (same Redis, Pub/Sub)       │
│  Queue: crawl  (concurr: 5)    │    │    channel: job:{jobId}:events │
│  Queue: screenshot (concurr:10)│    └────────────────────────────────┘
└────────────────────────────────┘                  ▲
         │                                          │ publish
         ▼                                          │
┌──────────────────────────────────────────────────────────────────────┐
│                        WORKER LAYER                                  │
│  services/worker  (standalone Node process)                          │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐   │
│  │  crawl-worker  (BullMQ Worker on "crawl" queue)              │   │
│  │  1. initJobStats                                              │   │
│  │  2. crawlSite() → robots.txt → sitemap → BFS link extract    │   │
│  │  3. addScreenshotJob() per page×viewport                     │   │
│  │  4. broadcastToJob() via Redis Pub/Sub                       │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐   │
│  │  screenshot-worker  (BullMQ Worker on "screenshot" queue)    │   │
│  │  1. engine.capture(url, viewport, outputDir)                 │   │
│  │  2. incrementScreenshotted() in jobStatsMap                  │   │
│  │  3. broadcastToJob() progress event                          │   │
│  │  4. setInterval(2s): detect completion → packageJob() → ZIP  │   │
│  └───────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
         │ uses                          │ uses
         ▼                              ▼
┌───────────────────────┐    ┌──────────────────────────────────────────┐
│  packages/crawler     │    │  packages/screenshot-engine              │
│  - ssrf-guard.ts      │    │  - browser-pool.ts  (max 10 Chromium)    │
│  - robots-parser.ts   │    │  - capture.ts  (navigate→scroll→settle→  │
│  - sitemap-parser.ts  │    │    screenshot)                           │
│  - link-extractor.ts  │    │  - scroll-trigger.ts  (lazy-load scroll) │
│  - url-normalizer.ts  │    │  - sanitize-path.ts  (path guard)        │
└───────────────────────┘    └──────────────────────────────────────────┘
         │                              │
         ▼                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      SHARED PACKAGES                                │
│  packages/queue    — BullMQ queue defs, Redis connection singleton  │
│  packages/storage  — file-writer.ts, zip-packager.ts (archiver)     │
│  packages/utils    — constants, logger (pino), retry (exp backoff)  │
└─────────────────────────────────────────────────────────────────────┘
                              │ writes to
                              ▼
                   $SCREENSHOT_PATH/{jobId}/
                   ├── desktop/   (PNG files)
                   └── mobile/    (PNG files)
```

### Component Responsibilities

| Component | Responsibility | Implementation |
|-----------|----------------|----------------|
| `apps/web` | UI: submit URL, show real-time progress via SSE, trigger download | Next.js 14 App Router, React components, EventSource |
| `apps/api` | HTTP API: create jobs, stream SSE, serve ZIP download | Express 4, in-memory job-store Map, IORedis Pub/Sub subscriber |
| `services/worker` | Execute crawl + screenshot work off queues | BullMQ Worker (two queues), holds in-memory jobStatsMap |
| `packages/crawler` | Discover all internal URLs safely | BFS with robots.txt/sitemap.xml, SSRF DNS guard, rate-throttled |
| `packages/screenshot-engine` | Capture pixel-perfect full-page PNGs | Playwright Chromium pool (round-robin), scroll trigger, settle delay |
| `packages/queue` | BullMQ queue definitions + shared Redis connection | ioredis singleton, type-safe job data interfaces |
| `packages/storage` | Write screenshots to disk; package ZIP | fs/promises writes with path-traversal guard, archiver (zlib 6) |
| `packages/utils` | Shared constants, logger, retry | pino logger, exponential backoff, VIEWPORTS config, all timeouts |
| Redis (external) | Job queue backing store + Pub/Sub event bus | Two roles: BullMQ queue storage AND inter-process event channel |

## Recommended Project Structure

```
site-screenshots-cc/
├── apps/
│   ├── api/src/
│   │   ├── config.ts              # Env var validation + defaults
│   │   ├── index.ts               # Express app bootstrap, SSE init
│   │   ├── middleware/
│   │   │   ├── cors.ts            # CORS for Next.js origin
│   │   │   ├── error-handler.ts   # Central Express error handler
│   │   │   ├── rate-limit.ts      # General + job-creation limiters
│   │   │   └── validate.ts        # Zod body validation middleware
│   │   ├── routes/
│   │   │   ├── jobs.ts            # POST/GET /api/jobs
│   │   │   ├── sse.ts             # GET /api/jobs/:id/stream
│   │   │   └── download.ts        # GET /api/jobs/:id/download
│   │   └── services/
│   │       ├── job-store.ts       # In-memory Map: jobId → JobRecord
│   │       └── sse-broadcaster.ts # Redis subscriber → SSE client fanout
│   └── web/
│       ├── app/
│       │   ├── layout.tsx         # Root layout, global CSS
│       │   ├── page.tsx           # Home: URL submission form
│       │   └── dashboard/page.tsx # Job list + progress view
│       ├── components/
│       │   ├── animated-shader-background.tsx  # THREE.js WebGL bg
│       │   ├── scan-form.tsx                   # URL input, submit
│       │   ├── job-progress.tsx                # SSE-driven progress bar
│       │   ├── screenshot-grid.tsx             # Preview grid
│       │   └── download-button.tsx             # ZIP download trigger
│       └── lib/
│           ├── api-client.ts      # Typed fetch wrappers for API
│           └── sse-client.ts      # EventSource wrapper + event parsing
├── services/
│   └── worker/src/
│       ├── index.ts               # Process entry: connect Redis, start workers
│       ├── crawl-worker.ts        # BullMQ Worker on "crawl" queue
│       ├── screenshot-worker.ts   # BullMQ Worker on "screenshot" queue
│       └── broadcast.ts           # jobStatsMap + Redis Pub/Sub publish
├── packages/
│   ├── crawler/src/
│   │   ├── ssrf-guard.ts          # DNS resolve + CIDR block check
│   │   ├── robots-parser.ts       # robots.txt fetch + isAllowed()
│   │   ├── sitemap-parser.ts      # sitemap.xml → URL list
│   │   ├── link-extractor.ts      # HTML parse → internal links
│   │   ├── url-normalizer.ts      # Canonicalize URLs
│   │   └── index.ts               # crawlSite() orchestrator
│   ├── screenshot-engine/src/
│   │   ├── browser-pool.ts        # Chromium pool (round-robin, max 10)
│   │   ├── capture.ts             # capturePage() with retry + placeholder
│   │   ├── scroll-trigger.ts      # triggerLazyLoading() scroll sequence
│   │   ├── sanitize-path.ts       # safePath() path-traversal guard
│   │   └── index.ts               # ScreenshotEngine class facade
│   ├── queue/src/
│   │   ├── redis-connection.ts    # ioredis singleton
│   │   ├── crawl-queue.ts         # CrawlQueue + addCrawlJob()
│   │   ├── screenshot-queue.ts    # ScreenshotQueue + addScreenshotJob()
│   │   └── index.ts               # Re-exports + job data types
│   ├── storage/src/
│   │   ├── file-writer.ts         # getJobOutputDir(), safe mkdir
│   │   ├── zip-packager.ts        # packageJob() → archiver ZIP
│   │   └── index.ts               # Re-exports
│   └── utils/src/
│       ├── constants.ts           # MAX_PAGES, timeouts, viewports, queue names
│       ├── logger.ts              # pino instance
│       ├── retry.ts               # Exponential backoff helper
│       └── index.ts               # Re-exports
└── docker-compose.yml             # Redis service definition
```

### Structure Rationale

- **apps/ vs services/** — `apps/` contains user-facing network servers (API + web); `services/` contains the background worker which is neither a user-facing HTTP server nor a library.
- **packages/** — Pure library packages with no server bootstrap. Consumed by both `apps/api` and `services/worker` via npm workspace symlinks, which is why shared types and constants live here rather than in either app.
- **packages/utils as foundation** — All other packages depend on `utils`. This must be the first package built in any build pipeline.

## Architectural Patterns

### Pattern 1: Fan-out Queue (Crawl → Screenshot)

**What:** The crawl job produces N×V screenshot jobs (N pages × V viewports) and enqueues them all into the screenshot queue before any screenshot work begins.

**When to use:** When upstream work (crawling) and downstream work (capturing) have different concurrency characteristics and the total item count is not known upfront.

**Trade-offs:** Simple to reason about. The downside is that for a 10k-page site with 2 viewports, 20,000 jobs are enqueued into Redis at once. Redis memory and BullMQ job record overhead become a factor at scale.

```typescript
// In crawl-worker.ts — after crawlSite() completes:
for (const pageUrl of pages) {
  for (const viewport of viewports) {
    await addScreenshotJob({ jobId, url: pageUrl, viewport, outputDir });
  }
}
// Screenshot queue then processes all 20k jobs at concurrency=10
```

### Pattern 2: Redis Pub/Sub as Inter-Process Event Bus

**What:** The worker process (which runs BullMQ jobs) cannot write directly to SSE connections held open by the API process. Instead it publishes events to a Redis channel (`job:{jobId}:events`). The API's IORedis subscriber picks these up and fans them out to connected SSE clients.

**When to use:** Any time two separate Node processes need to push real-time events to HTTP clients. This avoids the need for a shared in-memory state between processes.

**Trade-offs:** Clean separation of concerns. Introduces one extra hop (worker → Redis → API → browser). Events are fire-and-forget — if no SSE subscriber is listening, the event is dropped (acceptable here because the job-store persists last-known state for reconnecting clients).

```typescript
// In worker: broadcast.ts
redis.publish(`job:${jobId}:events`, JSON.stringify({ event: 'progress', ... }));

// In API: sse-broadcaster.ts
subscriber.on('message', (channel, message) => {
  const jobId = channel.match(/^job:(.+):events$/)[1];
  broadcastToClients(jobId, JSON.parse(message));
});
```

### Pattern 3: Isolated Browser Contexts per Capture

**What:** Each screenshot is taken in a fresh `browser.newContext()` with `permissions: []`, closed in `finally`. The browser instance itself is reused from the pool (round-robin), but the context — and therefore cookies, storage, and permissions — is never shared between captures.

**When to use:** Required for security isolation and to prevent state leaking between pages (auth cookies, localStorage data, WebSocket connections).

**Trade-offs:** Context creation overhead (~10-50ms) on every capture. Acceptable given captures themselves take several seconds for network idle + scroll + settle.

```typescript
const context = await browser.newContext({
  viewport, userAgent: BROWSER_USER_AGENT,
  permissions: [], acceptDownloads: false,
});
try {
  const page = await context.newPage();
  // ... navigate, scroll, settle, screenshot
} finally {
  await context.close(); // Always closes even on error
}
```

### Pattern 4: Polling-based Completion Detection (setInterval)

**What:** The screenshot worker uses a `setInterval(2000)` to check whether all expected screenshots for a job have finished (completed + failed >= total expected). When true, it triggers ZIP packaging and broadcasts the `complete` event.

**When to use:** When BullMQ job completion events from different queue workers need to be aggregated — there is no built-in "all N jobs done" primitive in BullMQ.

**Trade-offs:** Simple. The 2-second polling interval means completion is detected with up to 2s latency after the last screenshot. The in-memory `jobStatsMap` means this state is lost if the worker crashes mid-job — restart would leave jobs orphaned. For a single-process local tool this is acceptable.

## Data Flow

### Job Submission Flow

```
User enters URL in ScanForm
    │ POST /api/jobs { url, viewports }
    ▼
Express: validate (zod) → SSRF guard (DNS check) → createJob() → addCrawlJob()
    │ returns { jobId, status: 'pending' }
    ▼
Frontend navigates to /dashboard?jobId=xxx
    │ GET /api/jobs/:jobId/stream   (EventSource)
    ▼
API: sets SSE headers, sends initial state, calls subscribeToJob()
    │ subscriber.subscribe('job:{jobId}:events')
    ▼
[Waiting for worker events...]
```

### Crawl Phase Flow

```
BullMQ dequeues crawl job
    ▼
crawl-worker: initJobStats → broadcastToJob(crawling)
    ▼
crawler.crawlSite():
  1. robots.txt fetch
  2. sitemap.xml seed
  3. BFS loop (batch=5, throttle=2req/s):
     - SSRF guard per URL
     - node-html-parser link extraction
     - onPageFound callback → broadcastToJob(progress)
    ▼
For each page × viewport: addScreenshotJob()
    ▼
broadcastToJob(capturing, pagesFound=N)
```

### Screenshot Phase Flow

```
BullMQ dequeues screenshot job (concurrency=10)
    ▼
screenshot-worker:
  1. engine.initialize() (idempotent, starts browser pool once)
  2. engine.capture(url, viewport, outputDir):
     a. getBrowserPool().getBrowser()  — round-robin
     b. browser.newContext(viewport, noPerms)
     c. page.goto(url, waitUntil:'networkidle', timeout:30s)
     d. page.waitForLoadState('domcontentloaded')
     e. triggerLazyLoading()  — scroll step-by-step, wait
     f. page.waitForTimeout(2000)  — animation settle
     g. page.screenshot({ fullPage:true, type:'png' })
     h. context.close()
  3. incrementScreenshotted(jobId)
  4. broadcastToJob(progress)
    ▼
setInterval(2s): if screenshotted+failed >= pagesFound×viewports:
    ▼
packageJob(jobId, domain):
  1. archiver ZIP of {jobDir}/desktop/ + {jobDir}/mobile/
  2. size check against MAX_ZIP_SIZE_MB (abort if exceeded)
  3. writes to {jobDir}/{domain}-screenshots.zip
    ▼
broadcastToJob({ event:'complete', downloadUrl:'/api/jobs/:id/download' })
```

### SSE Event → Browser Flow

```
Worker: redis.publish('job:{jobId}:events', JSON.stringify(event))
    ▼
API IORedis subscriber receives message
    ▼
sse-broadcaster:
  1. updateJobStats / setJobStatus in job-store (for reconnect recovery)
  2. broadcastToClients() → res.write('data: {...}\n\n') for each SSEClient
    ▼
Browser EventSource receives data frame
    ▼
React component updates progress bar / triggers download button
```

### Download Flow

```
User clicks Download (or auto-triggered on 'complete' event)
    │ GET /api/jobs/:jobId/download
    ▼
API: locate ZIP at $SCREENSHOT_PATH/{jobId}/{domain}-screenshots.zip
    │ res.setHeader('Content-Disposition', 'attachment')
    │ fs.createReadStream(zipPath).pipe(res)
    ▼
Browser receives ZIP file
```

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1-10 concurrent jobs | Current architecture is sufficient. Single worker process, single Redis instance, local disk storage. |
| 10-50 concurrent jobs | Browser pool exhaustion becomes the bottleneck (max 10 Chromium instances). Add worker process replicas; note jobStatsMap must move to Redis or a shared store to support multi-worker completion detection. |
| 50+ concurrent jobs | In-memory job-store in API becomes a reliability risk. Disk storage needs to become object storage (S3). ZIP packaging in-process blocks; move to a separate queue step. |

### Scaling Priorities for This Project

1. **First bottleneck — browser pool:** 10 browsers × one context at a time = 10 concurrent captures. At screenshot concurrency=10, the pool is exactly saturated. Increasing SCREENSHOT_CONCURRENCY without increasing browser count causes "pool not initialized" races. Fix: match pool size to concurrency setting.

2. **Second bottleneck — in-memory jobStatsMap in worker:** Restart of the worker process drops all in-flight job accounting. Completion detection (setInterval) will never fire for those jobs. Fix: persist job stats to Redis HASH so recovery is possible.

3. **Third bottleneck — in-memory job-store in API:** API restart drops all job records. SSE clients receive a 404 on reconnect. Fix: back job-store with Redis or SQLite.

## Anti-Patterns

### Anti-Pattern 1: Calling engine.initialize() Inside the Job Handler

**What people do:** `await engine.initialize()` is called inside the BullMQ job processor function, which runs for every screenshot job.

**Why it's wrong:** `initialize()` has an `if (this.initialized) return` guard, so it is safe to call repeatedly — but it introduces a subtle risk. If the guard is ever bypassed (e.g., after a pool close/reopen cycle), it would launch a new fleet of Chromium browsers for every job, exhausting system memory rapidly.

**Do this instead:** Call `engine.initialize()` once at worker startup (in `index.ts`, after Redis is ready), before the BullMQ worker starts processing jobs.

### Anti-Pattern 2: setInterval Completion Detection Tied to Worker In-Memory State

**What people do:** The screenshot-worker uses a global in-process `jobStatsMap` and a `setInterval` to detect when all screenshots for a job are done.

**Why it's wrong:** If the worker restarts mid-job, `jobStatsMap` is empty and the interval will never detect completion for in-flight jobs. The job hangs indefinitely from the user's perspective.

**Do this instead:** Persist job counters to a Redis HASH (HINCRBY). The completion check can query Redis directly, making it restart-safe and multi-worker-safe.

### Anti-Pattern 3: Skipping SSRF Guard on Any Playwright Navigation

**What people do:** Adding a "fast path" that skips `guardUrl()` for URLs discovered during crawling (since they came from a trusted seed URL).

**Why it's wrong:** Crawled sites can contain redirect chains (301/302) or meta-refresh tags that ultimately point to private IP ranges. The SSRF guard must run on every URL before Playwright navigates to it, not just on the seed URL.

**Do this instead:** Run `guardUrl()` inside `crawlSite()` for every URL before it is added to `foundPages` (already done in the current implementation — must not be removed).

### Anti-Pattern 4: Full-Page Screenshot Without Scroll Trigger

**What people do:** Call `page.screenshot({ fullPage: true })` immediately after `networkidle`.

**Why it's wrong:** Many modern sites use IntersectionObserver-based lazy loading. Content below the fold only loads when scrolled into view. A `fullPage` screenshot without scrolling captures blank placeholders instead of real images.

**Do this instead:** After `networkidle`, execute `triggerLazyLoading()` (step-scroll with pauses) before `waitForTimeout(ANIMATION_SETTLE_MS)` and the final screenshot call. This is the current implementation — it must not be simplified away.

### Anti-Pattern 5: Sharing Browser Contexts Across Captures

**What people do:** Reuse a persistent browser context across multiple page captures to avoid context creation overhead.

**Why it's wrong:** Shared contexts accumulate cookies, localStorage, cached credentials, and WebSocket connections. One page's JavaScript can pollute the next capture's environment. Security boundaries are violated.

**Do this instead:** Create a new context per capture with `permissions: []`, `acceptDownloads: false`, and no geolocation. Close in `finally`. Current implementation correctly does this.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Redis | ioredis singleton in `packages/queue`; separate IORedis instance for SSE subscriber in API | Two roles: BullMQ queue backend AND Pub/Sub. The queue connection uses `maxRetriesPerRequest: null` (required by BullMQ); the SSE subscriber uses a separate connection. |
| Playwright Chromium | Browser pool in `packages/screenshot-engine`; launched headless with `--no-sandbox` flags | Chromium binary installed separately via `npx playwright install chromium`. Not bundled in node_modules. |
| Filesystem | Screenshots written to `$SCREENSHOT_PATH/{jobId}/{viewport}/` by worker; ZIP served from same path by API | Path must be accessible by both worker and API processes. In Docker, this requires a shared volume. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `apps/web` ↔ `apps/api` | HTTP REST (POST/GET) + SSE (EventSource) | CORS restricted to `ALLOWED_ORIGINS` env var. API base URL from `NEXT_PUBLIC_API_URL`. |
| `apps/api` ↔ `services/worker` | Redis (BullMQ queues for commands, Pub/Sub for events) | One-way command flow: API → worker via queue. One-way event flow: worker → API via Pub/Sub. |
| `services/worker` ↔ `packages/crawler` | Direct function call (`crawlSite()`) | Crawler runs inside the worker process. Network requests made by crawler are subject to rate throttling (p-throttle, 2 req/s). |
| `services/worker` ↔ `packages/screenshot-engine` | Direct class instantiation (`new ScreenshotEngine()`) | Engine is a singleton per worker process. Browser pool is shared across all concurrent screenshot jobs. |
| Worker ↔ Filesystem | `packages/storage` write functions | `getJobOutputDir()` creates and returns the per-job directory. `packageJob()` reads from it and writes the ZIP. |
| API ↔ Filesystem | Express static file stream on download route | API reads ZIP from disk path. No intermediate buffer — streams directly to HTTP response. |

## Build Order Implications

The package dependency graph determines build order:

```
packages/utils          (no internal deps — build first)
    ↓
packages/queue          (depends on utils)
packages/crawler        (depends on utils)
packages/screenshot-engine (depends on utils)
packages/storage        (depends on utils)
    ↓
services/worker         (depends on queue, crawler, screenshot-engine, storage, utils)
apps/api                (depends on queue, crawler, utils)
    ↓
apps/web                (depends on nothing internal — builds last or in parallel with API)
```

**Turborepo handles this automatically** via the `dependsOn: ["^build"]` in `turbo.json`. When fixing broken packages, fix and build in bottom-up order: utils → shared packages → worker/api → web.

## Sources

- Existing source code: `apps/api/`, `services/worker/`, `packages/*/src/` — HIGH confidence (ground truth)
- CLAUDE.md project documentation — HIGH confidence
- `.planning/PROJECT.md` — HIGH confidence
- BullMQ architecture documentation (patterns consistent with official BullMQ docs for Worker, Queue, and ConnectionOptions patterns) — MEDIUM confidence

---
*Architecture research for: CrawlShot — Website Screenshot Crawler*
*Researched: 2026-03-12*
