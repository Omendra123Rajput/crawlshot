# Architecture

**Analysis Date:** 2026-03-12

## Pattern Overview

**Overall:** Distributed queue-based job processing with real-time streaming via SSE. Monorepo architecture (Turborepo + npm workspaces) separating frontend, API layer, background workers, and shared utilities/packages.

**Key Characteristics:**
- Job-based async processing with BullMQ backed by Redis
- Real-time progress streaming via Server-Sent Events (SSE)
- SSRF-protected crawling with browser pool for efficient screenshot capture
- Separation of concerns: frontend, API, worker processes, and reusable packages
- Security-first design with validation, path sanitization, and rate limiting

## Layers

**Frontend (Next.js 14):**
- Purpose: User interface for job submission, real-time progress monitoring, and ZIP download
- Location: `apps/web`
- Contains: React components (Dark-themed glassmorphism, WebGL shader background), SSE client, API client, page routing (App Router)
- Depends on: API endpoints (`/api/jobs/*`), SSE stream (`/api/jobs/:jobId/stream`)
- Used by: End users via browser (localhost:3000 or deployed domain)

**API Server (Express):**
- Purpose: Job CRUD operations, request validation, SSE subscription management, ZIP downloads
- Location: `apps/api/src`
- Contains: Route handlers (jobs, SSE stream, download), middleware (CORS, rate-limit, error handling), job store, SSE broadcaster
- Depends on: BullMQ queues, Redis Pub/Sub, in-memory job store, crawler/storage packages
- Used by: Frontend via HTTP, workers via Redis Pub/Sub channels

**Worker Service (BullMQ):**
- Purpose: Execute long-running crawl and screenshot jobs asynchronously
- Location: `services/worker/src`
- Contains: Crawl worker (link discovery), screenshot worker (Playwright capture), job stats tracking, Redis Pub/Sub broadcaster
- Depends on: Crawler package, screenshot-engine package, storage package, queue definitions
- Used by: API server (enqueues jobs), job clients (monitors progress via Redis Pub/Sub)

**Shared Packages (Reusable Modules):**
- Purpose: Common functionality across API and worker processes
- Location: `packages/*`
- Contains: crawler (link discovery + SSRF guard), screenshot-engine (browser pool + capture), queue (BullMQ definitions), storage (file write + ZIP), utils (logger, constants, retry)
- Depends on: External libraries (playwright, bullmq, archiver, pino)
- Used by: API and worker services, potentially other future services

## Data Flow

**Job Submission Flow:**

1. User submits URL via `ScanForm` component → `POST /api/jobs` (frontend)
2. API validates request (zod schema) + SSRF guard (`guardUrl()`)
3. API generates jobId + creates job record in memory (job-store) + enqueues CrawlJob to Redis queue
4. API returns 201 with jobId immediately
5. Frontend stores jobId, redirects to dashboard, connects SSE to `GET /api/jobs/:jobId/stream`

**Crawl Phase:**

1. Crawl worker picks up CrawlJob from `crawl` queue (concurrency 5, 1 attempt)
2. Worker initializes broadcast stats (`initJobStats`), emits `crawling` event via Redis Pub/Sub
3. Worker calls `crawlSite()` (from crawler package):
   - Fetches robots.txt, parses sitemap.xml, seeds queue with discovered URLs
   - Crawls up to MAX_PAGES (10,000) with rate limiting (2 requests/sec)
   - For each URL: validates with SSRF guard, extracts links, queues new URLs
   - Calls `onPageFound()` callback per discovered page → broadcasts progress event
4. After all pages found, worker enqueues ScreenshotJob for each (page × viewport) combination
5. Worker emits `capturing` event, returns found pages count

**Screenshot Capture Phase:**

1. Screenshot worker picks up ScreenshotJob from `screenshot` queue (concurrency 10, 3 attempts, 3s exponential backoff)
2. Worker calls `engine.capture(url, viewport, outputDir)`:
   - Gets browser from pool (round-robin), creates isolated context
   - Navigates to URL with `waitUntil: 'networkidle'`
   - Triggers lazy-load scrolling + waits for animation settle (2s)
   - Captures full-page screenshot, saves to `outputDir/viewport/sanitized-url.png`
   - On failure: saves placeholder PNG, throws error (3 retries before giving up)
3. On success: broadcasts progress event (increments pagesScreenshotted), stores outputPath
4. Completion loop (every 2s): checks if all screenshots done (pagesScreenshotted + pagesFailed >= totalExpected)
5. When complete: calls `packageJob()` → creates ZIP, broadcasts `complete` event with download URL

**Progress Streaming:**

1. Frontend SSE connection → API `/api/jobs/:jobId/stream` endpoint
2. API sends initial state (current job status + stats)
3. API subscribes to Redis Pub/Sub channel `job:{jobId}:events`
4. Worker broadcasts events → Redis Pub/Sub → API receives → writes `data: {...}\n\n` to SSE response
5. Frontend parses events, updates state (pagesFound, pagesScreenshotted, status)
6. On `complete` or `error` event: SSE connection closes, frontend enables download or shows error

**Download Flow:**

1. User clicks download button → `GET /api/jobs/:jobId/download`
2. API streams ZIP file (with appropriate Content-Type headers)

**State Management:**

- **Job Status:** Stored in-memory in API (job-store.ts as Map<jobId, JobRecord>)
  - Transitions: queued → crawling → capturing → packaging → completed (or failed at any stage)
- **Progress Stats:** Stored per-job in worker broadcast module (in-memory tracking)
  - pagesFound, pagesScreenshotted, pagesFailed updated during job execution
- **Real-time Events:** Redis Pub/Sub channels (`job:{jobId}:events`)
  - Worker publishes events → API subscribes → SSE broadcasts to frontend

