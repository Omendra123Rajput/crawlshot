---
phase: 01-pipeline-foundation
plan: 03
subsystem: testing
tags: [vitest, supertest, express, rate-limiting, zod, integration-tests]

# Dependency graph
requires:
  - phase: 01-pipeline-foundation plan 01
    provides: vitest test framework configured for monorepo workspace
  - phase: 01-pipeline-foundation plan 02
    provides: HTTPS-only enforcement in API routes, working jobs route
provides:
  - Integration test suite for POST /api/jobs covering validation (SECR-03), rate limiting (SECR-04), and job creation (PIPE-01)
  - 14 passing tests in apps/api/src/routes/jobs.test.ts
  - Supertest integration pattern for Express apps in vitest (with config/SSE/queue mocking)
affects: [all subsequent Phase 1 plans that touch jobs route, Phase 2 API development]

# Tech tracking
tech-stack:
  added: [supertest@6.x, @types/supertest]
  patterns:
    - "vi.mock('../config') with PORT=0 to prevent EADDRINUSE in tests that import Express app"
    - "vi.mock('@screenshot-crawler/utils') returning real pino silent logger for pino-http compatibility"
    - "vi.mock('../services/sse-broadcaster') to prevent Redis subscriber creation on module import"
    - "vi.mock('@screenshot-crawler/queue') to prevent real BullMQ/Redis connection"

key-files:
  created:
    - apps/api/src/routes/jobs.test.ts
  modified:
    - package.json (added supertest and @types/supertest devDependencies)
    - package-lock.json

key-decisions:
  - "Mock config with PORT=0 so app.listen() uses OS-assigned port — prevents EADDRINUSE when test process imports index.ts"
  - "Use real pino({level:'silent'}) logger in @screenshot-crawler/utils mock — plain object mock breaks pino-http internals at startup"
  - "Rate limiter verified via presence of ratelimit-limit header in response rather than exhausting 20-request window (slow and flaky)"

patterns-established:
  - "Express integration test pattern: mock config+SSE+queue before importing app, use supertest request(app) directly"
  - "pino-http compatibility: always use real pino({level:'silent'}) in @screenshot-crawler/utils mock, not a plain object"

requirements-completed: [SECR-03, SECR-04, PIPE-01]

# Metrics
duration: 8min
completed: 2026-03-12
---

# Phase 1 Plan 03: API Route Integration Tests Summary

**14-test supertest suite for POST /api/jobs covering zod validation rejection, rate-limit header verification, and 201 job creation with addCrawlJob mock — all three requirements (SECR-03, SECR-04, PIPE-01) covered**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-12T22:40:00Z
- **Completed:** 2026-03-12T22:42:00Z
- **Tasks:** 1 completed (TDD: RED run showed module error, fixed, GREEN passed)
- **Files modified:** 3 (1 created, 2 package files modified)

## Accomplishments
- Created 14-test integration test suite for `POST /api/jobs` using supertest + vitest
- Validated all SECR-03 validation cases: empty body, invalid URL, HTTP URL, empty viewports array, invalid viewport enum value, details array shape, HTTPS mention in error details
- Verified SECR-04 rate limiter: middleware is defined/callable and `ratelimit-limit` header appears on responses
- Confirmed PIPE-01 job creation: 201 status, jobId/status/createdAt string fields, addCrawlJob called with default viewports `['desktop', 'mobile']`
- Established repeatable Express integration test pattern for monorepo (config mock + SSE mock + queue mock)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create API job creation route test suite** - `c2255ac` (test)

## Files Created/Modified
- `apps/api/src/routes/jobs.test.ts` - 14 integration tests for POST /api/jobs; 3 describe blocks (validation, rate-limit, success); mocks for config, SSE, queue, crawler, utils
- `package.json` - Added supertest and @types/supertest devDependencies
- `package-lock.json` - Updated lock file

## Decisions Made
- Mocked `../config` to return `PORT: 0` (OS-assigned) so that `app.listen()` in `index.ts` runs without port conflict during tests; discovered that importing `index.ts` starts the server as a side effect
- Used `pino({ level: 'silent' })` (real pino) in the `@screenshot-crawler/utils` mock instead of a plain object mock — `pino-http` calls `.bindings()` (and iterates `.values()`) on the logger at setup, which plain objects don't implement
- Rate limiter not exhausted in tests (20 req / 15 min window is slow and non-deterministic); instead verified the `ratelimit-limit` HTTP response header is present, which confirms the middleware is applied

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed pino-http logger incompatibility with plain object mock**
- **Found during:** Task 1 (TDD RED run)
- **Issue:** `vi.mock('@screenshot-crawler/utils')` returned a plain object for `logger`; `pino-http` called `logger.bindings().values()` at Express app initialization, causing `TypeError: Cannot read properties of undefined (reading 'values')`
- **Fix:** Changed mock to import real `pino` and return `pino({ level: 'silent' })` — fully compatible logger that suppresses all output
- **Files modified:** `apps/api/src/routes/jobs.test.ts`
- **Verification:** Test runner initialized without error; all 14 tests passed
- **Committed in:** c2255ac (Task 1 commit)

**2. [Rule 3 - Blocking] Added config mock to prevent EADDRINUSE from app.listen()**
- **Found during:** Task 1 (TDD RED run — all tests passed but an unhandled error caused exit code 1)
- **Issue:** `index.ts` calls `app.listen(config.PORT)` on module import; when test process imports app, it attempts to bind port 3001 which may be in use
- **Fix:** Added `vi.mock('../config', ...)` returning `PORT: 0` (OS-assigned ephemeral port) before the app import; `app.listen(0)` always succeeds
- **Files modified:** `apps/api/src/routes/jobs.test.ts`
- **Verification:** No unhandled errors in test output; all 14 tests pass with clean exit
- **Committed in:** c2255ac (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking issue)
**Impact on plan:** Both fixes essential for test correctness. No scope creep. Pre-existing failures in `packages/crawler/src/index.test.ts` (6 tests, RobotsParser mock constructor issue) are out of scope for this plan and documented in deferred-items.

## Issues Encountered
- `packages/crawler/src/index.test.ts` has 6 pre-existing failures (RobotsParser mock not callable as constructor) — verified pre-existing by stashing changes and confirming same failure count. Out of scope for Plan 03.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- API job creation endpoint is now covered by automated integration tests
- All three requirements are tested: validation (SECR-03), rate limiting (SECR-04), job creation (PIPE-01)
- Phase 1 (Pipeline Foundation) has 3/3 plans completed
- The pre-existing `packages/crawler/src/index.test.ts` failures (RobotsParser constructor mock issue) should be addressed before Phase 2

---
*Phase: 01-pipeline-foundation*
*Completed: 2026-03-12*
