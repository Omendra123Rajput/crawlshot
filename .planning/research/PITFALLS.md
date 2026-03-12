# Pitfalls Research

**Domain:** Website screenshot crawler SaaS (Playwright + BullMQ + Redis + Express + Next.js)
**Researched:** 2026-03-12
**Confidence:** HIGH — based on direct codebase inspection combined with verified Playwright, BullMQ, and Node.js community sources

---

## Critical Pitfalls

### Pitfall 1: `networkidle` Hangs Forever on Modern Pages

**What goes wrong:**
`page.goto(url, { waitUntil: 'networkidle' })` waits until there are zero open network connections for 500ms. Pages with WebSockets, Server-Sent Events, analytics polling, chat widgets, or background fetch intervals never reach true network idle. The page.goto call hangs until `PAGE_LOAD_TIMEOUT_MS` fires, burning the retry budget and marking every such page as a failure. This affects a wide slice of modern WordPress and custom sites (live chat, analytics, cookie consent with async loads).

The current `capture.ts` uses `waitUntil: 'networkidle'` as its primary load signal. For any site running Google Analytics, Intercom, Hotjar, or similar, this will reliably time out.

**Why it happens:**
`networkidle` was designed for test suites on controlled pages, not arbitrary third-party sites. The definition "0 connections for 500ms" is impossible to satisfy when a site has a WebSocket or a 30-second analytics heartbeat.

**How to avoid:**
Switch the primary wait strategy to `waitUntil: 'load'` (the DOMContentLoaded + all resources fired), then layer on targeted waits:
1. `page.waitForLoadState('load')` — always safe
2. `page.waitForTimeout(ANIMATION_SETTLE_MS)` — fixed safety buffer (already present)
3. Optional: `page.waitForLoadState('networkidle', { timeout: 3000 })` wrapped in try/catch as a best-effort bonus, not a blocker

This makes captures succeed on 99% of sites instead of timing out on any site with persistent connections.

**Warning signs:**
- Captures reliably fail after exactly `PAGE_LOAD_TIMEOUT_MS` milliseconds
- Pages with chat widgets, analytics, or live feeds always fail
- Worker logs show "Capture hard timeout exceeded" as the dominant error
- All failures cluster at the same timeout value rather than being random

**Phase to address:** Phase 1 (fix broken pipeline) — this is a first-day blocker

---

### Pitfall 2: Browser Pool Never Initialized Before First Capture

**What goes wrong:**
`ScreenshotEngine.initialize()` is called inside the per-job worker handler, but `BrowserPool.initialize()` is gated by an `if (this.initialized) return` guard. Because `startScreenshotWorker()` creates a single `ScreenshotEngine` instance at module load (`const engine = new ScreenshotEngine()`), concurrent screenshot jobs all call `engine.initialize()` simultaneously. The first call starts launching browsers; subsequent concurrent calls skip the guard and proceed to `getBrowser()` before browsers are ready, throwing "Browser pool not initialized."

**Why it happens:**
The `initialized` flag is set to `true` only at the end of `BrowserPool.initialize()`. Concurrent callers that pass the `if (this.initialized) return` check at the top simultaneously enter the initialization loop, launching duplicate browsers, or one caller reads `initialized = false` and proceeds while another is mid-initialization.

**How to avoid:**
Replace the boolean guard with a promise-based singleton pattern:
```typescript
private initPromise: Promise<void> | null = null;

async initialize(): Promise<void> {
  if (!this.initPromise) {
    this.initPromise = this._doInitialize();
  }
  return this.initPromise;
}
```
Also initialize the browser pool once at worker startup (`await engine.initialize()` in `startScreenshotWorker` before the worker is created), not per-job.

**Warning signs:**
- "Browser pool not initialized" errors appearing in worker logs during job startup
- First batch of screenshot jobs always fails, subsequent jobs succeed
- Errors only appear under concurrent load (passes smoke tests, fails on real sites)

**Phase to address:** Phase 1 (fix broken pipeline)

---

### Pitfall 3: In-Memory Job Stats Lost When Worker Restarts

