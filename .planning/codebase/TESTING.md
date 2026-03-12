# Testing Patterns

**Analysis Date:** 2026-03-12

## Current State

**No testing framework is configured in this codebase.** All test-related tools (Jest, Vitest, Mocha) are absent from package.json files across all workspaces.

- `apps/api/package.json`: No test dependencies
- `apps/web/package.json`: No test dependencies
- `services/worker/package.json`: No test dependencies
- All packages: No test dependencies

**Test files:** No `.test.ts`, `.test.tsx`, `.spec.ts`, or `.spec.tsx` files exist in the codebase.

## Recommended Testing Setup

Based on the technology stack and project structure, here is the recommended approach for adding tests:

### Test Framework

**Recommended: Vitest**
- Reason: Native TypeScript support, fast HMR, compatible with Playwright (already used)
- Install in workspace root as dev dependency:
  ```bash
  npm install -D vitest @vitest/ui @vitest/coverage-v8
  ```

**Alternative: Jest**
- Reason: Industry standard, mature ecosystem
- Would require `ts-jest` and additional config overhead

### Assertion Library

**Recommended: Vitest built-in (no additional dependency)**
- Vitest includes `expect()` and assertion utilities by default
- Alternatively, add `@testing-library/react` for component testing if needed

### Mocking

**Recommended: Vitest Mock Framework (built-in)**
- Use `vi.mock()` for module mocking
- Use `vi.spyOn()` for function spying
- Redis mocking: Use `ioredis-mock` package for queue tests
- Playwright mocking: Mock Playwright context/page objects with minimal setup

### Run Commands (When Implemented)

```bash
npm run test                # Run all tests
npm run test:watch         # Watch mode with HMR
npm run test:coverage      # Generate coverage report
npm run test:ui            # Open Vitest UI dashboard
```

---

## Suggested Test Structure (Not Yet Implemented)

### Test File Organization

**Location:** Co-located with source code

```
apps/api/src/
├── routes/
│   ├── jobs.ts
│   └── jobs.test.ts          # Test file next to source
├── middleware/
│   ├── validate.ts
│   └── validate.test.ts
└── services/
    ├── job-store.ts
    └── job-store.test.ts

packages/crawler/src/
├── ssrf-guard.ts
├── ssrf-guard.test.ts        # Critical security tests
├── link-extractor.ts
└── link-extractor.test.ts
```

**Naming:** `[name].test.ts` for all test files

### Test Structure Pattern

**Suggested structure based on project patterns:**

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { guardUrl, SSRFBlockedError } from './ssrf-guard';

describe('guardUrl', () => {
  describe('HTTPS requirement', () => {
    it('should reject non-HTTPS URLs', async () => {
      await expect(guardUrl('http://example.com')).rejects.toThrow('Only HTTPS URLs are allowed');
    });

    it('should accept HTTPS URLs', async () => {
      await expect(guardUrl('https://example.com')).resolves.not.toThrow();
    });
  });

  describe('SSRF blocking', () => {
    it('should block localhost', async () => {
      await expect(guardUrl('https://localhost')).rejects.toThrow(SSRFBlockedError);
    });

    it('should block private IP ranges', async () => {
      // Test setup with DNS mock
      vi.stubGlobal('fetch', async () => ({ ok: true }));
      await expect(guardUrl('https://192.168.1.1')).rejects.toThrow(SSRFBlockedError);
    });
  });
});
```

### Mocking Patterns

**Redis/Queue Mocking:**
```typescript
import { describe, it, beforeEach, vi } from 'vitest';
import { getCrawlQueue, addCrawlJob } from '@screenshot-crawler/queue';
import Redis from 'ioredis-mock';

describe('CrawlQueue', () => {
  beforeEach(() => {
    // Mock Redis for queue tests
    vi.mock('ioredis', () => ({
      default: () => new Redis(),
    }));
  });

  it('should add crawl job to queue', async () => {
    const queue = getCrawlQueue();
    await addCrawlJob({ jobId: 'test-1', url: 'https://example.com', viewports: ['desktop'] });
    // Assert job added
  });
});
```

**Playwright Mocking:**
```typescript
import { describe, it, beforeEach, vi } from 'vitest';
import { capturePage } from '@screenshot-crawler/screenshot-engine';

describe('capturePage', () => {
  beforeEach(() => {
    // Mock browser pool and page
    vi.mock('./browser-pool', () => ({
      getBrowserPool: () => ({
        getBrowser: () => ({
          newContext: vi.fn().mockResolvedValue({
            newPage: vi.fn().mockResolvedValue({
              goto: vi.fn().mockResolvedValue(null),
              screenshot: vi.fn().mockResolvedValue(null),
              close: vi.fn().mockResolvedValue(null),
            }),
            close: vi.fn().mockResolvedValue(null),
          }),
        }),
      }),
    }));
  });

  it('should capture page and save to disk', async () => {
    const result = await capturePage('https://example.com', 'desktop', '/tmp/screenshots');
    expect(result).toMatch(/\.png$/);
  });
});
```

**Express Middleware Testing:**
```typescript
import { describe, it, expect } from 'vitest';
import { validateBody } from '../middleware/validate';
import { z } from 'zod';