## Key Abstractions

**ScreenshotEngine:**
- Purpose: Encapsulates browser pool and capture pipeline
- Examples: `packages/screenshot-engine/src/index.ts`, `capture.ts`, `browser-pool.ts`
- Pattern: Singleton instance pattern (getBrowserPool() returns shared instance), lazy initialization, context-per-capture isolation

**BrowserPool:**
- Purpose: Manages Chromium instances, distributes contexts across browsers, round-robin scheduling
- Examples: `packages/screenshot-engine/src/browser-pool.ts`
- Pattern: Round-robin load balancing, max 10 browsers (configurable), launch args for sandboxing

**Crawler (crawlSite):**
- Purpose: Link discovery with robots.txt/sitemap respecting, SSRF protection
- Examples: `packages/crawler/src/index.ts`, `link-extractor.ts`, `ssrf-guard.ts`
- Pattern: Queue-based BFS, callback-based progress reporting, rate-throttling per domain

**SSRFGuard:**
- Purpose: Blocks DNS resolution to private IPs, link-local, cloud metadata endpoints
- Examples: `packages/crawler/src/ssrf-guard.ts`
- Pattern: DNS resolution (A/AAAA records) + IP range checking (ip-range-check library) against BLOCKED_CIDRS

**JobStore:**
- Purpose: In-memory job state tracking (CRUD operations)
- Examples: `apps/api/src/services/job-store.ts`
- Pattern: Simple Map-based store, no persistence, lost on API restart

**SSEBroadcaster:**
- Purpose: Manages SSE connections and Redis Pub/Sub subscriptions
- Examples: `apps/api/src/services/sse-broadcaster.ts`
- Pattern: Centralized subscriber registry, event forwarding, keep-alive pings every 30s

## Entry Points

**Frontend:**
- Location: `apps/web/app/page.tsx` (home) and `apps/web/app/dashboard/page.tsx` (job tracking)
- Triggers: Browser navigation, user submits URL or checks job status
- Responsibilities: Render UI, collect form input, initiate API requests, connect SSE, display progress

**API Server:**
- Location: `apps/api/src/index.ts`
- Triggers: HTTP requests from browser or curl
- Responsibilities: Validate requests, create jobs, enqueue to Redis, manage SSE subscriptions, serve downloads

**Crawl Worker:**
- Location: `services/worker/src/crawl-worker.ts`
- Triggers: CrawlJob appears in `crawl` queue
- Responsibilities: Execute site crawl, discover pages, enqueue screenshot jobs, broadcast progress

**Screenshot Worker:**
- Location: `services/worker/src/screenshot-worker.ts`
- Triggers: ScreenshotJob appears in `screenshot` queue
- Responsibilities: Capture page screenshots, package ZIP on completion, broadcast progress/completion

## Error Handling

**Strategy:** Multi-layered error handling with graceful degradation

**Patterns:**
- **Request Validation:** Zod schemas validate all incoming requests (POST /api/jobs body). Returns 400 ValidationError.
- **SSRF Guard:** DNS resolution + IP range blocking before any navigation. Returns 403 with code 'URL_BLOCKED'.
- **Screenshot Failure:** Captures max 3 times with exponential backoff (3s base). On final failure: saves placeholder PNG, increments pagesFailed, continues.
- **Worker Failures:** Job failure emits event to frontend, logs error, marks job as failed after max retries.
- **Rate Limiting:** express-rate-limit middleware on job creation (configurable window/max requests).
- **Timeouts:** PAGE_LOAD_TIMEOUT_MS (30s) for navigation, CAPTURE_HARD_TIMEOUT_MS (35s) for entire capture (Promise.race against timeoutPromise).
- **Graceful Shutdown:** SIGTERM/SIGINT handlers close connections cleanly (SSE subscriber, workers, browser pool).

## Cross-Cutting Concerns

**Logging:**
- Framework: Pino logger (configured in packages/utils)
- Pattern: Request logging via pinoHttp middleware in Express. Child loggers with context (jobId, url, viewport).
- Locations: `packages/utils/src/logger.ts` (configured), multiple services log via logger.child()

**Validation:**
- Pattern: Zod schemas for all request bodies. Custom middleware `validateBody()` in `apps/api/src/middleware/validate.ts` applies schema and forwards errors to error handler.
- Locations: `apps/api/src/routes/jobs.ts` (createJobSchema), `apps/web/lib/api-client.ts` (TypeScript types for type safety)

**Authentication:**
- Current: Not implemented (no auth middleware present). All endpoints public.
- Security layer instead: SSRF guard, rate limiting, input validation, path sanitization.

**Path Sanitization:**
- Pattern: `path.resolve() + startsWith()` guard to prevent directory traversal
- Locations: `packages/screenshot-engine/src/sanitize-path.ts` (safePath, sanitizeFilename), `packages/storage/src/file-writer.ts` (validatePath)
- Usage: Applied before all file writes (`fs.writeFile`, `fs.mkdir`)

**Rate Limiting:**
- Framework: express-rate-limit
- Pattern: Separate limiters for general requests (1000 requests/10 min per IP) and job creation (5 jobs/hour per IP, configurable)
- Locations: `apps/api/src/middleware/rate-limit.ts` (generalLimiter, jobCreationLimiter)

**ZIP Packaging:**
- Pattern: archiver library with zlib compression level 6, size capped at MAX_ZIP_SIZE_MB env var
- Locations: `packages/storage/src/zip-packager.ts`
- Flow: packageJob() called after all screenshots → packages directory → throws ZipSizeLimitError if exceeds limit

---

*Architecture analysis: 2026-03-12*