**What goes wrong:**
`broadcast.ts` stores `jobStatsMap` as a plain in-process `Map`. If the worker process crashes or restarts mid-job (OOM kill, unhandled exception, deploy), all stats are lost. The completion check in `screenshot-worker.ts` polls `getActiveJobs()` and `getJobStats()` — if the worker restarts, `jobStatsMap` is empty. The job is orphaned in Redis queues but never completes. The API's job store (also in-memory in `job-store.ts`) loses its records too. The user's SSE stream gets no completion event and the download URL is never generated.

**Why it happens:**
Both the API job store and the worker stats store use in-process Maps. This is fine for a prototype but breaks the moment any process restarts, which happens during normal operation (OOM kills, crashes, hot reload in dev).

**How to avoid:**
- Persist job state in Redis using BullMQ job data or a dedicated Redis hash (`HSET job:{jobId} pagesFound X`), so the worker can reconstruct state on restart
- Alternatively, drive completion detection from the BullMQ queue itself (count `completed` + `failed` jobs in the screenshot queue per jobId) rather than an in-memory counter
- The API job store should at minimum survive worker restarts by reading state from Redis on job status queries

**Warning signs:**
- Jobs that were "crawling" or "capturing" appear stuck forever after any worker restart
- Restarting the worker process during a job causes it to never complete
- Logs show crawl completed and screenshots queued, but no packaging or completion event fires

**Phase to address:** Phase 2 (robustness) — tolerable for first working milestone but must be fixed before the tool is reliable

---

### Pitfall 4: Scroll Trigger Cannot Detect Completion on Infinite-Scroll Pages

**What goes wrong:**
`scroll-trigger.ts` scrolls by `SCROLL_STEP_PX` intervals until `totalHeight >= document.body.scrollHeight`. On infinite-scroll pages (some WordPress themes with lazy post loading), each scroll increments `scrollHeight` by loading more content. The loop never terminates because the target keeps moving. The `page.evaluate` promise runs until the `CAPTURE_HARD_TIMEOUT_MS` fires, consuming the entire capture slot.

More subtly: the scroll finishes but lazy images that load asynchronously haven't finished rendering yet. The `page.waitForTimeout(ANIMATION_SETTLE_MS)` after scroll might not be long enough for all images to decode and paint.

**Why it happens:**
The scroll loop checks `totalHeight >= document.body.scrollHeight`, but `scrollHeight` is dynamic on infinite scroll. The exit condition can never be met if the page keeps growing.

**How to avoid:**
- Cap the scroll loop with a maximum iteration count independent of `scrollHeight`
- Track the previous `scrollHeight` and break early if it hasn't changed after a scroll cycle (page is not infinite)
- After scrolling back to top, add a `waitForLoadState('load', { timeout: 2000 })` or wait for image decode using `page.evaluate(() => Promise.all(Array.from(document.images).filter(i => !i.complete).map(i => new Promise(r => { i.onload = r; i.onerror = r; }))))` before screenshotting

**Warning signs:**
- Captures of any site with infinite scroll (news feeds, product listings) time out at `CAPTURE_HARD_TIMEOUT_MS`
- `scroll-trigger` never returns for pages that keep loading content
- Screenshots cut off content because lazy images hadn't decoded yet

**Phase to address:** Phase 1 (fix broken pipeline) or Phase 2 (pixel-perfect captures)

---

### Pitfall 5: In-Memory Completion Polling Uses `setInterval` Without Cleanup

**What goes wrong:**
`screenshot-worker.ts` starts a `setInterval` that polls every 2 seconds to check if all screenshots for active jobs are done. This interval runs forever — it is never cleared, even after the process closes or after a job completes. For long-running worker processes handling many sequential jobs, this timer checks dead job IDs in `getActiveJobs()` every 2 seconds indefinitely. The `removeJob` function in `screenshot-worker.ts` is empty (the body just has a comment). `removeJobStats` exists in `broadcast.ts` but is never called from `screenshot-worker.ts`.

**Why it happens:**
`removeJob(jobId)` was stubbed but not wired to `removeJobStats`. The job stat map grows without bound. On 500-page sites, each job queues 1000 screenshot jobs (2 viewports), and the polling timer keeps iterating the stats map on every tick.

