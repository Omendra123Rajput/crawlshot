# Codebase Concerns

**Analysis Date:** 2026-03-12

## Tech Debt

**In-Memory Job Store (Critical for Production):**
- Issue: Job metadata stored entirely in Node.js memory (Map in `apps/api/src/services/job-store.ts:3`). All jobs lost on API restart. No persistence, no distributed state.
- Files: `./apps/api/src/services/job-store.ts`
- Impact: Users lose all job history. Can't query jobs after server restarts. Single-node API deployment only. Horizontal scaling impossible.
- Fix approach: Migrate to Redis (matching existing Redis infrastructure) or persistent database. Use TTL-based expiration for cleanup.

**Undefined Memory Lifetime for Screenshot Browser Contexts:**
- Issue: Browser contexts created in `packages/screenshot-engine/src/capture.ts:74-81` are closed in finally block, but no explicit memory cleanup or resource pooling strategy beyond basic rotation.
- Files: `./packages/screenshot-engine/src/capture.ts`, `./packages/screenshot-engine/src/browser-pool.ts`
- Impact: Long-running worker could accumulate unreleased Chromium memory over time, especially under load. Risk of OOM with high viewport counts or large pages.
- Fix approach: Monitor memory per context creation. Implement browser instance recycling (restart after N screenshots). Add memory usage logging and alerts.

**Job Completion Detection via 2-second Polling Loop:**
- Issue: Screenshot worker checks job completion with a hardcoded 2000ms interval (`services/worker/src/screenshot-worker.ts:57`). Timing-dependent race condition possible.
- Files: `./services/worker/src/screenshot-worker.ts:57-97`
- Impact: Jobs may not finalize for up to 2 seconds after all screenshots complete. Race condition if stats counters increment between check and packaging. Wastes CPU polling continuously.
- Fix approach: Use BullMQ queue events (completed, failed events per job) or Redis streams instead of polling. Await queue counts or track completion via atomic counter.

**Stateful Job Stats in Worker Memory:**
- Issue: Job statistics maintained in `services/worker/src/broadcast.ts:13` (jobStatsMap) with no cleanup or expiration.
- Files: `./services/worker/src/broadcast.ts:13`
- Impact: Memory leak. Stats accumulate indefinitely. Multiple worker instances can't coordinate (no sync). Lost on restart.
- Fix approach: Store stats in Redis with TTL. Read from shared store during polling. Implement cleanup on job completion.

**No Test Coverage (Zero):**
- Issue: No `.test.ts` or `.spec.ts` files found anywhere in source code. Monorepo lists no test scripts in root `package.json`.
- Files: All package.json files (no test runners configured)
- Impact: Cannot refactor safely. Critical paths untested (SSRF guard, path sanitization, capture pipeline, ZIP packaging). Regressions undetected.
- Fix approach: Add Vitest or Jest. Start with critical security functions. Aim for >80% coverage on packages and API routes.

## Known Bugs

**Job Stats Can Be Null With Fallback Issues:**
- Symptoms: `services/worker/src/broadcast.ts:47-56` returns hardcoded stats when jobId not found instead of throwing error
- Files: `./services/worker/src/broadcast.ts:47-56`
- Trigger: Job completion check runs before stats initialized, or after cleanup but before removal
- Workaround: Logs warn but continue; may show incorrect stats to client briefly

**Premature Cleanup Without Job Notification:**
- Symptoms: `services/worker/src/screenshot-worker.ts:82` calls `removeJob()` but function is a stub (`removeJob(jobId)` does nothing)
- Files: `./services/worker/src/screenshot-worker.ts:102-104`
- Trigger: When ZIP packaging completes or fails, stats deleted but no broadcast cleanup happens
- Workaround: Only affects next polling cycle; doesn't break but leaves stale subscribers

**Browser Pool Concurrency Index Not Thread-Safe:**
- Symptoms: `packages/screenshot-engine/src/browser-pool.ts:41-42` uses modulo increment with no lock
- Files: `./packages/screenshot-engine/src/browser-pool.ts:14, 41-42`
- Trigger: Under extreme load with async concurrent gets, race condition possible (though rare with JavaScript single-thread)
- Workaround: Works in practice due to JS single-threaded event loop, but not future-proof

**ZIP Packaging Size Check Runs Inline During Stream:**
- Symptoms: `packages/storage/src/zip-packager.ts:41-46` aborts archive while data flowing, may not flush completely
- Files: `./packages/storage/src/zip-packager.ts:41-46`
- Trigger: Job with many pages exceeding MAX_ZIP_SIZE_MB size limit
- Workaround: ZIP file may be incomplete or corrupt if size exceeded; user gets ZipSizeLimitError

