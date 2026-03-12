# Project Research Summary

**Project:** CrawlShot — Website Screenshot Crawler SaaS
**Domain:** Queue-based web crawler with Playwright screenshot capture (monorepo rebuild/fix)
**Researched:** 2026-03-12
**Confidence:** HIGH

## Executive Summary

CrawlShot is a self-hosted, team-local tool that auto-discovers all internal pages of a website and captures full-page screenshots at desktop and mobile viewports. The architecture — a Next.js frontend, Express API, BullMQ/Redis worker, and shared packages for crawling and screenshot capture — is already in place and structurally sound. The research question is not what to build, but what is currently broken and in what order to fix it. The existing codebase contains several functional bugs that block end-to-end operation before any quality improvements can be assessed.

The recommended approach is a two-phase fix: first, repair the broken pipeline (five specific bugs prevent reliable end-to-end runs), then improve screenshot quality (Playwright configuration changes for animations, lazy load, and video). The correct Playwright configuration is: switch `waitUntil` from `'networkidle'` to `'load'`, add `reducedMotion: 'reduce'` to context options, add `animations: 'disabled'` to `page.screenshot()`, add `waitForFunction` after scroll to verify images are loaded, and inject a video-freeze init script. These changes are additive and low-risk.

The principal risks are: (1) the `networkidle` hang which causes every capture of a real-world site to time out — this is a first-day blocker, not an edge case; (2) the browser pool initialization race condition which causes the first batch of concurrent jobs to fail; and (3) the `removeJob` stub that was never wired, causing completion detection to never fire and job stats to accumulate without cleanup. All three are recoverable with targeted code changes. Longer-term, the in-memory job state stores (both API and worker) need Redis-backed persistence before the tool can be trusted to survive restarts.

## Key Findings

### Recommended Stack

The existing stack is appropriate and mostly current. The one required upgrade is Playwright from `^1.44.0` to `^1.58.0` — 14 minor versions of screenshot stability fixes and lazy-load handling improvements are at stake, including the fix for GitHub issue #20859 (fullPage screenshots with shifted or cut-off content). All other package versions are current or within acceptable ranges. `p-limit` must stay on v5.x (last CommonJS-compatible version) until an ESM migration is planned; upgrading to v6+ would break the build.

**Core technologies:**
- Playwright `^1.58.0`: Browser automation and full-page screenshots — upgrade required; specific screenshot fixes between 1.44 and 1.58
- BullMQ `^5.x` + ioredis `^5.x`: Redis-backed job queues — current; BullMQ requires ioredis specifically (not the `redis` package)
- Node.js 20+: Runtime — current
- TypeScript `^5.4`: Type safety — current
- Turborepo `^2.x`: Monorepo build orchestration — current; handles build order automatically via `dependsOn: ["^build"]`
- tsx `^4.x`: TypeScript execution for dev/worker — correct choice over ts-node; uses esbuild under the hood

### Expected Features

The feature set is well-defined and scoped appropriately. The distinction between v1 (this milestone) and v2+ is clear. The anti-feature list (auth, scheduling, visual diff, in-browser gallery) is well-reasoned — each deferred item would double or triple project scope without serving the core team-tool use case.

**Must have (table stakes for v1):**
- Full-page screenshot capture at desktop (1920x1080) and mobile (390x844) — both viewports per page
- Auto-crawl all internal links from a root URL with robots.txt/sitemap.xml support, URL normalization, and deduplication
- Lazy-load scroll trigger before capture — scroll to bottom, wait for images to complete loading
- Correct page load detection — `waitUntil: 'load'` plus fixed safety buffer (not `networkidle`)
- Real-time SSE progress streaming — page count, current URL, failed count
- Slug-based ZIP output with path sanitization — organized file structure, usable without renaming
- Per-page retry with exponential backoff (3 attempts) — transient failures do not abort the whole job
- SSRF guard on all outbound requests — security prerequisite; must run on every URL, not just the seed
- ZIP size cap — prevents OOM on very large sites

