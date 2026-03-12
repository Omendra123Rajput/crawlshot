# Coding Conventions

**Analysis Date:** 2026-03-12

## Naming Patterns

**Files:**
- TypeScript files: `camelCase.ts` for utilities, `PascalCase.tsx` for React components
- Middleware files: `middleware/role-name.ts` (e.g., `middleware/error-handler.ts`, `middleware/cors.ts`)
- Route files: `routes/resource-name.ts` (e.g., `routes/jobs.ts`, `routes/download.ts`)
- Service/utility modules: `camelCase-with-hyphens.ts` (e.g., `ssrf-guard.ts`, `url-normalizer.ts`)
- Examples: `apps/api/src/middleware/validate.ts`, `apps/api/src/routes/jobs.ts`, `packages/crawler/src/ssrf-guard.ts`

**Functions:**
- Camel case: `extractLinks()`, `guardUrl()`, `capturePage()`, `sanitizeFilename()`, `createChildLogger()`
- Exported factory/helper functions: camel case with verb prefix: `getRedisConnection()`, `getCrawlQueue()`, `getJob()`
- Async functions explicitly return promises: `async function main() { ... }`
- Wrapper functions use clear purpose names: `asyncHandler()`, `validateBody()`

**Variables:**
- Camel case for all variables: `const jobId = uuidv4()`, `let outputPath = safePath(...)`
- Constants: ALL_CAPS with underscores: `BLOCKED_CIDRS`, `BLOCKED_HOSTNAMES`, `MAX_PAGES`, `MAX_ZIP_SIZE_MB`
- Set/Map collection types: descriptive names: `const visited = new Set<string>()`, `const allowedOrigins = config.ALLOWED_ORIGINS.split(',')`
- Boolean variables: `hasViewport`, `isAllowed()`, `isLoading`

**Types:**
- Interfaces: PascalCase prefixed with context: `JobRecord`, `SSEEvent`, `CreateJobRequest`, `JobResponse`
- Union types: `type JobStatus = 'queued' | 'crawling' | 'capturing' | 'packaging' | 'completed' | 'failed'`
- Custom error classes: PascalCase with `Error` suffix: `SSRFBlockedError`, `PageCaptureError`, `JobNotFoundError`, `AppError`
- Type exports in barrel files: `export type { CrawlJobData, ScreenshotJobData }`

## Code Style

**Formatting:**
- Language: TypeScript with strict mode enabled (`strict: true` in all `tsconfig.json`)
- No explicit linter config found (ESLint, Prettier not configured)
- Standard formatting observed: 2-space indentation, semicolons, no trailing commas in single-line constructs
- Example from `apps/api/src/routes/jobs.ts`:
  ```typescript
  const createJobSchema = z.object({
    url: z
      .string()
      .url('Must be a valid URL')
      .max(MAX_URL_LENGTH, `URL must be at most ${MAX_URL_LENGTH} characters`)
      .refine((url) => url.startsWith('https://'), 'URL must use HTTPS'),
    viewports: z
      .array(z.enum(['desktop', 'mobile']))
      .min(1, 'At least one viewport required')
      .default(['desktop', 'mobile']),
  });
  ```

**Linting:**
- TypeScript strict mode: `strict: true` enforces type safety
- No external linter rules detected
- Compilation with `tsc --noEmit` validates types in CI

## Import Organization

**Order:**
1. Node.js built-in modules (`import fs from 'fs/promises'`, `import path from 'path'`)
2. Third-party packages (`import express from 'express'`, `import { z } from 'zod'`)
3. Internal package imports (`import { logger } from '@screenshot-crawler/utils'`, `import { config } from '../config'`)
4. Local relative imports (`import { corsMiddleware } from './middleware/cors'`, `import jobsRouter from './routes/jobs'`)

Examples from codebase:
- `apps/api/src/index.ts`: Node built-ins → middleware packages → local middleware
- `apps/api/src/routes/jobs.ts`: Express → zod → uuid → local/workspace packages → local services
- `packages/crawler/src/index.ts`: p-throttle → local modules → workspace utilities

**Path Aliases:**
- Front-end: `@/components/...`, `@/lib/...` (Next.js 14 App Router convention)
- Workspace imports: `@screenshot-crawler/utils`, `@screenshot-crawler/queue`, `@screenshot-crawler/crawler`, `@screenshot-crawler/storage`, `@screenshot-crawler/screenshot-engine`
- Example: `import { logger } from '@screenshot-crawler/utils'` used across all packages

## Error Handling

**Patterns:**
- Custom error classes extend built-in `Error`: `class SSRFBlockedError extends Error { ... }`
- Custom errors include `name` property: `this.name = 'SSRFBlockedError'`
- Express-specific: Create hierarchy of `AppError` with `statusCode` and `code` properties
  ```typescript
  export class AppError extends Error {
    public readonly statusCode: number;
    public readonly code: string;
    constructor(message: string, statusCode: number, code: string) { ... }
  }
  ```