## Security Considerations

**SSRF Guard: Potential DNS Rebinding Vulnerability:**
- Risk: DNS resolution (`packages/crawler/src/ssrf-guard.ts:55-80`) performed once per URL. Attacker can resolve hostname -> safe IP, then rebind during Playwright navigation.
- Files: `./packages/crawler/src/ssrf-guard.ts:41-92`, `./packages/screenshot-engine/src/capture.ts:94`
- Current mitigation: IP CIDR ranges block private networks. But timing window exists between DNS check and navigation.
- Recommendations:
  - Re-resolve IPs at navigation time in Playwright context
  - Implement DNS TTL respect (check `res.getHeader('cache-control')`)
  - Log all DNS resolution results for audit

**Path Sanitization Double-Check Inconsistency:**
- Risk: `apps/api/src/routes/download.ts:26` and `packages/storage/src/zip-packager.ts:28` both check path traversal, but with different implementations.
- Files: `./apps/api/src/routes/download.ts:25-31`, `./packages/storage/src/zip-packager.ts:28-30`
- Current mitigation: Both use `startsWith()` after resolve, but one in download route is redundant.
- Recommendations: Centralize path validation. Use `packages/screenshot-engine/src/sanitize-path.ts:39-48` (safePath) everywhere.

**No Rate Limiting on Job Query/Download Endpoints:**
- Risk: `/api/jobs/:jobId` (GET) and `/api/jobs/:jobId/download` (GET) have no rate limit. Attacker can enumerate all jobs or brute-force job IDs.
- Files: `./apps/api/src/routes/jobs.ts:66-69`, `./apps/api/src/routes/download.ts:13-73`
- Current mitigation: None. Only POST /api/jobs is rate-limited (`apps/api/src/middleware/rate-limit.ts:3-9`).
- Recommendations: Add rate limit middleware to query and download routes (10-30 req/min per IP). Consider adding job ID obfuscation if sensitive.

**HTTPS-Only Enforcement Missing in Job Crawl:**
- Risk: `services/worker/src/crawl-worker.ts:22` calls `crawlSite()`, which discovers links via `packages/crawler/src/link-extractor.ts`. No validation that discovered links are HTTPS.
- Files: `./services/worker/src/crawl-worker.ts:22`, `./packages/crawler/src/link-extractor.ts:36`
- Current mitigation: Initial URL validated at POST time. But crawled pages can link to HTTP URLs on same domain.
- Recommendations: Filter discovered links in `link-extractor.ts` to HTTPS only, or add config flag for mixed-protocol crawls.

## Performance Bottlenecks

**Playwright Context Lifecycle Overhead:**
- Problem: Each screenshot job creates fresh browser context (`packages/screenshot-engine/src/capture.ts:74`) even though pages on same domain could reuse context.
- Files: `./packages/screenshot-engine/src/capture.ts:66-120`
- Cause: Context isolation for security (permissions: [], no downloads). But creates per-page overhead.
- Improvement path: Implement context reuse pool per domain with 5-10 minute TTL. Isolate with separate user data dir per context.

**Lazy Loading Scroll Triggers Full Document Traversal:**
- Problem: `packages/screenshot-engine/src/scroll-trigger.ts:4-22` scrolls entire page height in loop. For 10k+ page sites, multiplied by 2 viewports = 20k scrolls.
- Files: `./packages/screenshot-engine/src/scroll-trigger.ts`
- Cause: No intelligent detection of lazy-loaded regions. Scrolls naively to bottom every time.
- Improvement path: Detect Intersection Observer usage. Use page.evaluateHandle to find lazy-load boundaries. Add configurable scroll distance.

**10k Page Limit Not Enforced at Crawl Time:**
- Problem: `packages/utils/src/constants.ts:1` defines `MAX_PAGES = 10_000` but no code checks it during crawl.
- Files: `./packages/crawler/src/link-extractor.ts`, `./services/worker/src/crawl-worker.ts:22`
- Cause: Crawl continues indefinitely until network exhausted or timeout. Can queue millions of screenshot jobs.
- Improvement path: Pass MAX_PAGES to crawlSite(). Break early. Return pages count to user before queuing screenshots.

