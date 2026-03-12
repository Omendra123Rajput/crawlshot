---
phase: 01-pipeline-foundation
plan: 01
subsystem: testing
tags: [vitest, ssrf, path-traversal, robots-txt, url-normalization, dns-mocking]

# Dependency graph
requires: []
provides:
  - vitest test framework configured for monorepo workspace
  - SSRF guard unit tests (12 tests covering private IPv4/IPv6, metadata endpoints, DNS failure)
  - URL normalizer unit tests (17 tests covering fragment, query sort, trailing slash, cross-origin)
  - Robots parser unit tests (12 tests covering disallow/allow rules, longest-match, missing file)
  - Path sanitization unit tests (12 tests covering traversal rejection, valid paths, filename edge cases)
affects: [02-url-https-enforcement, all subsequent Phase 1 plans]

# Tech tracking
tech-stack:
  added: [vitest@4.1.0]
  patterns:
    - vi.mock() for dns/promises and @screenshot-crawler/utils in crawler tests
    - vi.stubGlobal('fetch') for robots parser HTTP tests
    - DNS mock pattern: mock resolve4/resolve6/lookup separately to control IPv4/IPv6 paths

key-files:
  created:
    - vitest.config.ts
    - packages/crawler/src/ssrf-guard.test.ts
    - packages/crawler/src/url-normalizer.test.ts
    - packages/crawler/src/robots-parser.test.ts
    - packages/screenshot-engine/src/sanitize-path.test.ts
  modified:
    - package.json (added "test": "vitest run" script and vitest devDependency)

key-decisions:
  - "Used vi.mock('dns/promises') with separate resolve4/resolve6/lookup mocks to match ssrf-guard.ts DNS fallback chain"
  - "URL normalizer http: test documents current behavior (not a bug fix) — Plan 02 will enforce HTTPS-only"
  - "sanitize-path tests mock MAX_FILENAME_LENGTH from @screenshot-crawler/utils to avoid real pino transport in tests"

patterns-established:
  - "Mock @screenshot-crawler/utils with vi.mock() in all package tests to prevent pino logger from writing to stdout"
  - "Use vi.stubGlobal('fetch') for HTTP-dependent tests rather than node-fetch mocking"
  - "DNS mock tests: set up both resolve4 and resolve6 mock implementations in each test case"

requirements-completed: [SECR-01, SECR-02, PIPE-04, PIPE-05]

# Metrics
duration: 4min
completed: 2026-03-12
---

# Phase 1 Plan 01: Test Infrastructure Setup Summary

**Vitest monorepo test infrastructure with 53 passing tests covering SSRF guard, URL normalization, robots.txt parsing, and path traversal prevention**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-12T17:02:32Z
- **Completed:** 2026-03-12T17:06:14Z
- **Tasks:** 2 completed
- **Files modified:** 6 (4 test files created, vitest.config.ts created, package.json modified)

## Accomplishments
- Installed vitest 4.1.0 as root devDependency; `npx vitest run` works across all workspace packages
- Created 12-test SSRF guard suite: covers all BLOCKED_CIDRS ranges (127.x, 10.x, 172.16.x, 192.168.x, ::1, fc00::), cloud metadata hostnames (169.254.169.254, metadata.google.internal), HTTPS enforcement, DNS failure, and SSRFBlockedError property validation
- Created 17-test URL normalizer suite: fragment stripping, query param sorting, trailing slash normalization, cross-origin rejection, protocol filter (http allowed now — HTTPS enforcement in Plan 02), relative URL resolution
- Created 12-test robots parser suite: disallow rules, allow rules, longest-match precedence, wildcard user-agent, missing/failing robots.txt graceful handling
- Created 12-test path sanitization suite: directory traversal rejection (../), absolute path outside base rejection, valid nested paths accepted, sanitizeFilename URL-to-filename conversion

## Task Commits

Each task was committed atomically:

1. **Task 1: Install vitest and create test configuration** - `eabd353` (chore)
2. **Task 2: Create security and crawler unit test suites** - `a2da86f` (test)

## Files Created/Modified
- `vitest.config.ts` - Workspace-aware vitest config; includes packages/*/src, apps/*/src, services/*/src; node env; 10s timeout
- `package.json` - Added `"test": "vitest run"` script and vitest@^4.1.0 devDependency
- `packages/crawler/src/ssrf-guard.test.ts` - 12 tests for SSRF guard with dns/promises mock
- `packages/crawler/src/url-normalizer.test.ts` - 17 tests for URL normalizer and urlToHash (pure functions, no mocking)
- `packages/crawler/src/robots-parser.test.ts` - 12 tests for RobotsParser with vi.stubGlobal('fetch')
- `packages/screenshot-engine/src/sanitize-path.test.ts` - 12 tests for safePath and sanitizeFilename

## Decisions Made
- Used `vi.mock('dns/promises')` instead of sinon stubs — vitest-native mocking is simpler and more readable
- The `normalizeUrl` http: test intentionally asserts the CURRENT behavior (http allowed) rather than desired behavior; this creates a clear baseline that Plan 02's HTTPS enforcement will break and then fix
- Mocked `@screenshot-crawler/utils` in all tests that import from crawler/screenshot-engine packages to prevent pino's file transport from writing during test runs

## Deviations from Plan

None - plan executed exactly as written. All test files match the specified behaviors. The `sanitize-path.ts` read revealed `safePath` and `sanitizeFilename` exports as expected by the plan.

## Issues Encountered

None. All 53 tests passed green on first run — the existing implementation correctly implements all behaviors that the tests verify.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Test infrastructure is ready: `npx vitest run` or `npm test` from project root runs all tests
- Plan 02 (URL HTTPS enforcement) can now write tests first (TDD RED) before modifying url-normalizer.ts
- The http: protocol test in url-normalizer.test.ts will need to be flipped to expect null after Plan 02 changes
- All 4 security/crawler modules verified by automated tests: SECR-01, SECR-02, PIPE-04, PIPE-05 are covered

---
*Phase: 01-pipeline-foundation*
*Completed: 2026-03-12*