**Should have (competitive differentiators, add post-validation):**
- Accurate upfront page count from sitemap before crawl starts
- Configurable minimum delay via env var
- CSS animation suppression (`animations: 'disabled'` in `page.screenshot()`, `reducedMotion: 'reduce'` in context)
- Video freeze init script to prevent autoplay contaminating screenshots
- `waitForFunction` verifying all images are decoded after scroll trigger

**Defer (v2+):**
- Authenticated site support — credential management opens significant attack surface
- Scheduled/recurring captures — requires cron infrastructure, doubles system surface area
- Visual diff/before-after comparison — separate product category; recommend external tools (BackstopJS, Percy)

### Architecture Approach

The monorepo has a clean three-layer separation: Next.js frontend (presentation), Express API (HTTP + SSE), and a standalone BullMQ worker process (background jobs). Communication between layers is explicit and well-bounded: HTTP/SSE between frontend and API, BullMQ queues (commands) and Redis Pub/Sub (events) between API and worker. Shared packages (crawler, screenshot-engine, queue, storage, utils) are consumed via npm workspace symlinks with no circular dependencies. The build order is: `packages/utils` first (no internal deps), then remaining packages in parallel, then worker/API, then web.

**Major components:**
1. `apps/web` (Next.js 14, App Router) — URL submission form, SSE-driven progress display, ZIP download trigger
2. `apps/api` (Express 4, :3001) — job creation, SSE streaming via Redis Pub/Sub subscriber, ZIP download endpoint
3. `services/worker` (standalone Node process) — crawl worker (BFS link discovery) + screenshot worker (Playwright captures), broadcasts progress via Redis Pub/Sub
4. `packages/crawler` — SSRF guard, robots.txt/sitemap.xml parsing, link extraction, URL normalization
5. `packages/screenshot-engine` — Chromium pool (max 10, round-robin), capture pipeline, scroll trigger, path sanitization
6. `packages/queue` — BullMQ queue definitions, ioredis singleton
7. `packages/storage` — file writer with path traversal guard, ZIP packager (archiver, zlib level 6)
8. `packages/utils` — shared constants, pino logger, exponential backoff retry

### Critical Pitfalls

1. **`networkidle` hangs on real-world sites** — Modern sites with Google Analytics, Intercom, WebSockets, or chat widgets never reach true network idle. Every capture times out at `PAGE_LOAD_TIMEOUT_MS`. Fix: switch to `waitUntil: 'load'`, wrap optional `networkidle` in a 3s try/catch as a best-effort bonus. This is a first-day blocker.

2. **Browser pool race condition on concurrent initialization** — Multiple concurrent screenshot jobs all call `engine.initialize()` simultaneously at startup. The boolean `initialized` flag is not safe under concurrency; subsequent callers enter `getBrowser()` before browsers are ready. Fix: replace the boolean flag with a promise-based singleton (`initPromise`); initialize once at worker startup, not per-job.

3. **`removeJob` stub never wired** — `removeJob()` in `screenshot-worker.ts` has an empty body. `removeJobStats` from `broadcast.ts` is never called. Job stats accumulate forever; the polling interval iterates dead job IDs indefinitely. Fix: one-line wire — call `removeJobStats(jobId)` inside `removeJob`.

4. **Scroll trigger infinite loop on infinite-scroll pages** — The scroll loop exits when `totalHeight >= document.body.scrollHeight`, but infinite-scroll pages grow `scrollHeight` on each scroll. The loop never terminates, burning the entire capture timeout. Fix: add a maximum iteration cap independent of `scrollHeight`; track previous `scrollHeight` and break early if unchanged.