**How to avoid:**
- Wire `removeJob` to call `removeJobStats(jobId)` from `broadcast.ts`
- Store the `setInterval` return value and clear it on worker shutdown
- Consider replacing the polling approach with a BullMQ job completion event: listen for `worker.on('completed')` and check queue drain state, which is event-driven and does not require polling

**Warning signs:**
- Worker memory increases over time as more jobs are processed
- `getActiveJobs()` returns IDs for jobs that finished hours ago
- The 2-second interval fires but `getActiveJobs()` is always empty (jobs stuck in stats map)

**Phase to address:** Phase 1 (fix broken pipeline) — `removeJob` not being wired is a functional bug preventing proper completion detection

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| In-memory job store (API) | Simple, no Redis schema | Lost on restart, not visible to worker | MVP only — must add persistence before treating as reliable |
| In-memory stats map (worker) | Simple counter | Lost on crash, breaks completion detection | Never — replace with Redis-backed counters |
| `setInterval` completion polling | Easy to implement | Memory leak, event-driven is better | Never — replace with BullMQ event listeners |
| `waitUntil: 'networkidle'` | Looks thorough | Hangs on any modern site with persistent connections | Never on arbitrary third-party sites |
| Single browser pool globally | Avoids re-launch cost | Crashed browser crashes all concurrent captures | Acceptable for local use — add health checks for production |
| Placeholder PNG on capture failure | Keeps ZIP complete | Silent failures — user gets 1x1 blank instead of error | Acceptable only if failures are logged clearly |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Redis Pub/Sub (SSE) | Forgetting to call `subscriber.subscribe()` for new job channels before sending events — events published before subscription are lost | Subscribe to the channel immediately when job is created, before the crawl job is enqueued |
| BullMQ + Redis connection | Using the same `IORedis` connection instance for both BullMQ (which calls `CLIENT SETNAME`) and manual pub/sub commands — commands conflict | Separate connections: one for BullMQ queues, one dedicated subscriber, one dedicated publisher |
| SSE + Express | Not calling `res.flushHeaders()` before the first write — headers are buffered and the client sees no data until the buffer fills | Always call `res.flushHeaders()` immediately after setting SSE headers (already done correctly in `sse.ts`) |
| SSE + Proxies/nginx | Without `X-Accel-Buffering: no`, nginx buffers SSE responses and the client receives events in delayed batches | Already set in `sse.ts` — must be preserved in any nginx config added later |
| Playwright + Windows (dev) | `--disable-dev-shm-usage` is a Linux flag — harmless on Windows but signals the code is Linux-targeted; Chromium sandbox works differently on Windows | Accept the flag is ignored on Windows; do not remove it (needed for Linux/Docker deployment) |
| archiver ZIP + 500+ pages | Adding thousands of screenshot files to an archiver instance without piping the output to disk immediately causes heap OOM | Pipe the archiver output stream to a `fs.createWriteStream` before calling `archive.finalize()`, not after |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| All screenshot jobs queued at once for a 500-page site | Redis queue holds 1000 jobs instantly; worker RAM spikes reading all jobs off the queue | BullMQ handles this acceptably up to ~10k jobs; the real issue is Playwright RAM at concurrency 10 | ~200+ pages with 2 viewports at full concurrency: ~3-4 GB RAM |
| `triggerLazyLoading` blocking one capture slot for the entire scroll duration | At 10 concurrent captures, slow-scrolling pages serialize on a single browser slot | Use a hard iteration cap (e.g., 50 scroll steps max) regardless of page height | Pages taller than `50 * SCROLL_STEP_PX` |
| Browser pool round-robin ignoring browser health | One crashed browser silently receives jobs; captures fail with cryptic errors | Add health check: if `browser.isConnected()` returns false, re-launch that slot | After any capture that crashes the browser process (SIGKILL, OOM) |
| ZIP packaging blocking the event loop | `packageJob` runs inside the polling `setInterval` callback, blocking the Node.js event loop while archiving thousands of files | Ensure archiver uses streaming writes to disk (it does with `fs.createWriteStream`) — verify `archive.finalize()` is awaited properly | ~500+ pages × 2 viewports = ~1000 PNG files in one archive |
| Redis Pub/Sub subscribing to a channel per job never unsubscribing | Redis tracks all subscriptions; long-running processes accumulate subscriptions for completed jobs | `sse-broadcaster.ts` already unsubscribes when the last SSE client disconnects — but if the client never connects, the channel stays subscribed | 100+ concurrent jobs with no browser-side SSE consumer |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| SSRF guard not called before `extractLinks` fetches page HTML | `extractLinks` makes an HTTP request to every discovered URL to parse links — bypasses the SSRF check in `crawlSite` | Current `crawlSite` calls `guardUrl` before `extractLinks` — must be maintained if `extractLinks` is ever called independently |
| Path sanitization not applied to `viewport` parameter in `safePath` | A crafted `viewport` value of `../../etc/passwd` could escape the output directory | `sanitizeFilename` is called on URL; verify `safePath` also sanitizes the `viewport` string (currently passed as-is from job data) |
| Accepting HTTP URLs after redirect | The API validates `url.startsWith('https://')`, but if the target redirects to HTTP, Playwright follows it | Block or detect HTTP redirects in the capture pipeline; Playwright follows redirects by default |
| Large site with 10k pages burning crawler resources indefinitely | No per-domain time limit, only a page count cap | Consider a per-job wall-clock timeout in addition to the page count cap |
| ZIP download without Content-Disposition header | Browser may render ZIP contents instead of downloading | Ensure `download.ts` sets `Content-Disposition: attachment; filename="..."` on the download response |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| SSE stream gives no event when job was already completed before user opened the page | User navigates to a job URL after it finishes; sees a spinner that never resolves | The current `sse.ts` correctly sends the current state immediately on connection — preserve this behavior |
| Progress counter jumps from "crawling" directly to "100% captured" with no intermediate updates | On small sites, crawl completes before the user's browser connects to SSE | The initial state event on SSE connect covers this — but test with a 5-page site to confirm |
| Placeholder PNGs in ZIP with no manifest | User receives a ZIP where some screenshots are 1x1 blank pixels — no way to know which pages failed | Log failures clearly and consider adding a `failures.txt` to the ZIP listing URLs that couldn't be captured |
| Download ZIP filename is just `download` | User downloads the same-named file for every site | Set filename to `crawlshot-{hostname}-{date}.zip` in Content-Disposition |
| No progress when crawl phase is long (large site) | User sees "crawling" with a counter ticking up but no indication of total pages | The current design broadcasts pagesFound as discovered — this is correct; ensure the frontend reflects it |