**ZIP Packaging With All Images In Memory:**
- Problem: `packages/storage/src/zip-packager.ts:67-74` calls `archive.directory()` which loads file metadata but archiver streams from disk.
- Files: `./packages/storage/src/zip-packager.ts`
- Cause: Number of directory traversals (desktop + mobile). With 10k pages x 2 viewports = 20k files, readdir can be slow.
- Improvement path: Use async file listing. Stream directory changes via fs.watch(). Implement progress callbacks for large ZIPs.

## Fragile Areas

**Capture Pipeline Hard Timeout Coupling:**
- Files: `./packages/screenshot-engine/src/capture.ts:86-89`
- Why fragile: Hard timeout of 35 seconds (`CAPTURE_HARD_TIMEOUT_MS`) must account for all 5 internal steps (navigate 30s + DOM + scroll + settle 2s + screenshot). If any slow, entire promise race times out with generic message.
- Safe modification: Add distinct timeouts per step. Log which step exceeded limit. Return partial result (placeholder) with error details.
- Test coverage: No tests for timeout scenarios. Need E2E test with slow server.

**SSE Subscriber Initialization Race:**
- Files: `./apps/api/src/index.ts:37`, `./apps/api/src/services/sse-broadcaster.ts:15-20`
- Why fragile: Redis connection initialized after server starts listening. If client connects before Redis ready, subscribeToJob() will fail silently (subscriber is null).
- Safe modification: Wait for subscriber ready in initSSESubscriber(). Return promise. Block server.listen() until Redis online.
- Test coverage: No test for race between HTTP request and Redis initialization.

**Job Store Cleanup Never Happens:**
- Files: `./apps/api/src/services/job-store.ts:3`
- Why fragile: Map grows unbounded. Removing job would require delete() call, but no code calls it. After running 100k jobs, Map consumes significant memory.
- Safe modification: Add Map.clear() on graceful shutdown. Implement TTL-based expiration (24hr or configurable).
- Test coverage: No test for job expiration or cleanup.

**Archive Finalization Without Error Propagation:**
- Files: `./packages/storage/src/zip-packager.ts:76-81`
- Why fragile: Promise.all() resolves even if archive finalization takes time. Errors in archive.finalize() not caught. Download stream might start before finalization complete.
- Safe modification: Await archive.finalize() before resolve. Separate error listener for archive-level errors.
- Test coverage: No test for ZIP finalization or archive errors.

## Scaling Limits

**Redis Pub/Sub Not Persistent (SSE Ordering):**
- Current capacity: Single job, single worker, single API instance = fine. But with load balancer + multiple APIs, different clients may connect to different API instances.
- Limit: If worker publishes to `job:123:events` and client 1 subscribed to API-A while client 2 subscribed to API-B, client 2 never receives messages published before subscription.
- Scaling path: Use Redis streams instead of Pub/Sub. Store last 1000 messages per job. New subscriber can read backlog.

**In-Memory Job Store Does Not Scale to Multiple API Instances:**
- Current capacity: Single API instance only.
- Limit: Horizontal scaling impossible. User query on API-A won't find jobs created on API-B. No load balancer option.
- Scaling path: Move job store to Redis or database. Use sorted sets for timestamp-based queries.

**Screenshot Concurrency Fixed at 10:**
- Current capacity: 10 concurrent Chromium instances. Each context ~50-100MB.
- Limit: 10GB+ memory per worker for large-scale crawls. No dynamic scaling.
- Scaling path: Make SCREENSHOT_CONCURRENCY configurable via env. Implement memory-aware scaling (reduce concurrency if RSS > threshold).

**Crawl Queue Concurrency Fixed at 5:**
- Current capacity: 5 crawl workers per instance.
- Limit: Bottleneck for domains with 100+ pages. Single domain can only crawl 5 pages simultaneously.
- Scaling path: Increase default to 10-15 (CPU-dependent). Or use per-domain queues for fairness.

**No Job Timeout Configuration:**
- Current capacity: Crawl jobs have no timeout. Screenshot jobs have 3 retries with 3sec backoff max.
- Limit: Slow domain crawl can block worker indefinitely. Bad UX: job stuck in "crawling" state forever.
- Scaling path: Add CRAWL_JOB_TIMEOUT_MS env var. Propagate timeout to crawlSite() and retry logic.

## Dependencies at Risk

**Playwright Version Not Pinned to Major Version:**
- Risk: `playwright` dependency may upgrade major version (6.x -> 7.x) with breaking API changes. Browser pool launch args may become incompatible.
- Files: Check `apps/api/package.json`, `packages/screenshot-engine/package.json` (not readable due to size)
- Impact: npm install --update could break entire screenshot pipeline silently.
- Migration plan: Pin to `playwright@^6.0.0` (or current major). Add pre-commit check that verifies browser launch succeeds.