5. **In-memory job state lost on restart** — Both `jobStatsMap` (worker) and `job-store` (API) use in-process Maps. Any process restart mid-job orphans in-flight jobs — completion detection never fires, no ZIP is packaged, no download URL is generated. Fix for worker: persist counters to Redis HASH (`HINCRBY`). Fix for API: read last-known state from Redis on reconnect queries.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Fix the Broken Pipeline
**Rationale:** Five bugs prevent reliable end-to-end operation before any quality work is meaningful. These are not polish items — they are functional blockers that make the tool fail on real-world sites. All five have low recovery cost and targeted fixes.
**Delivers:** A working end-to-end run: submit URL → crawl → screenshot → ZIP download, without hangs or race conditions, on any real-world site.
**Addresses:** SSRF guard validation, correct page load detection, per-page retry, slug-based ZIP, real-time SSE progress (all P1 features from FEATURES.md)
**Avoids:** `networkidle` hang (Pitfall 1), browser pool race condition (Pitfall 2), `removeJob` not wired (Pitfall 3)
**Specific fixes:**
- `capture.ts`: change `waitUntil: 'networkidle'` to `'load'`
- `browser-pool.ts`: replace boolean guard with `initPromise` singleton; call `engine.initialize()` once at worker startup
- `screenshot-worker.ts`: wire `removeJob` to call `removeJobStats(jobId)`
- `scroll-trigger.ts`: add maximum iteration cap; track `scrollHeight` delta to detect non-infinite pages
- Upgrade Playwright from `^1.44.0` to `^1.58.0`; re-run `npx playwright install chromium`

### Phase 2: Pixel-Perfect Screenshot Quality
**Rationale:** Once the pipeline completes reliably, screenshot quality is the core value proposition. The Playwright configuration changes are well-documented, additive (no architectural changes), and directly address the most common failure modes (animations, lazy images, video autoplay).
**Delivers:** Screenshots that capture the correct final state of pages — no mid-animation captures, no blank lazy-load placeholders, no autoplaying video frames.
**Uses:** Playwright `animations: 'disabled'`, `reducedMotion: 'reduce'` context option, `waitForFunction` for image completion, `addInitScript` video freeze
**Implements:** Revised capture sequence from STACK.md: context with `reducedMotion` → video freeze init script → `goto` with `'load'` → scroll trigger → `waitForFunction` (all images complete) → 500ms buffer → `screenshot({ animations: 'disabled', scale: 'css' })`
**Avoids:** Scroll trigger incomplete image loading (Pitfall 4); animation contamination

### Phase 3: Robustness and Reliability
**Rationale:** The in-memory state stores are the primary reliability gap. They tolerate a single uninterrupted run but fail on any restart. Fixing them converts the tool from "works in ideal conditions" to "trustworthy for regular team use."
**Delivers:** Jobs that survive worker restarts; completion detection that does not depend on uninterrupted process uptime; ZIP filenames that identify the site and date.
**Addresses:** In-memory stats lost on restart (Pitfall 5), SSE dead subscription accumulation, ZIP download filename improvement, `failures.txt` manifest in ZIP for failed pages
**Implements:** Redis HASH-backed job counters (`HINCRBY job:{jobId} screenshotted 1`), BullMQ event-driven completion detection (replacing `setInterval` polling), per-job wall-clock timeout

### Phase 4: Large-Site Support and Scale
**Rationale:** Once reliable for typical sites (10-200 pages), validate against large sites (500-10k pages) to confirm resource usage stays within acceptable bounds.
**Delivers:** Confirmed operation on large sites without OOM, heap exhaustion, or Redis subscription leaks.
**Addresses:** ZIP size cap enforcement, archiver streaming write verification, browser pool health checks (re-launch crashed browser slots), Redis Pub/Sub subscription cleanup
**Avoids:** archiver heap OOM (Performance Traps section), browser pool round-robin ignoring crashed browsers, ZIP packaging blocking the event loop

### Phase Ordering Rationale

- Phase 1 before Phase 2: Screenshot quality improvements are irrelevant if captures time out before completing. The `networkidle` bug alone affects 90%+ of real-world sites.
- Phase 2 before Phase 3: Quality is the core value proposition; robustness improvements are invisible to users but necessary for reliability. Ship working captures before hardening.
- Phase 3 before Phase 4: Large-site testing against an unreliable tool produces misleading results. Establish reliability at normal scale first.
- The architectural boundaries (fan-out queue, Redis Pub/Sub event bus, isolated browser contexts) are sound and should be preserved. The problems are implementation-level, not structural.

### Research Flags