---

## "Looks Done But Isn't" Checklist

- [ ] **Browser pool initialization:** Does the pool initialize exactly once, even under concurrent calls? Verify with two simultaneous screenshot jobs at startup.
- [ ] **`removeJob` wiring:** `removeJob()` in `screenshot-worker.ts` has an empty body — `removeJobStats` is never called. Job stat map grows forever. Verify stats are cleaned up after each job.
- [ ] **`networkidle` on a real site:** Run a capture against a site with Google Analytics. Does it time out? If yes, the load strategy is broken for 90% of real sites.
- [ ] **Scroll trigger exit condition:** Run a capture on a page with infinite scroll (e.g., WordPress blog with auto-load-more). Does the scroll loop terminate, or does it hit the hard timeout?
- [ ] **ZIP download headers:** Does `GET /api/jobs/:id/download` return `Content-Disposition: attachment` and the correct `Content-Type: application/zip`?
- [ ] **SSE heartbeat:** Leave an SSE connection open for 5 minutes. Does the keep-alive ping fire every 30 seconds? Does the connection survive through a proxy?
- [ ] **`Cannot GET /` is NOT the API root:** The API has no `GET /` handler — only `GET /health`. Any request to `/` returns "Cannot GET /". This is expected. The real diagnostic question is: does `GET /api/jobs` work? Does `POST /api/jobs` work?
- [ ] **Redis required at startup:** `initSSESubscriber` is called synchronously at server startup. If Redis is not running, the subscriber throws and the process may crash or log silently. Verify the API fails clearly with a meaningful error when Redis is unavailable.
- [ ] **Playwright Chromium installed:** `npx playwright install chromium` must run before any capture. If skipped, the browser pool throws on launch with a cryptic "Executable doesn't exist" error.
- [ ] **Viewport parameter sanitized:** In `safePath`, verify that the `viewport` string (`desktop` or `mobile`) is validated against an allowlist before being used in a file path, not passed as raw job data.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| `networkidle` timeouts on real sites | LOW | Change `waitUntil: 'networkidle'` to `'load'` in `capture.ts`; wrap networkidle as optional best-effort |
| Browser pool race condition on init | LOW | Replace boolean flag with promise-based singleton; initialize pool once at worker startup |
| `removeJob` not wired | LOW | One-line fix: call `removeJobStats(jobId)` inside `removeJob` in `screenshot-worker.ts` |
| In-memory stats lost on restart | MEDIUM | Persist counters to Redis hashes; worker reads state from Redis on startup |
| Infinite scroll loop hangs capture | LOW | Add iteration cap to `triggerLazyLoading`; track previous scrollHeight to detect non-infinite pages |
| Jobs orphaned after worker crash | HIGH | Full recovery requires Redis-backed job state; partial fix is making the worker idempotent on restart |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| `networkidle` hangs | Phase 1: Fix Pipeline | Capture against a site with Google Analytics; must complete without timeout |
| Browser pool race condition | Phase 1: Fix Pipeline | Run 10 screenshot jobs simultaneously at worker startup; all must succeed |
| `removeJob` not wired | Phase 1: Fix Pipeline | Complete a job; verify `getActiveJobs()` returns empty afterward |
| Scroll trigger infinite loop | Phase 1 or 2: Pixel-perfect | Capture a WordPress blog with infinite scroll; must complete within 30s |
| In-memory stats lost on restart | Phase 2: Robustness | Kill worker mid-job; restart; verify job eventually resolves or fails cleanly |
| Security: viewport not sanitized | Phase 1 or 2 | Pass `../../etc/passwd` as viewport in a direct Redis job; verify path stays inside output dir |
| archiver heap OOM on large ZIPs | Phase 2: Large site support | Process a 500-page site; verify worker RAM stays below 2GB during packaging |
| SSE connection accumulates dead subscriptions | Phase 2: Robustness | Submit 50 jobs without opening any SSE connection; verify Redis subscription count does not grow unboundedly |