**node-html-parser Unmaintained:**
- Risk: `node-html-parser` has low activity (last update 1+ year ago). Known parsing edge cases with malformed HTML.
- Files: `./packages/crawler/src/link-extractor.ts:1`
- Impact: Crawl may miss links on broken HTML or parse incorrectly on non-ASCII content.
- Migration plan: Evaluate JSDOM or `html-parse-stringify`. Test against top 100 Alexa sites for link discovery accuracy.

**Redis Dependency Not Explicit:**
- Risk: Redis is required (docker-compose.yml in Dockerfile, .env.example shows REDIS_URL) but no npm package explicitly declares it.
- Files: Implicit in `@screenshot-crawler/queue` and worker
- Impact: Clear dependency not obvious to new developers. May deploy without Redis and get cryptic "connection refused" errors.
- Migration plan: Document in README. Consider adding redis client to package.json for local dev (optional). Add startup check in worker.

## Missing Critical Features

**No Manual Job Cancellation:**
- Problem: User can't cancel a crawl/screenshot job in progress. Only option is restart API.
- Blocks: Users stuck with runaway crawls or failed domains. No way to recover resources (Chromium instances, queue slots).
- Implementation: Add DELETE /api/jobs/:jobId. Publish cancel event via Redis. Worker checks for cancellation between screenshots.

**No Crawl/Screenshot Resumption:**
- Problem: If worker crashes mid-job, all screenshots in progress are lost. Must restart entire crawl.
- Blocks: Large crawls (1000+ pages) can't tolerate worker restarts. Expensive to re-crawl.
- Implementation: Checkpoint crawled pages to Redis. Store screenshot job status in queue (BullMQ already tracks this). Resume from last state.

**No Webhook/Notification for Job Completion:**
- Problem: Only SSE polling. No way to notify external system (Slack, email, webhook) when job completes.
- Blocks: Integration with CI/CD pipelines or monitoring systems.
- Implementation: Add webhooks table. POST on job complete/fail events.

**No Search/Filter on Jobs List:**
- Problem: `/api/jobs` returns all jobs unsorted (actually reverse-sorted by date). No pagination.
- Blocks: After 1000+ jobs, response bloats. No way to find specific job without iterating.
- Implementation: Add pagination (limit, offset). Add filters (status, URL pattern, date range).

## Test Coverage Gaps

**SSRF Guard Not Tested:**
- What's not tested: DNS resolution behavior, IPv6 handling, CIDR blocking edge cases, hostname spoofing
- Files: `./packages/crawler/src/ssrf-guard.ts`
- Risk: Regression in blocking logic could expose internal endpoints. DNS rebinding not caught.
- Priority: High

**Path Sanitization Not Tested:**
- What's not tested: Unicode normalization, symlink attacks, null bytes, case sensitivity on Windows
- Files: `./packages/screenshot-engine/src/sanitize-path.ts`
- Risk: Path traversal bug could write screenshots outside job directory, overwriting other jobs' files.
- Priority: High

**Capture Pipeline Error Scenarios Not Tested:**
- What's not tested: Timeout behavior, navigation failures, JavaScript errors on page, memory exhaustion
- Files: `./packages/screenshot-engine/src/capture.ts`, `./services/worker/src/screenshot-worker.ts`
- Risk: Don't know if placeholder PNG is written correctly on failure. Job marked failed but user never notified.
- Priority: High

**Crawl Queue Retry Logic Not Tested:**
- What's not tested: Retry count, backoff timing, final failure handling, retry exhaustion
- Files: `./packages/queue/src/crawl-queue.ts` (attempts: 1 means no retry actually)
- Risk: Transient network errors cause immediate job failure instead of retry.
- Priority: Medium

**SSE Event Streaming Not Tested:**
- What's not tested: Client disconnect handling, message ordering, Redis Pub/Sub message loss, concurrent subscribers
- Files: `./apps/api/src/services/sse-broadcaster.ts`
- Risk: Users miss progress updates. Zombie connections accumulate. Memory leak.
- Priority: Medium

**ZIP Packaging Not Tested:**
- What's not tested: Size limit enforcement, corrupted archives, missing directories, concurrent ZIP operations
- Files: `./packages/storage/src/zip-packager.ts`
- Risk: Download returns 404 if ZIP not found. User blames system but doesn't know packaging failed silently.
- Priority: Medium

---

*Concerns audit: 2026-03-12*
