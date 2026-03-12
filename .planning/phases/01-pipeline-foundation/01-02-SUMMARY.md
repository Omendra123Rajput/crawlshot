---
phase: 01-pipeline-foundation
plan: 02
subsystem: testing
tags: [vitest, playwright, bullmq, sitemap, crawler, ssrf]

# Dependency graph
requires:
  - phase: 01-pipeline-foundation
    provides: Test infrastructure (vitest config, security module tests from plan 01)

provides:
  - HTTPS-only URL normalization (rejects http: protocol)
  - Race-safe browser pool using initPromise singleton
  - removeJob wired to removeJobStats for job cleanup
  - Crawler pipeline integration test suite (6 tests)
  - Sitemap parser unit test suite (5 tests)

affects:
  - 01-pipeline-foundation (remaining plans)
  - any plan touching browser-pool, screenshot-worker, or url-normalizer

# Tech tracking
tech-stack:
  added: []
  patterns:
    - initPromise singleton for race-safe async initialization
    - Static mock accessors on vi.mock class stubs for per-test reconfiguration

key-files:
  created:
    - packages/crawler/src/index.test.ts
    - packages/crawler/src/sitemap-parser.test.ts
  modified:
    - packages/crawler/src/url-normalizer.ts
    - packages/crawler/src/url-normalizer.test.ts
    - services/worker/src/screenshot-worker.ts
    - packages/screenshot-engine/src/browser-pool.ts

key-decisions:
  - "Use initPromise singleton (not boolean flag) in BrowserPool — concurrent callers await the same promise, eliminating duplicate Chromium launches"
  - "HTTPS-only enforced in url-normalizer (single protocol check) before URLs reach SSRF guard — defense in depth"
  - "Static mock accessors on MockRobotsParser class allow per-test isAllowed behavior changes without re-implementing the class mock"

patterns-established:
  - "initPromise pattern: async initialize() { if (!this.initPromise) this.initPromise = this.doInitialize(); return this.initPromise; }"
  - "Class mock with static accessors: class MockX { static _mockFn = vi.fn(); method = MockX._mockFn; } — enables per-test reconfiguration via module-level reference"

requirements-completed: [PIPE-02, PIPE-03, PIPE-05]

# Metrics
duration: 35min
completed: 2026-03-12
---

# Phase 1 Plan 2: Bug Fixes and Crawler Test Suite Summary

**Three pipeline bugs fixed (HTTPS-only, removeJob stub, browser pool race) plus 11 new crawler tests across sitemap parser and crawlSite function**

## Performance

- **Duration:** 35 min
- **Started:** 2026-03-12T17:07:19Z
- **Completed:** 2026-03-12T17:12:43Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- HTTPS-only filter: url-normalizer now rejects http: protocol URLs at the normalization layer
- removeJob fix: screenshot-worker now imports and calls removeJobStats, ensuring completed jobs are removed from the polling loop
- Browser pool race fix: BrowserPool.initialize() now uses an initPromise singleton — concurrent callers await the same promise, preventing multiple Chromium launches
- 5 sitemap parser tests: urlset extraction, sitemapindex nesting, 404 handling, malformed XML, network errors
- 6 crawlSite integration tests: seed URL, link discovery, deduplication, guardUrl integration, robots.txt exclusion, onPageFound callback

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix HTTPS-only filter, removeJob stub, and browser pool race** - `b8657d6` (fix)
2. **Task 2: Create crawl pipeline and sitemap parser tests** - `dbe231c` (test)

## Files Created/Modified
- `packages/crawler/src/url-normalizer.ts` - HTTPS-only protocol check (`protocol !== 'https:'`)
- `packages/crawler/src/url-normalizer.test.ts` - Updated test to expect null for http: input
- `services/worker/src/screenshot-worker.ts` - Added removeJobStats import and call in removeJob function
- `packages/screenshot-engine/src/browser-pool.ts` - Replaced boolean `initialized` flag with `initPromise` singleton pattern
- `packages/crawler/src/sitemap-parser.test.ts` - New: 5 tests for sitemap XML parsing and error cases
- `packages/crawler/src/index.test.ts` - New: 6 integration tests for crawlSite with mocked dependencies

## Decisions Made
- Used initPromise singleton (not boolean flag) in BrowserPool — concurrent callers await the same promise, eliminating duplicate Chromium launches
- HTTPS-only enforced in url-normalizer before URLs reach SSRF guard — defense in depth layering
- Static mock accessors on MockRobotsParser class allow per-test isAllowed behavior reconfiguration without re-implementing the class mock factory

## Deviations from Plan

None — plan executed exactly as written. The RobotsParser mock required an extra pattern (static accessor on class stub) to handle `vi.clearAllMocks()` resetting the factory, but this is a test implementation detail, not a deviation from planned behavior.

## Issues Encountered
- `vi.clearAllMocks()` in beforeEach reset the `RobotsParser` mock constructor implementation, making it a non-constructor. Resolved by using a class mock with static accessor properties that persist across mock resets.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- All three targeted pipeline bugs closed — queue can now process jobs reliably
- 78 tests passing across 7 test files (full suite green)
- Ready for Plan 03: API route integration tests

---
*Phase: 01-pipeline-foundation*
*Completed: 2026-03-12*