---

## Sources

- Playwright GitHub issues: [networkidle hangs with WebSockets](https://github.com/microsoft/playwright/issues/26487), [infinite waiting on networkidle](https://github.com/microsoft/playwright/issues/19835), [full page screenshot with lazy load](https://github.com/microsoft/playwright/issues/19861)
- Playwright docs: [waitForLoadState](https://playwright.dev/docs/api/class-page#page-wait-for-load-state)
- BullMQ GitHub issues: [memory leak EventEmitter](https://github.com/taskforcesh/bullmq/issues/1614), [OOM with many delayed jobs](https://github.com/taskforcesh/bullmq/issues/1110)
- archiver GitHub issues: [heap OOM with large archives](https://github.com/archiverjs/node-archiver/issues/233), [performance with high file counts](https://github.com/archiverjs/node-archiver/issues/114)
- Playwright memory leak analysis: [Playwright MCP memory fixes 2025](https://markaicode.com/playwright-mcp-memory-leak-fixes-2025/)
- Momentic blog: [Playwright pitfalls](https://momentic.ai/blog/playwright-pitfalls)
- Direct codebase inspection: `packages/screenshot-engine/src/capture.ts`, `browser-pool.ts`, `scroll-trigger.ts`, `services/worker/src/screenshot-worker.ts`, `broadcast.ts`, `apps/api/src/services/sse-broadcaster.ts`

---
*Pitfalls research for: Website screenshot crawler (CrawlShot)*
*Researched: 2026-03-12*