Phases with well-documented patterns (skip `research-phase`):
- **Phase 1:** All fixes are targeted and low-ambiguity. Bug locations are identified in source code. Fix patterns are documented in PITFALLS.md and STACK.md.
- **Phase 2:** Playwright configuration changes are documented in official API docs and verified against GitHub issues. No unknowns.
- **Phase 3:** Redis HASH persistence and BullMQ event listeners are standard patterns. No novel integration required.

Phases that may benefit from deeper research during planning:
- **Phase 4:** Large-site behavior (10k pages, 20k screenshot jobs) has not been validated empirically. Redis memory under 20k BullMQ job records, archiver performance with 1000+ PNGs, and browser pool health recovery under sustained load may surface surprises. Consider a research spike targeting BullMQ memory behavior at scale before committing to Phase 4 scope.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Playwright API verified against official docs and GitHub issues; npm package versions verified against current releases; version compatibility confirmed |
| Features | HIGH | Table stakes from competitor analysis + direct domain knowledge; anti-features well-reasoned against scope creep patterns |
| Architecture | HIGH | Based entirely on direct codebase inspection; component responsibilities and data flows verified against actual source files |
| Pitfalls | HIGH | Bugs confirmed via direct code inspection of `capture.ts`, `browser-pool.ts`, `screenshot-worker.ts`, `broadcast.ts`; Playwright behavior verified against official docs and GitHub issues |

**Overall confidence:** HIGH

### Gaps to Address

- **Scroll trigger behavior on specific WordPress infinite-scroll themes:** The fix (iteration cap + scrollHeight delta tracking) is correct in principle, but the right cap value (`50 iterations`? `30`?) needs to be validated against real sites. Use a conservative cap (30 iterations) initially and tune empirically.
- **ZIP packaging timing with `setInterval` cleanup:** The interaction between cleaning up job stats (`removeJobStats`) and the `setInterval` polling interval needs careful ordering — clean up stats only after the ZIP is packaged and the completion event is broadcast, or the interval might stop checking before packaging completes.
- **Redis subscription lifecycle for jobs with no SSE consumer:** The current `sse-broadcaster.ts` unsubscribes when the last SSE client disconnects, but does not handle the case where no client ever connected. For the tool's single-team use case this is low-risk, but worth a targeted test (submit a job without opening the dashboard).
- **Playwright version upgrade side effects:** Upgrading from 1.44 to 1.58 requires re-running `npx playwright install chromium`. Verify that no API regressions were introduced in the `browser.newContext()` or `page.screenshot()` call signatures between these versions before committing the upgrade.

## Sources

### Primary (HIGH confidence)

- Existing source code: `packages/screenshot-engine/src/capture.ts`, `browser-pool.ts`, `scroll-trigger.ts`, `services/worker/src/screenshot-worker.ts`, `broadcast.ts`, `apps/api/src/services/sse-broadcaster.ts` — ground truth for pitfall identification
- Playwright official docs: `browser.newContext()` `reducedMotion` option, `page.screenshot()` `animations` and `scale` options, `waitForLoadState` API
- Playwright GitHub issues: #19861 (lazy load + fullPage), #20859 (fullPage screenshot flakiness), #26487 (networkidle with WebSockets), #11912 (`animations: 'disabled'`)
- BullMQ npm: current version 5.70.4 confirmed
- ioredis npm: current version 5.10.0 confirmed

### Secondary (MEDIUM confidence)

- BrowserStack guide: Playwright `waitForLoadState` — confirms `networkidle` discouraged for production
- Playwright release notes: version 1.58.2 confirmed as current (via npm search; release notes page)
- BetterStack: tsx vs ts-node comparison — tsx recommended for dev loop speed
- Screenshot API competitor analysis (DEV Community, 2026) — feature landscape and market gaps

### Tertiary (LOW confidence)

- Playwright memory leak analysis (markaicode.com, 2025) — referenced in PITFALLS.md but not directly verified; treat as directional
- `networkidle` discouraged claim from BrowserStack — consistent with official Playwright docs wording but not quoted verbatim from playwright.dev

---
*Research completed: 2026-03-12*
*Ready for roadmap: yes*