describe('validateBody', () => {
  it('should validate request body against schema', () => {
    const schema = z.object({ name: z.string() });
    const middleware = validateBody(schema);

    const req = { body: { name: 'test' } } as any;
    const res = {} as any;
    const next = vi.fn();

    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('should respond with 400 on validation error', () => {
    const schema = z.object({ name: z.string() });
    const middleware = validateBody(schema);

    const req = { body: { name: 123 } } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    const next = vi.fn();

    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
```

### What to Mock

**Mock these:**
- Redis connections (use `ioredis-mock`)
- Playwright browser/context/page objects
- External HTTP requests (DNS lookups, fetches to third-party sites)
- File system operations (fs.writeFile, fs.mkdir) for non-integration tests
- Timers (vi.useFakeTimers for timeout tests)

**Don't mock these:**
- Express middleware chain (test with actual middleware)
- Zod schema validation (real validation is required)
- Error class constructors
- Logger (real logger calls are safe; check structured logs in assertions)

### Async Testing Pattern

**Recommended for async code:**

```typescript
describe('crawlSite', () => {
  it('should discover pages from sitemap', async () => {
    const pages: string[] = [];
    const discovered = await crawlSite('job-1', 'https://example.com', (url) => {
      pages.push(url);
    });

    expect(discovered).toHaveLength(pages.length);
    expect(pages).toContain('https://example.com/page-1');
  });

  it('should handle DNS resolution failure', async () => {
    await expect(crawlSite('job-1', 'https://invalid-domain-12345.com', () => {})).rejects.toThrow('DNS resolution failed');
  });
});
```

### Error Testing Pattern

**For custom error classes:**

```typescript
describe('SSRFBlockedError', () => {
  it('should construct with hostname and IP', () => {
    const error = new SSRFBlockedError('example.com', '127.0.0.1');

    expect(error.message).toContain('SSRF blocked');
    expect(error.hostname).toBe('example.com');
    expect(error.blockedIp).toBe('127.0.0.1');
    expect(error.name).toBe('SSRFBlockedError');
  });

  it('should be caught as Error instance', () => {
    const error = new SSRFBlockedError('localhost', '127.0.0.1');
    expect(error instanceof Error).toBe(true);
  });
});
```

### Coverage Targets (Recommended)

```bash
# Add to vitest config when implemented
coverage: {
  provider: 'v8',
  reporter: ['text', 'json', 'html'],
  include: ['src/**/*.ts', 'src/**/*.tsx'],
  exclude: ['src/**/*.d.ts', 'src/**/index.ts'],  // Exclude type defs and barrels
  lines: 70,      // Warn below 70%
  functions: 70,
  branches: 60,   // Branches are hard with mocking
  statements: 70,
}
```

---

## Critical Areas for Testing (Priority Order)

1. **Security (MUST TEST)**
   - `packages/crawler/src/ssrf-guard.ts` - SSRF blocking with various IP ranges
   - `packages/screenshot-engine/src/sanitize-path.ts` - Path traversal prevention
   - `packages/storage/src/file-writer.ts` - Path traversal guards in file writes
   - `apps/api/src/middleware/validate.ts` - Request validation with Zod

2. **Core Business Logic**
   - `packages/crawler/src/index.ts` - `crawlSite()` pagination and batching
   - `apps/api/src/routes/jobs.ts` - Job creation, HTTPS enforcement
   - `packages/screenshot-engine/src/capture.ts` - Timeout handling and retry logic

3. **Integration Points**
   - `apps/api/src/services/sse-broadcaster.ts` - Redis Pub/Sub message streaming
   - `services/worker/src/crawl-worker.ts` - Job processing pipeline
   - `packages/queue/src/crawl-queue.ts` - BullMQ job queueing

4. **Data Transformations**
   - `packages/crawler/src/url-normalizer.ts` - URL canonicalization
   - `packages/crawler/src/link-extractor.ts` - HTML parsing and link discovery
   - `packages/storage/src/zip-packager.ts` - ZIP packaging and compression

---

## Fixture/Factory Patterns (Recommended When Implemented)

**Location:** `apps/api/__tests__/fixtures/` and `packages/*/test/fixtures/`

```typescript
// apps/api/__tests__/fixtures/job-fixtures.ts
export function createMockJob(overrides?: Partial<JobRecord>): JobRecord {
  return {
    jobId: 'job-test-123',
    url: 'https://example.com',
    viewports: ['desktop', 'mobile'],
    status: 'queued',
    stats: { pagesFound: 0, pagesScreenshotted: 0, pagesFailed: 0, elapsedMs: 0 },
    error: null,
    downloadUrl: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// apps/api/__tests__/fixtures/api-client.ts
export function createMockRequest(overrides?: Partial<Request>): Request {
  return {
    body: { url: 'https://example.com', viewports: ['desktop'] },
    params: {},
    ...overrides,
  } as Request;
}
```

---

*Testing analysis: 2026-03-12*