- Specialized errors inherit from `AppError`: `SSRFBlockedError`, `ValidationError`, `JobNotFoundError`, `ZipSizeLimitError`, `PageCaptureError`
- Error handler middleware checks `instanceof AppError` and responds with `{ error: { code, message } }`
- Async errors in Express wrapped with `asyncHandler()` to forward to centralized error handler
- Try-catch for external operations with fallback logging: `catch (error) { logger.warn(...) }`

## Logging

**Framework:** Pino (`pino` package v9.0.0+)

**Patterns:**
- Logger exported from `packages/utils/src/logger.ts` as singleton `logger`
- Child loggers created with context: `const log = logger.child({ jobId, baseUrl })`
- Log levels used: `debug`, `info`, `warn`, `error`
- All log calls include structured object with context: `logger.info({ port, env }, 'API server started')`
- Security-sensitive info logged at warn/error level with limited context: `logger.warn({ hostname, blockedIp }, 'SSRF guard blocked request')`
- Errors logged with message and stack: `logger.error({ error: err.message, stack: err.stack }, 'Unhandled error')`
- Example from `packages/crawler/src/index.ts`:
  ```typescript
  log.info('robots.txt loaded');
  log.info({ sitemapSeeds: queue.length }, 'Sitemap URLs seeded');
  log.debug({ url }, 'Blocked by robots.txt');
  log.warn({ url, ip: error.blockedIp }, 'SSRF blocked');
  ```

## Comments

**When to Comment:**
- Comments used sparingly; code intent expressed through function/variable names
- Inline comments clarify non-obvious logic:
  ```typescript
  // Hard timeout for the entire capture
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Capture hard timeout exceeded')), CAPTURE_HARD_TIMEOUT_MS);
  });
  ```
- Section headers in sequential code: `// 1. Navigate`, `// 2. Wait for DOM`, `// 3. Scroll to trigger lazy loading`
- Comments explain security measures: `// Path traversal guard`, `// SSRF guard`, `// Double-check resolved path`

**JSDoc/TSDoc:**
- Not enforced; minimal use observed
- Type safety provided by TypeScript strict mode instead
- No @param/@returns documentation in examples

## Function Design

**Size:**
- Functions are compact and focused (10-50 lines typical)
- Long sequential operations broken into named helper functions
- Example: `captureWithTimeout()` extracted from `capturePage()` for clarity

**Parameters:**
- Avoid long parameter lists; use objects for multiple related params
- Use type annotations: `function validateBody(schema: ZodSchema)`
- Optional parameters default in destructuring or function signature
- Example: `async function retry<T>(fn: () => Promise<T>, maxRetries: number = 2, baseDelayMs: number = 3000)`

**Return Values:**
- Explicit return types on all functions: `function cn(...inputs: ClassValue[]): string`
- Async functions return `Promise<T>`: `async function capturePage(...): Promise<string>`
- Error-first pattern avoided; errors thrown/caught explicitly
- Void returns used for middleware/handlers: `function errorHandler(...): void`

## Module Design

**Exports:**
- Barrel files aggregate exports: `packages/queue/src/index.ts` exports all queue functions
- Named exports preferred: `export { logger, createChildLogger }`
- Type exports separated: `export type { CrawlJobData }`
- Default exports used for routers only: `export default router` in `apps/api/src/routes/*.ts`

**Barrel Files:**
- Location: `src/index.ts` in each package
- Purpose: Clean public API surface
- Example: `packages/crawler/src/index.ts` exports guard, normalizer, parsers, and main `crawlSite()` function
- Pattern: `export { named }` for functions, `export type { TypeName }` for types

**Class Usage:**
- Used for custom errors with inheritance hierarchy
- Used for stateful modules: `RobotsParser` class with `fetch()` and `isAllowed()` methods
- Singleton pattern for logger: `export const logger = pino({...})`
- Avoid class-based service patterns; prefer functional modules

## TypeScript Configuration

**Global Settings (apps/*/tsconfig.json, packages/*/tsconfig.json):**
- `target: ES2022` for modern async/await
- `module: commonjs` for Node.js runtime
- `strict: true` enforces null checks and type safety
- `esModuleInterop: true` allows `import express from 'express'` syntax
- `skipLibCheck: true` speeds up builds
- `forceConsistentCasingInFileNames: true`
- `resolveJsonModule: true` allows `import config from 'config.json'`
- `declaration: true` generates `.d.ts` files for public packages
- `sourceMap: true` for debugging
- Watched directories: `rootDir: src`, `include: ["src"]`

## React/Next.js Conventions (apps/web)

**Use Client Components:**
- Form components marked with `'use client'` directive: `apps/web/components/scan-form.tsx`
- Client-side state with hooks: `useState()`, `useRouter()`, `useRef()`, `useEffect()`

**Component Structure:**
- Default export as functional component: `export default function ScanForm() { ... }`
- Props passed as object type: `interface JobProgressProps { ... }`
- Inline helper components below main export: `function FeatureCard({ ... }) { ... }`
- Class names combined with utility library: `cn()` function from `lib/utils.ts`

**Styling:**
- Tailwind CSS with CSS variables for theming: `className="text-[var(--text-primary)]"`
- Custom CSS classes for gradients: `className="gradient-text"`, `className="accent-gradient"`
- Glassmorphism components: `className="glass glass-hover"`

---

*Convention analysis: 2026-03-12*
